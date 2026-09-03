"""업로드한 원본 엑셀 vs 앱에서 내려받은 엑셀 — 전 행/전 컬럼 대조.

의도적으로 정규화하는 두 가지:
  1) 제안일 표기 — 원본에 '2026. 02. 2' / '2026. 02.01' / '2026.04.01' 이 섞여 있어
     앱은 'YYYY. MM. D' 한 형태로 통일해서 내보냅니다.
  2) 금액 — 원본 6개 행이 소수점(예: 1,666,666.667원)이라 앱은 원 단위로 반올림합니다.
  3) Added Value·프로모션 — 앞쪽 기준 이름으로 통일합니다
     (예: "소노리조트 라이트(750만원)" → "소노리조트", "신규광고주(25.4Q)" → "신규광고주").
"""
import sys, re, collections, openpyxl

src, out = sys.argv[1], sys.argv[2]
COLS = ["NO","제안일","제안월","집행(예정)월","매출월","제안/수주","채널","미디어렙","대행사","상품",
        "업종","광고주","브랜드","금액(원)","Basic 총예산","비고","Added Value 활용","프로모션 적용여부"]
AMT = 12   # 제안일=0 … 금액(원)=12 (NO 열 제외)
AV, PROMO = 15, 16          # Added Value 활용, 프로모션 적용여부
BASE = {                    # 앱이 "앞쪽 기준 이름"으로 통일하는 선택 항목
    AV:    ["소노리조트", "약국미디어보드", "카카오VX", "이마트DOOH"],
    PROMO: ["신규광고주", "제안프로모션", "공공지자체", "증액프로모션", "커머스링크"],
}

def normalize_choice(v, i):
    v = (v or "").strip()
    for base in sorted(BASE.get(i, []), key=len, reverse=True):
        if v == base or v.startswith(base):
            return base
    return v

def header(p):
    ws = openpyxl.load_workbook(p, data_only=True).worksheets[0]
    return [str(ws.cell(1, c).value or "").strip() for c in range(1, ws.max_column + 1)]

def load(p):
    ws = openpyxl.load_workbook(p, data_only=True).worksheets[0]
    rows = []
    for r in range(2, ws.max_row + 1):
        vals = [ws.cell(r, c).value for c in range(2, 19)]
        if not any(v is not None and str(v).strip() for v in vals):
            continue
        row = []
        for i, v in enumerate(vals):
            if i == AMT:
                row.append(round(float(v or 0)))
            elif i == 0:
                s = "" if v is None else str(v)
                m = re.match(r"(\d{4})[.\s]*(\d{1,2})[.\s]*(\d{1,2})", s)
                row.append("%s.%s.%s" % (m.group(1), int(m.group(2)), int(m.group(3))) if m else s.strip())
            elif i in BASE:
                row.append(normalize_choice("" if v is None else str(v), i))
            else:
                row.append("" if v is None else str(v).strip())
        rows.append(tuple(row))
    return rows

fails = []
def ok(name, cond, extra=""):
    print(("  PASS  " if cond else "  FAIL  ") + name + (" — " + str(extra) if extra else ""))
    if not cond: fails.append(name)

h1, h2 = header(src), header(out)
r1, r2 = load(src), load(out)
c1, c2 = collections.Counter(r1), collections.Counter(r2)
missing, extra = list((c1 - c2).elements()), list((c2 - c1).elements())

ok("헤더 18개 컬럼 동일", h2 == COLS and h1 == COLS, "" if h1 == h2 else str(h2))
ok("행 수 동일", len(r1) == len(r2), f"원본 {len(r1):,} / 내려받기 {len(r2):,}")
ok("모든 행의 17개 값이 원본과 일치", not missing and not extra, f"누락 {len(missing)} / 추가 {len(extra)}")
for m in missing[:3]: print("     누락 예시:", m)
for m in extra[:3]:   print("     차이 예시:", m)
ok("금액 합계 동일",
   sum(x[AMT] for x in r1) == sum(x[AMT] for x in r2),
   f"{sum(x[AMT] for x in r1):,}원")
ws_out = openpyxl.load_workbook(out).worksheets[0]
ok("NO 열 1부터 순번 재부여", [ws_out.cell(r, 1).value for r in range(2, 7)] == [1, 2, 3, 4, 5])

print("\n엑셀 왕복 검증: " + ("모두 통과" if not fails else f"실패 {len(fails)}건 — " + ", ".join(fails)))
sys.exit(1 if fails else 0)

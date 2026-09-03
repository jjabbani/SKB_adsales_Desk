"""public/index.html → 아티팩트 미리보기용 데모 페이지 생성.

바뀌는 것은 셋뿐입니다.
  1) Supabase 클라이언트 → 브라우저 메모리 안에서 도는 가짜 클라이언트 (26년 1,154행 미리 적재)
  2) 로그인 화면 건너뛰고 마스터 계정으로 자동 진입
  3) 상단에 미리보기 안내 띠 + 내려받기 버튼은 안내 토스트로 대체(샌드박스가 다운로드를 막음)
앱 화면·로직·CSS는 배포본과 완전히 동일합니다.
"""
import re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / "public/index.html").read_text(encoding="utf-8")
seed = (ROOT / "build/seed.json").read_text(encoding="utf-8")

# --- 1) 문서 래퍼 제거 (아티팩트가 head/body를 감싸줌) ---
html = html.replace('<!doctype html>\n<html lang="ko">\n<head>\n', "")
html = re.sub(r'<meta charset="utf-8">\n<meta name="viewport"[^>]*>\n', "", html)
html = html.replace("</head>\n<body>\n", "")
html = html.replace("</body>\n</html>\n", "")

# --- 2) Supabase CDN → 가짜 클라이언트 ---
FAKE = r"""<script>
/* ===== 미리보기 전용 가짜 Supabase (브라우저 메모리) ===== */
(function(){
  const DB = {
    profiles: [{ id:"demo-me", name:"김현수", role:"master" }],
    sales_rows: window.__SEED || [],
    app_settings: [
      { key:"channel", items:["미디어렙", "대행사", "광고주", "Programmatic", "인포", "교환", "지역광고", "기타"] },
      { key:"rep", items:["나스미디어", "딜라이브", "KOBACO", "APM", "애드크래프트", "스카이라이프", "모아미디어", "인크로스", "메조미디어", "DMC미디어", "리노컴즈", "HCN", "이펙트원", "휴앤아이", "미디어에스", "다트미디어", "파스텔애드", "메인애드", "웰메이드씨존", "JCN울산방송", "어니스트컴퍼니", "미디어747", "드림에이지이", "케이티이엔에이", "애드고온", "디지털퍼스트", "페이백헬스케어", "애드원", "인포벨", "지에스", "이노바인코리아", "문화미디어렙", "KICAD", "프라이머스", "리얼투데이", "DK텔레콤", "엠투미디어", "바이메이더", "IGA웍스", "KPPL"] },
      { key:"product", items:["AD+", "Addr.Tv", "Basic", "C-실시간", "C-VOD", "VOD", "커머스", "온애드", "티온", "비즈챗", "지역", "ASUM", "시니어", "기타"] },
      { key:"industry", items:["기타", "제약 및 의료", "관공서 및 단체", "요식업", "서비스", "식음료", "건설,건재 및 부동산", "그룹 및 기업광고", "가정용품", "금융,보험 및 증권", "컴퓨터 및 정보통신", "유통", "교육 및 복지후생", "화장품 및 보건용품", "패션", "전기전자", "자동차"] },
      { key:"promotion", items:["신규광고주", "제안프로모션", "공공지자체", "증액프로모션", "커머스링크"] },
      { key:"added_value", items:["소노리조트", "약국미디어보드", "카카오VX", "이마트DOOH"] },
      { key:"years", items:[] }
    ]
  };
  const uuid = () => "n" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const fiscal = r => Number(String(r.revenue_month || r.propose_month || "").slice(0,4)) || 0;
  const session = { user:{ id:"demo-me", email:"demo@company.com", user_metadata:{ name:"김현수" } } };
  const ready = new Promise(res => { if(document.readyState === "complete") res(); else window.addEventListener("load", res); });

  function builder(table){
    const st = { op:"select", filters:[], from:0, to:1e9, order:null, payload:null, single:false, count:false, head:false };
    const api = {
      select(_c, opt){ if(opt && opt.count) st.count = true; if(opt && opt.head) st.head = true; return api; },
      insert(v){ st.op="insert"; st.payload = Array.isArray(v)?v:[v]; return api; },
      update(v){ st.op="update"; st.payload=v; return api; },
      delete(){ st.op="delete"; return api; },
      eq(k,v){ st.filters.push([k,v]); return api; },
      order(k,o){ st.order=[k, o && o.ascending===false ? -1 : 1]; return api; },
      range(a,b){ st.from=a; st.to=b; return api; },
      maybeSingle(){ st.single=true; return api; },
      then(res,rej){ return run().then(res,rej); }
    };
    const match = row => st.filters.every(([k,v]) => String(row[k]) === String(v));
    async function run(){
      const T = DB[table];
      if(st.op==="insert"){
        const now = new Date().toISOString();
        const added = st.payload.map(p=>{ const r = Object.assign({ id:uuid(), created_at:now, updated_at:now }, p); if(table==="sales_rows") r.fiscal_year = fiscal(r); return r; });
        T.push(...added); return { data:added, error:null };
      }
      if(st.op==="update"){
        let n = 0;
        T.forEach((r,i)=>{ if(match(r)){ Object.assign(T[i], st.payload); if(table==="sales_rows") T[i].fiscal_year = fiscal(T[i]); n++; } });
        if(!n && table==="app_settings") return { data:null, error:{ message:"no row" } };
        return { data:null, error:null };
      }
      if(st.op==="delete"){
        for(let i=T.length-1;i>=0;i--) if(match(T[i])) T.splice(i,1);
        return { data:null, error:null };
      }
      let rows = T.filter(match);
      if(st.count) return { data: st.head ? null : rows, count: rows.length, error:null };
      if(st.order) rows = rows.slice().sort((a,b)=>String(a[st.order[0]]).localeCompare(String(b[st.order[0]]))*st.order[1]);
      rows = rows.slice(st.from, st.to+1);
      return { data: st.single ? (rows[0]||null) : rows, error:null };
    }
    return api;
  }
  window.supabase = { createClient(){ return {
    auth:{
      /* 실제 앱에서는 로그인 버튼을 누른 뒤 부팅되므로, 데모도 스크립트가 모두 로드된 뒤 부팅 */
      async getSession(){ await ready; return { data:{ session } }; },
      onAuthStateChange(){ return { data:{ subscription:{ unsubscribe(){} } } }; },
      async signUp(){ return { data:{}, error:null }; },
      async signInWithPassword(){ return { data:{ session }, error:null }; },
      async signOut(){ return { error:null }; }
    },
    from: t => builder(t),
    async rpc(name){
      if(name === "sales_years"){
        const ys = [...new Set(DB.sales_rows.map(r=>r.fiscal_year).filter(Boolean))].sort();
        return { data: ys.map(y=>({ y })), error:null };
      }
      return { data:null, error:{ message:"unknown rpc" } };
    },
    channel(){ return { on(){ return this; }, subscribe(){ return this; } }; },
    removeChannel(){}
  }; } };
})();
</script>"""

html = re.sub(r'<script src="https://cdn\.jsdelivr\.net/npm/@supabase[^"]*"></script>',
              '<script>window.__SEED = ' + seed + ';</script>\n' + FAKE, html)

# --- 3) 미리보기 안내 띠 ---
BANNER = """<div class="demo-bar">
  <b>미리보기 (데모)</b> — 25년 2,545건 + 26년 1,165건, 총 3,710건이 올라간 상태이며 <b>마스터 권한</b>으로 열려 있습니다.
  등록·수정·삭제·검색·설정 모두 실제와 동일하게 동작하고, 변경 내용은 이 브라우저 안에만 남아 새로고침하면 초기 상태로 돌아갑니다.
</div>
"""
html = html.replace('<div id="authView">', BANNER + '<div id="authView" class="hide">')

# --- 4) 데모 안내 띠 스타일 (앱 토큰 재사용) ---
html = html.replace(".hide{display:none !important}", """.hide{display:none !important}
.demo-bar{background:#fff8e6;border-bottom:1px solid #f0e0b8;color:#7a5a12;
  padding:8px 18px;font-size:12.5px;text-align:center;line-height:1.45}
.demo-bar b{color:#8a5a00}""")

# --- 5) 내려받기 버튼: 샌드박스가 다운로드를 막으므로 안내로 대체 ---
html = html.replace('$("btnDownload").onclick = exportExcel;',
  '$("btnDownload").onclick = ()=>toast("미리보기에서는 파일 내려받기가 차단됩니다 — 배포 후에는 정상 동작합니다.");')

out = ROOT / "build/매출관리데스크_미리보기.html"
out.write_text(html, encoding="utf-8")
print(out.name, len(html)//1024, "KB")

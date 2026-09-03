<script>
/* ===================== 월별 집계 =====================
   제안 = 제안월 기준 / 수주 = 매출월 기준
   열 순서는 기준 월(올해면 이번 달)부터 왼쪽으로, 미도래 월은 기본 숨김
   ==================================================== */
/** 아직 도래하지 않은 월의 시작 번호 (올해가 아니면 미도래 월 없음) */
function lastRealMonth(){
  const now = new Date();
  return YEAR === now.getFullYear() ? (now.getMonth()+1) : 12;
}
/** 화면에 그릴 월 키 목록 — 최신 월이 맨 왼쪽 */
function monthKeys(){
  const ref = lastRealMonth();
  const out = [];
  for(let m=12;m>=1;m--){
    if(m > ref && !PV.showFuture) continue;
    out.push(`${YEAR}-${String(m).padStart(2,"0")}`);
  }
  return out;
}
/** 미도래 월 토글 버튼 문구 */
function syncFutureBtns(){
  const ref = lastRealMonth();
  const hidden = [];
  for(let m=ref+1;m<=12;m++) hidden.push(m+"월");
  const label = !hidden.length ? ""
    : (PV.showFuture ? `▴ 미도래 월 숨기기 (${hidden.join("·")})`
                     : `▾ 미도래 월 보기 (${hidden.join("·")})`);
  ["btnFuture1","btnFuture2"].forEach(id=>{
    const b = $(id);
    b.textContent = label;
    b.classList.toggle("hide", !hidden.length);
  });
}

function monthAgg(){
  const months = monthKeys();
  const map = {}; months.forEach(m=> map[m] = { m, pc:0, pa:0, wc:0, wa:0 });
  const ref = lastRealMonth();
  const hiddenLbl = [];
  for(let m=ref+1;m<=12;m++) hiddenLbl.push(m+"월");
  const hidden  = { m:"숨김", label:hiddenLbl.join("·"), pc:0, pa:0, wc:0, wa:0 };  // 올해 안이지만 접어둔 미도래 월
  const outside = { m:"기타", label:"연도 외",            pc:0, pa:0, wc:0, wa:0 };  // 다른 연도 제안월
  const bucket = ym => map[ym] || (String(ym||"").startsWith(YEAR+"-") ? hidden : outside);

  ROWS.forEach(r=>{
    const amt = Number(r.amount)||0;
    if(r.stage==="수주"){
      const t = bucket(r.revenue_month); t.wc++; t.wa += amt;
    }else{
      const t = bucket(r.propose_month); t.pc++; t.pa += amt;
    }
  });
  const list = months.map(m=>map[m]);
  if(hidden.pc || hidden.wc)   list.push(hidden);
  if(outside.pc || outside.wc) list.push(outside);
  return list;
}
const monthCap = r => (typeof r === "object")
  ? (r.label || Number(r.m.slice(5))+"월")
  : (r==="기타" ? "연도 외" : Number(r.slice(5))+"월");

/* =====================================================================
   현재월(선택 월) 현황 — 첫 화면
   제안 = 제안월 기준 / 수주 = 매출월 기준, 상위 10은 수주 금액 기준
   ===================================================================== */
let CUR_MONTH = "";

/** 기본 기준월: 올해면 이번 달, 아니면 그 해에서 수주가 있는 마지막 달 */
function defaultMonth(){
  const now = new Date();
  if(YEAR === now.getFullYear()) return `${YEAR}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const has = ROWS.filter(r=>r.stage==="수주" && r.revenue_month && r.revenue_month.startsWith(YEAR+"-"))
                  .map(r=>r.revenue_month).sort();
  return has.length ? has[has.length-1] : `${YEAR}-12`;
}

function syncMonthPicker(){
  const sel = $("curMonth");
  sel.innerHTML = Array.from({length:12},(_,i)=>{
    const k = `${YEAR}-${String(i+1).padStart(2,"0")}`;
    return `<option value="${k}">${YEAR}년 ${i+1}월</option>`;
  }).join("");
  if(!CUR_MONTH || !CUR_MONTH.startsWith(YEAR+"-")) CUR_MONTH = defaultMonth();
  sel.value = CUR_MONTH;
}

function renderCurrent(){
  syncMonthPicker();
  const mNum = Number(CUR_MONTH.slice(5));
  $("tabDashLabel").textContent = mNum + "월 현황";
  $("curTitle").textContent = `${YEAR}년 ${mNum}월 현황`;

  const prop = ROWS.filter(r=>r.stage==="제안" && r.propose_month===CUR_MONTH);
  const win  = ROWS.filter(r=>r.stage==="수주" && r.revenue_month===CUR_MONTH);
  const pa = prop.reduce((s,r)=>s+(Number(r.amount)||0),0);
  const wa = win.reduce((s,r)=>s+(Number(r.amount)||0),0);
  const rate = (pa+wa) ? (wa/(pa+wa)*100) : 0;

  const tile = (cls,t,v,s2)=>`<div class="kpi ${cls}"><div class="t">${t}</div><div class="v">${v}</div><div class="s">${s2}</div></div>`;
  $("kpis").innerHTML =
      tile("prop","제안 건수", comma(prop.length)+"건", `${mNum}월 제안월 기준`)
    + tile("prop","제안 금액", comma(pa)+"원", shortWon(pa))
    + tile("win","수주 건수",  comma(win.length)+"건", `${mNum}월 매출월 기준`)
    + tile("win","수주 금액",  comma(wa)+"원", `${shortWon(wa)} · 수주율(금액) ${rate.toFixed(1)}%`);

  renderTop10("topProduct", win, "product", "상품");
  renderTop10("topChannel", win, "channel", "채널");
  renderTop10("topRep",     win, "rep",     "미디어렙");
}

/** 그 달 수주 건을 항목별로 묶어 금액 상위 10개 */
function renderTop10(elId, rows, key, label){
  const map = {};
  rows.forEach(r=>{
    const k = (r[key]||"").trim() || "(미입력)";
    const t = map[k] || (map[k] = { k, a:0, c:0 });
    t.a += Number(r.amount)||0; t.c++;
  });
  const all = Object.values(map).sort((x,y)=>y.a-x.a);
  const total = all.reduce((s,r)=>s+r.a,0);
  const top = all.slice(0,10);

  if(!top.length){
    $(elId).innerHTML = `<tbody><tr><td class="empty">${label}별 수주 데이터가 없습니다.</td></tr></tbody>`;
    return;
  }
  const max = top[0].a || 1;
  const body = top.map((r,i)=>`<tr>
      <td class="rank">${i+1}</td>
      <td class="dim" style="min-width:120px">
        <div>${esc(r.k)}</div>
        <div class="mini"><i style="width:${(r.a/max*100).toFixed(1)}%"></i></div>
      </td>
      <td class="num" style="font-weight:700">${comma(r.a)}</td>
      <td class="num" style="color:var(--muted)">${total?((r.a/total*100).toFixed(1)):"0.0"}%</td>
    </tr>`).join("");
  const rest = all.length > 10
    ? `<tr><td class="rank"></td><td class="dim" style="color:var(--muted)">그 외 ${comma(all.length-10)}개</td>
       <td class="num" style="color:var(--muted)">${comma(all.slice(10).reduce((s,r)=>s+r.a,0))}</td>
       <td class="num" style="color:var(--muted)">${(all.slice(10).reduce((s,r)=>s+r.a,0)/total*100).toFixed(1)}%</td></tr>` : "";

  $(elId).innerHTML =
    `<thead><tr><th class="nos"></th><th class="nos">${label}</th>
      <th class="num nos">수주 금액</th><th class="num nos">비중</th></tr></thead>`
    + `<tbody>${body}${rest}
       <tr class="tot"><td class="rank"></td><td class="dim">합계</td>
         <td class="num">${comma(total)}</td><td class="num">100%</td></tr></tbody>`;
}

function renderMonthTable(){
  syncFutureBtns();
  const rows = monthAgg();
  const tp = rows.reduce((s,r)=>s+r.pa,0), tw = rows.reduce((s,r)=>s+r.wa,0);
  const tpc = rows.reduce((s,r)=>s+r.pc,0), twc = rows.reduce((s,r)=>s+r.wc,0);
  const head = `<thead><tr><th class="nos dim">구분</th>
    ${rows.map(r=>`<th class="num nos">${monthCap(r)}</th>`).join("")}
    <th class="num nos">합계</th></tr></thead>`;
  const line = (label,vals,total,cls) =>
    `<tr><td class="dim" style="${cls||''}">${label}</td>${vals.map(v=>`<td class="num">${v}</td>`).join("")}<td class="num" style="font-weight:800;background:#f7f9fc">${total}</td></tr>`;
  $("monthTbl").innerHTML = head + "<tbody>"
    + line("제안 건수", rows.map(r=>r.pc?comma(r.pc):"-"), comma(tpc), "color:var(--prop)")
    + line("제안 금액", rows.map(r=>r.pa?comma(r.pa):"-"), comma(tp),  "color:var(--prop)")
    + line("수주 건수", rows.map(r=>r.wc?comma(r.wc):"-"), comma(twc), "color:var(--win)")
    + line("수주 금액", rows.map(r=>r.wa?comma(r.wa):"-"), comma(tw),  "color:var(--win)")
    + line("수주율(금액)", rows.map(r=>{const t=r.pa+r.wa; return t?((r.wa/t*100).toFixed(0)+"%"):"-";}),
           ((tp+tw)?((tw/(tp+tw))*100).toFixed(1):"0.0")+"%")
    + "</tbody>";
}

/* ===================== 차트 (그룹 막대) ===================== */
function renderChart(){
  const host = $("chart");
  const rows = monthAgg();
  const W = Math.max(560, host.clientWidth || 900), H = 260;
  const P = { t:14, r:12, b:26, l:58 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const max = Math.max(1, ...rows.map(r=>Math.max(r.pa, r.wa)));
  const step = niceStep(max), top = Math.ceil(max/step)*step;
  const y = v => P.t + ih - (v/top)*ih;
  const band = iw / rows.length;
  const bw = Math.max(6, Math.min(22, band*0.32));
  const GAP = 2;

  let g = "";
  for(let v=0; v<=top; v+=step){
    g += `<line x1="${P.l}" x2="${W-P.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#eef1f6" stroke-width="1"/>`;
    g += `<text x="${P.l-8}" y="${(y(v)+4).toFixed(1)}" text-anchor="end" font-size="10.5" fill="#6b7688">${v?shortWon(v):0}</text>`;
  }
  rows.forEach((r,i)=>{
    const cx = P.l + band*i + band/2;
    g += bar(cx - bw - GAP/2, y(r.pa), bw, P.t+ih-y(r.pa), "var(--prop-mark)");
    g += bar(cx + GAP/2,      y(r.wa), bw, P.t+ih-y(r.wa), "var(--win-mark)");
    g += `<text x="${cx}" y="${H-8}" text-anchor="middle" font-size="10.5" fill="#6b7688">${monthCap(r)}</text>`;
    g += `<rect class="hitzone" x="${(P.l+band*i).toFixed(1)}" y="${P.t}" width="${band.toFixed(1)}" height="${ih}"
            fill="transparent" data-i="${i}" style="cursor:pointer"/>`;
  });
  g += `<line x1="${P.l}" x2="${W-P.r}" y1="${P.t+ih}" y2="${P.t+ih}" stroke="#d7dde8" stroke-width="1"/>`;

  host.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="월별 제안 및 수주 금액 그룹 막대 그래프">${g}</svg><div id="tip" class="hide"></div>`;

  const tip = $("tip");
  tip.style.cssText = "position:absolute;background:#1b2230;color:#fff;padding:8px 11px;border-radius:8px;font-size:12px;pointer-events:none;z-index:50;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.22)";
  host.style.position = "relative";
  host.querySelectorAll(".hitzone").forEach(z=>{
    z.addEventListener("mousemove", e=>{
      const r = rows[Number(z.dataset.i)];
      const t = r.pa + r.wa;
      tip.classList.remove("hide");
      tip.innerHTML = `<b>${r.label ? r.label+(r.m==="숨김"?" (접힘)":"") : YEAR+"년 "+Number(r.m.slice(5))+"월"}</b><br>`
        + `<span style="color:#f6b28e">■</span> 제안 ${comma(r.pc)}건 · ${comma(r.pa)}원<br>`
        + `<span style="color:#8fc0f2">■</span> 수주 ${comma(r.wc)}건 · ${comma(r.wa)}원<br>`
        + `수주율(금액) ${t?((r.wa/t*100).toFixed(1)):"0.0"}%`;
      const b = host.getBoundingClientRect();
      let x = e.clientX - b.left + 12, ytp = e.clientY - b.top + 12;
      if(x + 210 > b.width) x = b.width - 214;
      tip.style.left = x+"px"; tip.style.top = ytp+"px";
    });
    z.addEventListener("mouseleave", ()=> tip.classList.add("hide"));
  });
}
function bar(x, yTop, w, h, fill){
  if(h <= 0.5) return "";
  const r = Math.min(4, w/2, h);
  return `<path d="M${x} ${yTop+h} L${x} ${yTop+r} Q${x} ${yTop} ${x+r} ${yTop}
    L${x+w-r} ${yTop} Q${x+w} ${yTop} ${x+w} ${yTop+r} L${x+w} ${yTop+h} Z" fill="${fill}"/>`;
}
function niceStep(max){
  const raw = max/4, p = Math.pow(10, Math.floor(Math.log10(raw||1)));
  const n = raw/p;
  return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p;
}

/* =====================================================================
   수주 분석 — 매출월 기준, 수주 건만
   행 = 선택한 구분(미디어렙/채널/상품/업종…), 열 = 1~12월 + 합계
   ===================================================================== */
const PV_LABEL = {
  rep:"미디어렙", channel:"채널", product:"상품", industry:"업종", agency:"대행사",
  advertiser:"광고주", brand:"브랜드", promotion:"프로모션", added_value:"Added Value",
  created_name:"등록자"
};

/** 항목 검색을 노출할 구분 기준 (항목 수가 많은 것만) */
const PV_SEARCHABLE = ["rep","agency","advertiser","brand"];
/** 미입력 값을 집계에서 빼는 구분 기준 */
const PV_DROP_EMPTY = ["rep"];

function renderPivot(){
  const dim = PV.dim, isAmt = PV.value==="amount";
  const sel = $("pvDim").selectedOptions[0];
  $("pvDimName").textContent = sel ? sel.text : PV_LABEL[dim];
  $("pvQBox").classList.toggle("hide", !PV_SEARCHABLE.includes(dim));
  syncFutureBtns();

  const cols = PV.month ? [PV.month] : monthKeys();

  const q = PV.q.trim().toLowerCase();
  const map = {};
  let outCount = 0;
  ROWS.forEach(r=>{
    if(r.stage!=="수주") return;
    if(!cols.includes(r.revenue_month)){ if(!PV.month) outCount++; return; }
    const raw = (r[dim]||"").trim();
    if(!raw && PV_DROP_EMPTY.includes(dim)) return;   // 미디어렙사별은 미입력 제외
    const k = raw || "(미입력)";
    if(q && PV_SEARCHABLE.includes(dim) && !k.toLowerCase().includes(q)) return;
    const t = map[k] || (map[k] = { k, c:{}, a:{}, tc:0, ta:0 });
    const amt = Number(r.amount)||0;
    t.c[r.revenue_month] = (t.c[r.revenue_month]||0)+1;
    t.a[r.revenue_month] = (t.a[r.revenue_month]||0)+amt;
    t.tc++; t.ta += amt;
  });
  const list = Object.values(map).sort((x,y)=> isAmt ? y.ta-x.ta : y.tc-x.tc);

  if(!list.length){
    $("pivotTbl").innerHTML = "";
    $("pivotEmpty").classList.remove("hide");
    $("pvInfo").textContent = "";
    return;
  }
  $("pivotEmpty").classList.add("hide");

  const grandT = list.reduce((s,r)=>s+(isAmt?r.ta:r.tc),0) || 1;
  const cell = (v)=> v ? comma(v) : "-";

  const head = `<thead><tr>
      <th class="nos dim">${PV_LABEL[dim]}</th>
      ${cols.map(m=>`<th class="num nos">${Number(m.slice(5))}월</th>`).join("")}
      <th class="num nos">합계</th><th class="num nos">비중</th></tr></thead>`;

  const body = list.map(r=>`<tr>
      <td class="dim">${esc(r.k)}</td>
      ${cols.map(m=>`<td class="num">${cell(isAmt?r.a[m]:r.c[m])}</td>`).join("")}
      <td class="num" style="font-weight:800;background:#f7f9fc">${comma(isAmt?r.ta:r.tc)}</td>
      <td class="num" style="color:var(--muted)">${(((isAmt?r.ta:r.tc)/grandT)*100).toFixed(1)}%</td>
    </tr>`).join("");

  const totRow = `<tr class="tot">
      <td class="dim">합계</td>
      ${cols.map(m=>`<td class="num">${comma(list.reduce((s,r)=>s+((isAmt?r.a[m]:r.c[m])||0),0))}</td>`).join("")}
      <td class="num">${comma(grandT)}</td><td class="num">100%</td></tr>`;

  $("pivotTbl").innerHTML = head + "<tbody>" + body + totRow + "</tbody>";
  const rangeTxt = PV.month
    ? Number(PV.month.slice(5))+"월"
    : cols.map(m=>Number(m.slice(5))+"월").slice(-1)[0] + "~" + cols.map(m=>Number(m.slice(5))+"월")[0];
  $("pvInfo").textContent =
    `${PV_LABEL[dim]} ${comma(list.length)}개 · ${rangeTxt} 수주 `
    + (isAmt ? `합계 ${comma(grandT)}원` : `합계 ${comma(grandT)}건`)
    + (outCount ? ` · 표시 범위 밖 ${comma(outCount)}건 제외` : "")
    + (PV_DROP_EMPTY.includes(dim) ? " · 미입력 제외" : "");
}

/* ===================== 전체 렌더 ===================== */
function render(){
  $("viewDash").classList.toggle("hide", VIEW!=="dash");
  $("viewPivot").classList.toggle("hide", VIEW!=="pivot");
  $("viewCompare").classList.toggle("hide", VIEW!=="compare");
  $("viewList").classList.toggle("hide", VIEW!=="list");
  $("viewSettings").classList.toggle("hide", VIEW!=="settings");
  if(VIEW==="dash") renderCurrent();
  else if(VIEW==="pivot"){ renderChart(); renderMonthTable(); renderPivot(); }
  else if(VIEW==="compare") renderCompare();
  else if(VIEW==="list") renderList();
  else if(VIEW==="settings") renderSettings();
}
window.addEventListener("resize", ()=>{
  if(!ME) return;
  if(VIEW==="pivot") renderChart();
  if(VIEW==="compare" && CMP.dim==="month") renderCompare();
});
</script>

<script>
/* =====================================================================
   연도 비교 — 두 연도의 매출(수주)을 월별·상품별·채널별·미디어렙사별·업종별로 대조
   매출월 기준, 수주 건만 집계합니다.
   ===================================================================== */
let CMP = { a:null, b:null, dim:"month", value:"amount", q:"", same:true };
const CMP_LABEL = { month:"월별", product:"상품별", channel:"채널별", rep:"미디어렙사별", industry:"업종별" };
const CMP_SEARCHABLE = ["rep","product","industry","channel"];

/** 연도별 원본을 한 번만 받아 캐시 (연도 비교에서 두 해를 동시에 씁니다) */
const YEAR_CACHE = {};
async function fetchYearRows(y){
  if(YEAR_CACHE[y]) return YEAR_CACHE[y];
  let out = [];
  for(let from=0; ; from+=1000){
    const { data, error } = await sb.from("sales_rows").select("*")
      .eq("fiscal_year", y).order("propose_date",{ascending:true}).range(from, from+999);
    if(error){ toast("불러오기 실패: "+error.message); break; }
    out = out.concat(data||[]);
    if(!data || data.length < 1000) break;
  }
  YEAR_CACHE[y] = out;
  return out;
}
function clearYearCache(){ for(const k in YEAR_CACHE) delete YEAR_CACHE[k]; }

function syncCompareControls(){
  const list = YEARS.slice();
  if(!list.length) return false;
  if(!CMP.a || !list.includes(CMP.a) || !CMP.b || !list.includes(CMP.b)){
    // 기본값: 비교 연도 = 지금 보고 있는 연도, 기준 연도 = 바로 직전 연도
    CMP.b = list.includes(YEAR) ? YEAR : list[list.length-1];
    const before = list.filter(y=>y < CMP.b);
    const after  = list.filter(y=>y > CMP.b);
    CMP.a = before.length ? before[before.length-1] : (after.length ? after[0] : CMP.b);
  }
  const opts = y => list.map(v=>`<option value="${v}"${v===y?" selected":""}>${v}년</option>`).join("");
  $("cmpA").innerHTML = opts(CMP.a);
  $("cmpB").innerHTML = opts(CMP.b);
  $("cmpLegA").textContent = CMP.a + "년";
  $("cmpLegB").textContent = CMP.b + "년";
  $("cmpDimName").textContent = CMP_LABEL[CMP.dim];
  $("cmpQBox").classList.toggle("hide", !CMP_SEARCHABLE.includes(CMP.dim));
  $("cmpChartBox").classList.toggle("hide", CMP.dim !== "month");

  // 올해와 비교할 때는 "같은 기간(1~이번 달)"만 대조하는 편이 정확합니다
  const now = new Date();
  const cur = [CMP.a, CMP.b].includes(now.getFullYear());
  $("cmpSameBox").classList.toggle("hide", !cur);
  $("cmpSameLbl").textContent = `같은 기간만 비교 (1~${now.getMonth()+1}월)`;
  $("cmpSame").checked = CMP.same;
  return true;
}

/** 한 해의 수주 건을 구분 기준으로 묶기 */
function cmpAgg(rows, dim, maxMonth){
  const map = {};
  rows.forEach(r=>{
    if(r.stage !== "수주") return;
    const mm = Number(String(r.revenue_month||"").slice(5));
    if(maxMonth && (!mm || mm > maxMonth)) return;
    let k;
    if(dim === "month"){
      if(!mm) return;
      k = String(mm);
    }else{
      k = (r[dim]||"").trim();
      if(!k && dim === "rep") return;          // 미디어렙사별은 미입력 제외 (매출 분석과 동일)
      k = k || "(미입력)";
    }
    const t = map[k] || (map[k] = { a:0, c:0 });
    t.a += Number(r.amount)||0; t.c++;
  });
  return map;
}

async function renderCompare(){
  if(!syncCompareControls()) return;
  const { a, b, dim, value, q } = CMP;
  const isAmt = value === "amount";
  const [ra, rb] = await Promise.all([fetchYearRows(a), fetchYearRows(b)]);
  const now = new Date();
  const limit = (CMP.same && [a,b].includes(now.getFullYear())) ? (now.getMonth()+1) : 0;
  const ma = cmpAgg(ra, dim, limit), mb = cmpAgg(rb, dim, limit);

  let keys;
  if(dim === "month"){
    keys = Array.from({length: limit || 12}, (_,i)=>String(i+1));
  }else{
    const set = new Set([...Object.keys(ma), ...Object.keys(mb)]);
    keys = [...set].filter(k => !q || k.toLowerCase().includes(q.toLowerCase()))
                   .sort((x,y)=>((mb[y]?.[isAmt?"a":"c"]||0) - (mb[x]?.[isAmt?"a":"c"]||0))
                              || ((ma[y]?.[isAmt?"a":"c"]||0) - (ma[x]?.[isAmt?"a":"c"]||0)));
  }

  const get = (m,k) => (m[k] ? (isAmt ? m[k].a : m[k].c) : 0);
  const totA = keys.reduce((s,k)=>s+get(ma,k),0);
  const totB = keys.reduce((s,k)=>s+get(mb,k),0);

  if(!totA && !totB){
    $("cmpTbl").innerHTML = ""; $("cmpEmpty").classList.remove("hide");
    $("cmpKpis").innerHTML = ""; $("cmpInfo").textContent = ""; return;
  }
  $("cmpEmpty").classList.add("hide");

  /* KPI — 두 해 총계와 증감 */
  const diff = totB - totA, rate = totA ? (diff/totA*100) : 0;
  const unit = isAmt ? "원" : "건";
  const tile = (cls,t,v,s2)=>`<div class="kpi ${cls}"><div class="t">${t}</div><div class="v">${v}</div><div class="s">${s2}</div></div>`;
  $("cmpKpis").innerHTML =
      tile("prop", a+"년 수주", comma(totA)+unit, isAmt?shortWon(totA):"건수 기준")
    + tile("win",  b+"년 수주", comma(totB)+unit, isAmt?shortWon(totB):"건수 기준")
    + tile("", "증감", (diff>=0?"+":"−")+comma(Math.abs(diff))+unit, `${a}년 대비`)
    + tile("", "증감률", (diff>=0?"+":"−")+Math.abs(rate).toFixed(1)+"%",
           totA ? `${isAmt?shortWon(totA):comma(totA)+"건"} → ${isAmt?shortWon(totB):comma(totB)+"건"}` : "기준 연도 실적 없음");

  /* 표 */
  const arrow = d => d > 0 ? `<span style="color:var(--win)">▲</span>` : d < 0 ? `<span style="color:var(--danger)">▼</span>` : "";
  const rateCell = (va,vb)=>{
    const d = vb - va;
    if(!va) return vb ? `<span style="color:var(--win)">신규</span>` : "-";
    return `${arrow(d)} <span style="color:${d>0?"var(--win)":d<0?"var(--danger)":"var(--muted)"}">${(d/va*100).toFixed(1)}%</span>`;
  };
  const dimHead = dim === "month" ? "월" : CMP_LABEL[dim].replace("별","");
  const head = `<thead><tr>
      <th class="nos dim">${dimHead}</th>
      <th class="num nos">${a}년</th><th class="num nos">${b}년</th>
      <th class="num nos">증감</th><th class="num nos">증감률</th>
      <th class="num nos">${b}년 비중</th></tr></thead>`;

  const body = keys.map(k=>{
    const va = get(ma,k), vb = get(mb,k), d = vb - va;
    if(dim !== "month" && !va && !vb) return "";
    return `<tr>
      <td class="dim">${esc(dim==="month" ? k+"월" : k)}</td>
      <td class="num">${va?comma(va):"-"}</td>
      <td class="num" style="font-weight:700">${vb?comma(vb):"-"}</td>
      <td class="num" style="color:${d>0?"var(--win)":d<0?"var(--danger)":"var(--muted)"}">${d?((d>0?"+":"−")+comma(Math.abs(d))):"-"}</td>
      <td class="num">${rateCell(va,vb)}</td>
      <td class="num" style="color:var(--muted)">${totB?((vb/totB*100).toFixed(1)+"%"):"-"}</td>
    </tr>`;
  }).join("");

  const totRow = `<tr class="tot">
      <td class="dim">합계</td>
      <td class="num">${comma(totA)}</td><td class="num">${comma(totB)}</td>
      <td class="num" style="color:${diff>0?"var(--win)":diff<0?"var(--danger)":"var(--muted)"}">${(diff>=0?"+":"−")+comma(Math.abs(diff))}</td>
      <td class="num">${rateCell(totA,totB)}</td><td class="num">100%</td></tr>`;

  $("cmpTbl").innerHTML = head + "<tbody>" + body + totRow + "</tbody>";
  $("cmpInfo").textContent =
    `${CMP_LABEL[dim]} · ${a}년 ${comma(totA)}${unit} → ${b}년 ${comma(totB)}${unit} `
    + `(${diff>=0?"+":"−"}${Math.abs(rate).toFixed(1)}%)`
    + (limit ? ` · 1~${limit}월 같은 기간 기준` : "")
    + (dim === "rep" ? " · 미입력 제외" : "");

  if(dim === "month") drawCompareChart(keys, ma, mb, isAmt, a, b);
}

/* 월별 두 해 그룹 막대 */
function drawCompareChart(keys, ma, mb, isAmt, ya, yb){
  const host = $("cmpChart");
  const get = (m,k) => (m[k] ? (isAmt ? m[k].a : m[k].c) : 0);
  const W = Math.max(560, host.clientWidth || 900), H = 250;
  const P = { t:14, r:12, b:26, l:58 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const max = Math.max(1, ...keys.map(k=>Math.max(get(ma,k), get(mb,k))));
  const step = niceStep(max), top = Math.ceil(max/step)*step;
  const y = v => P.t + ih - (v/top)*ih;
  const band = iw / keys.length;
  const bw = Math.max(6, Math.min(20, band*0.32));
  const GAP = 2;

  let g = "";
  for(let v=0; v<=top; v+=step){
    g += `<line x1="${P.l}" x2="${W-P.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#eef1f6" stroke-width="1"/>`;
    g += `<text x="${P.l-8}" y="${(y(v)+4).toFixed(1)}" text-anchor="end" font-size="10.5" fill="#6b7688">${v?(isAmt?shortWon(v):comma(v)):0}</text>`;
  }
  keys.forEach((k,i)=>{
    const cx = P.l + band*i + band/2;
    g += bar(cx - bw - GAP/2, y(get(ma,k)), bw, P.t+ih-y(get(ma,k)), "var(--prop-mark)");
    g += bar(cx + GAP/2,      y(get(mb,k)), bw, P.t+ih-y(get(mb,k)), "var(--win-mark)");
    g += `<text x="${cx}" y="${H-8}" text-anchor="middle" font-size="10.5" fill="#6b7688">${k}월</text>`;
    g += `<rect class="cmphit" x="${(P.l+band*i).toFixed(1)}" y="${P.t}" width="${band.toFixed(1)}" height="${ih}"
            fill="transparent" data-k="${k}" style="cursor:pointer"/>`;
  });
  g += `<line x1="${P.l}" x2="${W-P.r}" y1="${P.t+ih}" y2="${P.t+ih}" stroke="#d7dde8" stroke-width="1"/>`;

  host.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="${ya}년과 ${yb}년의 월별 수주 비교 막대 그래프">${g}</svg><div id="cmpTip" class="hide"></div>`;

  const tip = $("cmpTip");
  tip.style.cssText = "position:absolute;background:#1b2230;color:#fff;padding:8px 11px;border-radius:8px;font-size:12px;pointer-events:none;z-index:50;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.22)";
  host.style.position = "relative";
  host.querySelectorAll(".cmphit").forEach(z=>{
    z.addEventListener("mousemove", e=>{
      const k = z.dataset.k, va = get(ma,k), vb = get(mb,k), d = vb - va;
      tip.classList.remove("hide");
      tip.innerHTML = `<b>${k}월</b><br>`
        + `<span style="color:#f6b28e">■</span> ${ya}년 ${comma(va)}${isAmt?"원":"건"}<br>`
        + `<span style="color:#8fc0f2">■</span> ${yb}년 ${comma(vb)}${isAmt?"원":"건"}<br>`
        + `증감 ${d>=0?"+":"−"}${comma(Math.abs(d))}${isAmt?"원":"건"}`
        + (va ? ` (${d>=0?"+":"−"}${Math.abs(d/va*100).toFixed(1)}%)` : "");
      const bb = host.getBoundingClientRect();
      let x = e.clientX - bb.left + 12;
      if(x + 220 > bb.width) x = bb.width - 224;
      tip.style.left = x+"px"; tip.style.top = (e.clientY - bb.top + 12)+"px";
    });
    z.addEventListener("mouseleave", ()=> tip.classList.add("hide"));
  });
}
</script>

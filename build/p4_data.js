<script>
/* ===================== 데이터 로드 · 실시간 ===================== */
async function loadYear(y){
  YEAR = y;
  if(!YEARS.includes(y)){ YEARS.push(y); YEARS.sort((a,b)=>a-b); }
  renderYearTabs();
  ROWS = [];
  const PAGE_N = 1000;
  for(let from=0; ; from+=PAGE_N){
    const { data, error } = await sb.from("sales_rows").select("*")
      .eq("fiscal_year", y).order("propose_date",{ascending:true}).range(from, from+PAGE_N-1);
    if(error){ toast("불러오기 실패: "+error.message); break; }
    ROWS = ROWS.concat(data||[]);
    if(!data || data.length < PAGE_N) break;
  }
  YEAR_CACHE[y] = ROWS;
  refreshOptionLists();
  render();
  subscribeRealtime();
}

function subscribeRealtime(){
  if(rtChannel) sb.removeChannel(rtChannel);
  rtChannel = sb.channel("sales-"+YEAR)
    .on("postgres_changes", { event:"*", schema:"public", table:"sales_rows" }, (p)=>{
      const row = p.new && p.new.id ? p.new : p.old;
      if(!row) return;
      if(p.eventType==="DELETE"){ ROWS = ROWS.filter(r=>r.id!==row.id); }
      else if(Number(row.fiscal_year)===YEAR){
        const i = ROWS.findIndex(r=>r.id===row.id);
        if(i>=0) ROWS[i] = row; else ROWS.push(row);
      }else{
        ROWS = ROWS.filter(r=>r.id!==row.id);
      }
      clearYearCache();
      if($("rowModal").classList.contains("hide")) render();
    })
    .on("postgres_changes", { event:"*", schema:"public", table:"app_settings" }, async ()=>{
      await loadSettings(); refreshOptionLists();
      if(VIEW==="settings") renderSettings();
    })
    .subscribe();
}

/* ===================== 필터 ===================== */
const FILTER_IDS = ["fQ","fStage","fRevMonth","fPropMonth","fChannel","fRep","fAgency","fProduct","fIndustry","fOwner"];

function refreshOptionLists(){
  fillSelect($("fStage"),    ["제안","수주"],       "전체");
  fillSelect($("fChannel"),  optionsFor("channel"), "전체");
  fillSelect($("fRep"),      optionsFor("rep"),     "전체");
  fillSelect($("fAgency"),   optionsFor("agency"),  "전체");
  fillSelect($("fProduct"),  optionsFor("product"), "전체");
  fillSelect($("fIndustry"), optionsFor("industry"),"전체");
  fillSelect($("fOwner"),    [...new Set(ROWS.map(r=>r.created_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ko")), "전체");
  const rm = [...new Set(ROWS.map(r=>r.revenue_month).filter(Boolean))].sort();
  const pm = [...new Set(ROWS.map(r=>r.propose_month).filter(Boolean))].sort();
  fillSelect($("fRevMonth"),  rm.map(monthLabel), "전체");
  fillSelect($("fPropMonth"), pm.map(monthLabel), "전체");

  /* 신규 등록 폼 — 선택 항목은 설정 탭 목록, 자유 입력은 datalist 추천만 */
  fillSelect($("iChannel"),  SETTINGS.channel);
  fillSelect($("iRep"),      SETTINGS.rep,        "(없음)");
  fillSelect($("iProduct"),  SETTINGS.product);
  fillSelect($("iIndustry"), SETTINGS.industry,   "(없음)");
  fillSelect($("iAdded"),    optionsFor("added_value"), "없음");
  fillSelect($("iPromo"),    optionsFor("promotion"),   "없음");
  const dl = (id, key) => $(id).innerHTML =
    [...new Set(ROWS.map(r=>r[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ko"))
      .map(v=>`<option value="${esc(v)}">`).join("");
  dl("dlAgency","agency"); dl("dlAdvertiser","advertiser"); dl("dlBrand","brand");

  /* 매출 분석 — 월 선택지 (최신 월이 위, 미도래 월은 토글에 따름) */
  const keys = monthKeys();
  const cur = $("pvMonth").value;
  $("pvMonth").innerHTML = '<option value="">전체 (표시 중인 월)</option>'
    + keys.map(k=>`<option value="${k}">${Number(k.slice(5))}월</option>`).join("");
  if([...$("pvMonth").options].some(o=>o.value===cur)) $("pvMonth").value = cur;
}

function filtered(){
  const q  = $("fQ").value.trim().toLowerCase();
  const st = $("fStage").value, ch = $("fChannel").value, rp = $("fRep").value,
        ag = $("fAgency").value, pr = $("fProduct").value, ind = $("fIndustry").value,
        ow = $("fOwner").value,
        rm = $("fRevMonth").value, pm = $("fPropMonth").value;
  let out = ROWS.filter(r=>{
    if(st && r.stage!==st) return false;
    if(ch && r.channel!==ch) return false;
    if(rp && r.rep!==rp) return false;
    if(ag && r.agency!==ag) return false;
    if(pr && r.product!==pr) return false;
    if(ind && r.industry!==ind) return false;
    if(ow && r.created_name!==ow) return false;
    if(rm && monthLabel(r.revenue_month)!==rm) return false;
    if(pm && monthLabel(r.propose_month)!==pm) return false;
    if(q){
      const hay = [r.advertiser,r.brand,r.agency,r.rep,r.channel,r.product,r.industry,
                   r.note,r.basic_budget,r.added_value,r.promotion,r.created_name,
                   monthLabel(r.revenue_month),monthLabel(r.propose_month),String(r.amount)]
                  .join(" ").toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  const k = SORT.k, dir = SORT.dir==="asc"?1:-1;
  out.sort((a,b)=>{
    let va=a[k], vb=b[k];
    if(k==="amount"){ va=Number(va)||0; vb=Number(vb)||0; return (va-vb)*dir; }
    va = va==null?"":String(va); vb = vb==null?"":String(vb);
    return va.localeCompare(vb,"ko")*dir;
  });
  return out;
}

/* ===================== 목록 렌더 ===================== */
const LIST_COLS = [
  {k:"propose_date",  t:"제안일",       f:r=>toExcelDate(r.propose_date)},
  {k:"propose_month", t:"제안월",       f:r=>monthLabel(r.propose_month)},
  {k:"exec_month",    t:"집행(예정)월", f:r=>monthLabel(r.exec_month)},
  {k:"revenue_month", t:"매출월",       f:r=>monthLabel(r.revenue_month)},
  {k:"stage",         t:"제안/수주",    f:r=>`<span class="pill ${esc(r.stage)}">${esc(r.stage)}</span>`, raw:true},
  {k:"channel",       t:"채널"},
  {k:"rep",           t:"미디어렙"},
  {k:"agency",        t:"대행사"},
  {k:"product",       t:"상품"},
  {k:"industry",      t:"업종",       clip:true},
  {k:"advertiser",    t:"광고주",     clip:true},
  {k:"brand",         t:"브랜드",     clip:true},
  {k:"amount",        t:"금액(원)",     f:r=>comma(r.amount), num:true},
  {k:"basic_budget",  t:"Basic 총예산", f:r=>commaIfNumeric(r.basic_budget), extra:true},
  {k:"note",          t:"비고",       clip:true, extra:true},
  {k:"added_value",   t:"Added Value 활용", extra:true},
  {k:"promotion",     t:"프로모션 적용여부", extra:true},
  {k:"created_name",  t:"등록자"}
];

/** 기본은 접어두고 버튼으로 펼치는 열 (Basic 총예산 · 비고 · Added Value · 프로모션) */
let SHOW_EXTRA = false;
function visibleCols(){ return SHOW_EXTRA ? LIST_COLS : LIST_COLS.filter(c=>!c.extra); }

function renderList(){
  const nExtra = LIST_COLS.filter(c=>c.extra).length;
  $("btnExtraCols").textContent = SHOW_EXTRA
    ? `◂ 추가 ${nExtra}개 열 접기`
    : `▸ 추가 ${nExtra}개 열 보기 (Basic 총예산·비고·AV·프로모션)`;
  const COLS_V = visibleCols();
  const all = filtered();
  const total = all.length;
  const maxPage = Math.max(1, Math.ceil(total/PAGE_SIZE));
  if(PAGE > maxPage) PAGE = maxPage;
  const start = (PAGE-1)*PAGE_SIZE;
  const page = all.slice(start, start+PAGE_SIZE);

  const sumAll = all.reduce((s,r)=>s+(Number(r.amount)||0),0);
  $("listCount").textContent = `· ${comma(total)}건 / 합계 ${comma(sumAll)}원`;

  const th = `<thead><tr><th class="nos">NO</th>`
    + COLS_V.map(c=>`<th data-sk="${c.k}" class="${c.num?'num':''}${c.clip?' clip':''}">${c.t}${SORT.k===c.k?(SORT.dir==='asc'?' ▲':' ▼'):''}</th>`).join("")
    + `<th class="nos"></th></tr></thead>`;

  const tb = "<tbody>" + page.map((r,i)=>{
    const cells = COLS_V.map(c=>{
      if(c.raw) return `<td>${c.f(r)}</td>`;
      const v = c.f ? c.f(r) : (r[c.k]||"");
      if(c.clip) return `<td class="clip" title="${esc(v)}">${esc(trunc(v,10))}</td>`;
      return `<td class="${c.num?'num':''}">${esc(v)}</td>`;
    }).join("");
    return `<tr data-id="${r.id}">
      <td style="color:var(--muted)">${start+i+1}</td>${cells}
      <td>${canEdit(r)?`<button class="btn sm ghost" data-edit="${r.id}">수정</button>`:`<span class="hint">-</span>`}</td>
    </tr>`;
  }).join("") + "</tbody>";

  $("dataTbl").innerHTML = th + tb;
  $("listEmpty").classList.toggle("hide", total>0);
  $("pageInfo").textContent = total ? `${comma(start+1)}–${comma(Math.min(start+PAGE_SIZE,total))} / ${comma(total)}건 (${PAGE}/${maxPage} 페이지)` : "0건";
  $("btnPrev").disabled = PAGE<=1;
  $("btnNext").disabled = PAGE>=maxPage;

  $("dataTbl").querySelectorAll("thead th[data-sk]").forEach(th=>{
    th.onclick = ()=>{
      const k = th.dataset.sk;
      if(SORT.k===k) SORT.dir = SORT.dir==="asc"?"desc":"asc";
      else SORT = { k, dir: k==="amount"?"desc":"asc" };
      renderList();
    };
  });
  $("dataTbl").querySelectorAll("[data-edit]").forEach(b=>{
    b.onclick = ()=>openRow(ROWS.find(r=>r.id===b.dataset.edit));
  });
}

/* ===================== 등록/수정 모달 ===================== */
/** 저장된 값이 설정 목록에 없어도 선택이 유지되도록 임시 옵션을 넣어줍니다. */
function setSelect(el, val){
  if(val && ![...el.options].some(o=>o.value===val)){
    el.insertAdjacentHTML("beforeend", `<option value="${esc(val)}">${esc(val)}</option>`);
  }
  el.value = val || "";
}

function openRow(row){
  EDIT_ID = row ? row.id : null;
  $("rmTitle").textContent = row ? "데이터 수정" : "신규 등록";
  $("rmMsg").textContent = ""; $("rmMsg").className = "msg";
  $("btnDelete").classList.toggle("hide", !row || !canEdit(row));
  $("rmOwner").textContent = row
    ? `등록자 ${row.created_name||"-"} · ${new Date(row.created_at).toLocaleString("ko-KR")}`
    : `등록자: ${ME.name} (자동 기록)`;

  refreshOptionLists();
  const today = fmtISO(new Date());
  $("iDate").value       = row?.propose_date || today;
  $("iExecMonth").value  = row?.exec_month  || `${YEAR}-01`;
  $("iRevMonth").value   = row?.revenue_month || `${YEAR}-01`;
  $("iStage").value      = row?.stage || "제안";
  setSelect($("iChannel"),  row?.channel || SETTINGS.channel[0] || "");
  setSelect($("iRep"),      row?.rep || "");
  setSelect($("iProduct"),  row?.product || SETTINGS.product[0] || "");
  setSelect($("iIndustry"), row?.industry || "");
  setSelect($("iAdded"),    row?.added_value || "");
  setSelect($("iPromo"),    row?.promotion || "");
  $("iAgency").value     = row?.agency || "";
  $("iAdvertiser").value = row?.advertiser || "";
  $("iBrand").value      = row?.brand || "";
  $("iAmount").value     = row ? comma(row.amount) : "";
  $("iBasic").value      = commaIfNumeric(row?.basic_budget || "");
  $("iNote").value       = row?.note || "";
  syncProposeMonth();
  $("rowModal").classList.remove("hide");
}
function syncProposeMonth(){
  const d = $("iDate").value;
  $("iPropMonth").value = d ? monthLabel(d.slice(0,7)) : "";
}

async function saveRow(){
  const msg = $("rmMsg"); msg.className="msg";
  const rec = {
    propose_date : $("iDate").value || null,
    propose_month: $("iDate").value ? $("iDate").value.slice(0,7) : "",
    exec_month   : $("iExecMonth").value || "",
    revenue_month: $("iRevMonth").value || "",
    stage        : $("iStage").value,
    channel      : $("iChannel").value,
    rep          : $("iRep").value,
    agency       : $("iAgency").value.trim(),
    product      : $("iProduct").value,
    industry     : $("iIndustry").value,
    advertiser   : $("iAdvertiser").value.trim(),
    brand        : $("iBrand").value.trim(),
    amount       : uncomma($("iAmount").value),
    basic_budget : $("iBasic").value.trim(),
    note         : $("iNote").value.trim(),
    added_value  : $("iAdded").value,
    promotion    : $("iPromo").value
  };
  if(!rec.propose_date){ msg.className="msg err"; msg.textContent="제안일을 입력해 주세요."; return; }
  if(!rec.revenue_month){ msg.className="msg err"; msg.textContent="매출월을 입력해 주세요."; return; }
  if(!rec.advertiser){ msg.className="msg err"; msg.textContent="광고주를 입력해 주세요."; return; }
  if(!rec.amount){ msg.className="msg err"; msg.textContent="금액을 입력해 주세요."; return; }
  if(!rec.exec_month) rec.exec_month = rec.revenue_month;

  $("btnSaveRow").disabled = true;
  try{
    if(EDIT_ID){
      rec.updated_by = ME.id; rec.updated_name = ME.name;
      const { error } = await sb.from("sales_rows").update(rec).eq("id", EDIT_ID);
      if(error) throw error;
      toast("수정했습니다.");
    }else{
      rec.created_by = ME.id; rec.created_name = ME.name;
      rec.updated_by = ME.id; rec.updated_name = ME.name;
      const { error } = await sb.from("sales_rows").insert(rec);
      if(error) throw error;
      toast("등록했습니다.");
    }
    const y = Number((rec.revenue_month||"").slice(0,4));
    clearYearCache();
    $("rowModal").classList.add("hide");
    if(y && y!==YEAR){ toast(`매출월이 ${y}년이라 ${String(y).slice(2)}년 탭에 저장되었습니다.`); await loadYear(y); }
    else await loadYear(YEAR);
  }catch(e){
    msg.className="msg err";
    msg.textContent = /row-level security/i.test(e.message)
      ? "본인이 등록한 건만 수정할 수 있습니다. (팀장·마스터는 전체 가능)" : e.message;
  }finally{ $("btnSaveRow").disabled = false; }
}

async function deleteRow(){
  if(!EDIT_ID) return;
  if(!confirm("이 데이터를 삭제할까요? 되돌릴 수 없습니다.")) return;
  const { error } = await sb.from("sales_rows").delete().eq("id", EDIT_ID);
  if(error){ alert(error.message); return; }
  clearYearCache();
  $("rowModal").classList.add("hide");
  toast("삭제했습니다.");
  await loadYear(YEAR);
}
</script>

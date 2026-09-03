<script>
/* ===================== 엑셀 내려받기 ===================== */
function exportExcel(){
  const list = VIEW==="list" ? filtered() : ROWS.slice().sort((a,b)=>String(a.propose_date).localeCompare(String(b.propose_date)));
  if(!list.length){ toast("내려받을 데이터가 없습니다."); return; }

  const header = ["NO", ...COLS.map(c=>c.x)];
  const aoa = [header];
  list.forEach((r,i)=>{
    aoa.push([ i+1, ...COLS.map(c=>{
      if(c.type==="date")  return toExcelDate(r[c.k]);
      if(c.type==="month") return monthLabel(r[c.k]);
      if(c.type==="num")   return Number(r[c.k])||0;
      return r[c.k] || "";
    })]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{wch:5},{wch:12},{wch:9},{wch:12},{wch:9},{wch:9},{wch:11},{wch:13},{wch:15},
                 {wch:10},{wch:16},{wch:16},{wch:16},{wch:14},{wch:16},{wch:22},{wch:18},{wch:20}];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:aoa.length-1,c:header.length-1} }) };
  // 금액 열(N)에 천단위 콤마 서식
  for(let r=1;r<aoa.length;r++){
    const ref = XLSX.utils.encode_cell({ r, c:13 });
    if(ws[ref]) ws[ref].z = "#,##0";
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const filtered_ = VIEW==="list" && FILTER_IDS.some(id=>$(id).value);
  XLSX.writeFile(wb, `광고영업팀 Sales시트_${String(YEAR).slice(2)}년${filtered_?"_필터":""}.xlsx`);
  toast(`${comma(list.length)}건을 내려받았습니다.`);
}

/* ===================== 엑셀 업로드 ===================== */
const normH = s => String(s||"").replace(/\s| /g,"").toLowerCase();
const HEADER_ALIAS = {};
COLS.forEach(c=> HEADER_ALIAS[normH(c.x)] = c.k);
Object.assign(HEADER_ALIAS, {
  "집행월":"exec_month", "집행예정월":"exec_month", "제안수주":"stage",
  "금액":"amount", "금액원":"amount", "basic총예산":"basic_budget",
  "addedvalue활용":"added_value", "addedvalue":"added_value", "프로모션적용여부":"promotion", "프로모션":"promotion"
});

function readWorkbook(file){
  return new Promise((res,rej)=>{
    const fr = new FileReader();
    fr.onerror = ()=>rej(new Error("파일을 읽지 못했습니다."));
    fr.onload = e=>{
      try{
        const wb = XLSX.read(new Uint8Array(e.target.result), { type:"array", cellDates:true });
        res(wb);
      }catch(err){ rej(err); }
    };
    fr.readAsArrayBuffer(file);
  });
}

async function parseFile(file){
  const msg = $("upMsg"); msg.className="msg"; msg.textContent="파일을 읽는 중…";
  try{
    const wb = await readWorkbook(file);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:null, blankrows:false });

    // 헤더 행 찾기 — 상단 10행 중 아는 컬럼명이 가장 많은 행
    // (25년 시트처럼 제안일 칸 제목이 "NO", 제안월 칸이 "돈터치" 로 되어 있어도 인식합니다)
    let hi = -1, bestHit = 0;
    for(let i=0;i<Math.min(10, aoa.length);i++){
      const n = (aoa[i]||[]).map(normH).filter(h=>HEADER_ALIAS[h]).length;
      if(n > bestHit){ bestHit = n; hi = i; }
    }
    if(hi < 0 || bestHit < 4)
      throw new Error("헤더 행을 찾지 못했습니다. 매출월 · 제안/수주 · 금액(원) 등이 있는 Sales 시트 양식인지 확인해 주세요.");

    const head = (aoa[hi]||[]).map(normH);
    const idx = {};
    head.forEach((h,c)=>{ const k = HEADER_ALIAS[h]; if(k && idx[k]===undefined) idx[k] = c; });
    // 제안일 칸 제목이 엉뚱한 경우 — 값이 날짜인 열을 찾아서 씁니다
    if(idx.propose_date === undefined){
      const looksDate = v => (v instanceof Date && !isNaN(v))
        || (typeof v === "string" && /^\s*\d{4}\s*[-.\/]\s*\d{1,2}\s*[-.\/]\s*\d{1,2}/.test(v));
      const used = new Set(Object.values(idx));
      const sample = aoa.slice(hi+1, hi+61);
      let pick = -1, pickScore = 0;
      for(let c=0;c<Math.max(head.length, 30);c++){
        if(used.has(c)) continue;
        let n=0, hit=0;
        sample.forEach(row=>{
          const v = row && row[c];
          if(v!==null && v!==undefined && String(v).trim()!==""){ n++; if(looksDate(v)) hit++; }
        });
        const score = n ? hit/n : 0;
        if(n >= 5 && score >= 0.8 && score > pickScore){ pickScore = score; pick = c; }
      }
      if(pick >= 0) idx.propose_date = pick;
    }

    const miss = ["propose_date","revenue_month","stage","amount","advertiser"].filter(k=>idx[k]===undefined);
    if(miss.length) throw new Error("필수 컬럼이 없습니다: " + miss.map(k=>COLS.find(c=>c.k===k).x).join(", "));

    const out = [];
    for(let i=hi+1;i<aoa.length;i++){
      const row = aoa[i]||[];
      const get = k => idx[k]===undefined ? null : row[idx[k]];
      const rec = {
        propose_date : toISODate(get("propose_date")) || null,
        exec_month   : toYM(get("exec_month")),
        revenue_month: toYM(get("revenue_month")),
        stage        : String(get("stage")||"").trim(),
        channel      : String(get("channel")||"").trim(),
        rep          : String(get("rep")||"").trim(),
        agency       : String(get("agency")||"").trim(),
        product      : String(get("product")||"").trim(),
        industry     : String(get("industry")||"").trim(),
        advertiser   : String(get("advertiser")||"").trim(),
        brand        : String(get("brand")||"").trim(),
        amount       : uncomma(get("amount")),
        basic_budget : get("basic_budget")==null?"":String(get("basic_budget")).trim(),
        note         : get("note")==null?"":String(get("note")).trim(),
        // Added Value · 프로모션은 앞쪽 기준 이름으로 통일
        // ("소노리조트 라이트(750만원)" → "소노리조트", "신규광고주(25.4Q)" → "신규광고주")
        added_value  : normalizeChoice(get("added_value"), "added_value"),
        promotion    : normalizeChoice(get("promotion"),   "promotion")
      };
      // 제안월은 제안일에서 자동 파생 (원본 시트와 100% 일치 확인됨)
      rec.propose_month = rec.propose_date ? rec.propose_date.slice(0,7) : toYM(get("propose_month"));
      if(!rec.exec_month) rec.exec_month = rec.revenue_month;
      if(!rec.revenue_month) rec.revenue_month = rec.exec_month;
      if(!rec.stage && !rec.advertiser && !rec.amount) continue;      // 빈 행
      if(!rec.revenue_month && !rec.propose_month) continue;
      if(rec.stage!=="제안" && rec.stage!=="수주") rec.stage = rec.stage || "제안";
      out.push(rec);
    }
    if(!out.length) throw new Error("등록할 데이터 행이 없습니다.");

    IMPORT_ROWS = out;
    showPreview(out, file.name);
    msg.textContent = "";
  }catch(e){
    IMPORT_ROWS = null;
    $("upResult").classList.add("hide");
    $("btnDoImport").disabled = true;
    msg.className="msg err"; msg.textContent = e.message;
  }
}

function showPreview(rows, fname){
  const byYear = {};
  rows.forEach(r=>{ const y = Number((r.revenue_month||r.propose_month||"").slice(0,4))||0; byYear[y]=(byYear[y]||0)+1; });
  const stage = rows.reduce((a,r)=>{ a[r.stage]=(a[r.stage]||0)+1; return a; },{});
  const sum = rows.reduce((s,r)=>s+(Number(r.amount)||0),0);
  $("upSummary").innerHTML =
    `<b>${esc(fname)}</b> — 총 <b>${comma(rows.length)}건</b> · 합계 <b>${comma(sum)}원</b><br>
     <span class="hint" style="font-size:12.5px">연도별: ${Object.keys(byYear).sort().map(y=>`${y}년 ${comma(byYear[y])}건`).join(" · ")}
     &nbsp;|&nbsp; 제안 ${comma(stage["제안"]||0)}건 · 수주 ${comma(stage["수주"]||0)}건
     &nbsp;|&nbsp; 매출월의 연도에 따라 해당 연도 시트로 자동 분류됩니다.</span>`;

  const cols = ["propose_date","revenue_month","stage","channel","rep","agency","product","industry","advertiser","brand","amount"];
  const th = cols.map(k=>`<th class="nos">${COLS.find(c=>c.k===k).x}</th>`).join("");
  const tb = rows.slice(0,20).map(r=>`<tr>${cols.map(k=>
      `<td class="${k==="amount"?"num":""}">${esc(k==="amount"?comma(r[k]):(k==="revenue_month"?monthLabel(r[k]):(k==="propose_date"?toExcelDate(r[k]):r[k])))}</td>`
    ).join("")}</tr>`).join("");
  $("upPrev").innerHTML = `<thead><tr>${th}</tr></thead><tbody>${tb}</tbody>`;
  $("upResult").classList.remove("hide");
  $("btnDoImport").disabled = false;
}

const dupKey = r => [r.propose_date, r.revenue_month, r.stage, r.advertiser, r.brand,
                     r.product, r.rep, r.agency, Number(r.amount)||0].join("");

async function doImport(){
  if(!IMPORT_ROWS) return;
  const btn = $("btnDoImport"); btn.disabled = true;
  const msg = $("upMsg"); msg.className="msg"; msg.textContent = "중복 확인 중…";
  try{
    let rows = IMPORT_ROWS.map(r=>({ ...r, created_by:ME.id, created_name:ME.name, updated_by:ME.id, updated_name:ME.name }));

    if($("skipDup").checked){
      const years = [...new Set(rows.map(r=>Number((r.revenue_month||r.propose_month||"").slice(0,4))).filter(Boolean))];
      // 이미 저장된 건과 "같은 내용이 같은 횟수만큼" 있는 경우만 건너뜁니다.
      // (원본 시트에 의도적으로 같은 내용이 2건 있는 경우는 그대로 2건 등록)
      const have = {};
      for(const y of years){
        for(let from=0;;from+=1000){
          const { data, error } = await sb.from("sales_rows")
            .select("propose_date,revenue_month,stage,advertiser,brand,product,rep,agency,amount")
            .eq("fiscal_year", y).range(from, from+999);
          if(error) throw error;
          (data||[]).forEach(d=>{ const k = dupKey(d); have[k] = (have[k]||0)+1; });
          if(!data || data.length<1000) break;
        }
      }
      const before = rows.length;
      rows = rows.filter(r=>{
        const k = dupKey(r);
        if(have[k]>0){ have[k]--; return false; }
        return true;
      });
      if(before !== rows.length) msg.textContent = `중복 ${comma(before-rows.length)}건을 제외했습니다. `;
      if(!rows.length){ msg.className="msg ok"; msg.textContent = "모두 이미 등록된 데이터입니다. 새로 추가된 건이 없습니다."; btn.disabled=false; return; }
    }

    const B = 400;
    for(let i=0;i<rows.length;i+=B){
      msg.textContent = `등록 중… ${comma(Math.min(i+B, rows.length))} / ${comma(rows.length)}건`;
      const { error } = await sb.from("sales_rows").insert(rows.slice(i, i+B));
      if(error) throw error;
    }
    msg.className="msg ok"; msg.textContent = `${comma(rows.length)}건을 등록했습니다.`;
    toast(`${comma(rows.length)}건 등록 완료`);
    IMPORT_ROWS = null; $("fileInput").value = "";
    clearYearCache();
    setTimeout(async ()=>{ $("upModal").classList.add("hide"); await loadYears(); await loadYear(YEAR); }, 900);
  }catch(e){
    msg.className="msg err"; msg.textContent = "등록 실패: " + e.message;
  }finally{ btn.disabled = false; }
}

/* ===================== UI 바인딩 ===================== */
function bindUI(){
  document.querySelectorAll(".tabs button").forEach(b=>{
    b.onclick = ()=>{
      document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("on"));
      b.classList.add("on"); VIEW = b.dataset.view; render();
    };
  });
  document.querySelectorAll("[data-close]").forEach(b=>{
    b.onclick = ()=> $(b.dataset.close).classList.add("hide");
  });
  document.querySelectorAll(".modal-bg").forEach(m=>{
    m.addEventListener("mousedown", e=>{ if(e.target===m) m.classList.add("hide"); });
  });

  let t = null;
  $("fQ").addEventListener("input", ()=>{ clearTimeout(t); t = setTimeout(()=>{ PAGE=1; renderList(); }, 200); });
  FILTER_IDS.filter(id=>id!=="fQ").forEach(id=>$(id).addEventListener("change", ()=>{ PAGE=1; renderList(); }));
  $("btnResetF").onclick = ()=>{ FILTER_IDS.forEach(id=>$(id).value=""); PAGE=1; renderList(); };

  $("btnPrev").onclick = ()=>{ if(PAGE>1){ PAGE--; renderList(); } };
  $("btnNext").onclick = ()=>{ PAGE++; renderList(); };
  $("pageSize").onchange = ()=>{ PAGE_SIZE = Number($("pageSize").value); PAGE=1; renderList(); };

  /* 연도 비교 */
  $("cmpA").onchange   = ()=>{ CMP.a = Number($("cmpA").value); renderCompare(); };
  $("cmpB").onchange   = ()=>{ CMP.b = Number($("cmpB").value); renderCompare(); };
  $("cmpDim").onchange = ()=>{ CMP.dim = $("cmpDim").value; renderCompare(); };
  $("cmpSame").onchange = ()=>{ CMP.same = $("cmpSame").checked; renderCompare(); };
  let ct = null;
  $("cmpQ").addEventListener("input", ()=>{ clearTimeout(ct); ct = setTimeout(()=>{ CMP.q = $("cmpQ").value; renderCompare(); }, 200); });
  $("cmpValue").querySelectorAll("button").forEach(b=>{
    b.onclick = ()=>{
      $("cmpValue").querySelectorAll("button").forEach(x=>x.classList.remove("on"));
      b.classList.add("on"); CMP.value = b.dataset.v; renderCompare();
    };
  });

  $("btnExtraCols").onclick = ()=>{ SHOW_EXTRA = !SHOW_EXTRA; renderList(); };
  $("btnNew").onclick      = ()=> openRow(null);
  $("btnSaveRow").onclick  = saveRow;
  $("btnDelete").onclick   = deleteRow;
  $("iDate").addEventListener("change", syncProposeMonth);
  $("iExecMonth").addEventListener("change", ()=>{ if(!$("iRevMonth").value) $("iRevMonth").value = $("iExecMonth").value; });

  // 금액: 입력하는 즉시 천단위 콤마
  $("iAmount").addEventListener("input", e=>{
    const el = e.target, before = el.value.length - el.selectionStart;
    el.value = uncomma(el.value) ? comma(uncomma(el.value)) : "";
    const pos = Math.max(0, el.value.length - before);
    el.setSelectionRange(pos, pos);
  });

  // Basic 총예산: 숫자만 입력한 경우에만 천단위 콤마 (예: "OK", "+ENA 채널 포함" 같은 메모는 그대로)
  $("iBasic").addEventListener("input", e=>{
    const el = e.target;
    if(!isNumericText(el.value)) return;
    const before = el.value.length - el.selectionStart;
    el.value = comma(uncomma(el.value));
    const pos = Math.max(0, el.value.length - before);
    el.setSelectionRange(pos, pos);
  });

  // 기준 월 변경 (현재월 현황)
  $("curMonth").onchange = ()=>{ CUR_MONTH = $("curMonth").value; renderCurrent(); };

  /* 상단 "＋ 신규 등록" 바로가기 — 전체 데이터 탭으로 이동하며 등록창을 엽니다 */
  $("btnQuickNew").onclick = ()=>{
    document.querySelectorAll(".tabs button[data-view]").forEach(x=>x.classList.remove("on"));
    document.querySelector('.tabs button[data-view="list"]').classList.add("on");
    VIEW = "list"; render(); openRow(null);
  };

  /* 매출 분석 */
  $("btnAddYear").onclick = addYear;
  ["btnFuture1","btnFuture2"].forEach(id=>{
    $(id).onclick = ()=>{
      PV.showFuture = !PV.showFuture;
      refreshOptionLists();
      renderChart(); renderMonthTable(); renderPivot();
    };
  });
  $("pvDim").onchange   = ()=>{ PV.dim = $("pvDim").value; renderPivot(); };
  $("pvMonth").onchange = ()=>{ PV.month = $("pvMonth").value; renderPivot(); };
  let pt = null;
  $("pvQ").addEventListener("input", ()=>{ clearTimeout(pt); pt = setTimeout(()=>{ PV.q = $("pvQ").value; renderPivot(); }, 200); });
  $("pvValue").querySelectorAll("button").forEach(b=>{
    b.onclick = ()=>{
      $("pvValue").querySelectorAll("button").forEach(x=>x.classList.remove("on"));
      b.classList.add("on"); PV.value = b.dataset.v; renderPivot();
    };
  });
  $("pvReset").onclick = ()=>{
    PV = { dim:"rep", value:"amount", q:"", month:"", showFuture:false };
    $("pvDim").value="rep"; $("pvQ").value=""; $("pvMonth").value="";
    $("pvValue").querySelectorAll("button").forEach(x=>x.classList.toggle("on", x.dataset.v==="amount"));
    refreshOptionLists(); renderChart(); renderMonthTable(); renderPivot();
  };

  $("btnDownload").onclick = exportExcel;
  $("btnUpload").onclick = ()=>{
    IMPORT_ROWS = null; $("upResult").classList.add("hide");
    $("upMsg").textContent = ""; $("btnDoImport").disabled = true; $("fileInput").value = "";
    $("upModal").classList.remove("hide");
  };
  $("btnDoImport").onclick = doImport;

  const drop = $("drop");
  drop.onclick = ()=> $("fileInput").click();
  $("fileInput").onchange = e=>{ if(e.target.files[0]) parseFile(e.target.files[0]); };
  ["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add("on"); }));
  ["dragleave","drop"].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove("on"); }));
  drop.addEventListener("drop", e=>{ const f = e.dataTransfer.files[0]; if(f) parseFile(f); });

  document.addEventListener("keydown", e=>{
    if(e.key==="Escape") document.querySelectorAll(".modal-bg").forEach(m=>m.classList.add("hide"));
  });
}
</script>
</body>
</html>

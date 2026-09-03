<script>
/* =====================================================================
   설정 탭 — 미디어렙 · 채널 · 상품 · 업종 · 프로모션 · Added Value 관리
   추가 / 이름 변경 / 삭제. 팀장(lead) · 마스터(master)만 편집 가능.
   ===================================================================== */
function renderSettings(){
  const admin = isAdmin();
  $("roleNote").innerHTML = admin
    ? `현재 권한 <b>${ROLE_LABEL[ME.role]}</b> — 항목 추가·수정·삭제와 연도 추가가 가능합니다.
       이름을 바꾸면 <b>이미 등록된 데이터의 값도 함께 바꿀지</b> 물어봅니다.`
    : `현재 권한 <b>팀원</b> — 선택 항목은 보기만 가능합니다. 추가·수정이 필요하면 팀장 또는 마스터에게 요청해 주세요.`;

  $("setGrid").innerHTML = SETTING_DEFS.map(d=>{
    const items = SETTINGS[d.key] || [];
    const extra = dataOnly(d.key);
    return `<div class="set-card" data-key="${d.key}">
      <div class="h"><span>${d.icon}</span><b>${d.name} 관리</b><span class="cnt">${items.length}개</span></div>
      <div class="set-list">
        ${items.length ? items.map((v,i)=>`
          <div class="set-item" data-i="${i}">
            <span class="nm">${esc(v)}</span>
            ${admin ? `<button class="btn sm ghost" data-act="edit">수정</button>
                       <button class="btn sm ghost" data-act="del" style="color:var(--danger)">삭제</button>` : ``}
          </div>`).join("")
        : `<div class="hint" style="padding:14px;text-align:center">등록된 항목이 없습니다.</div>`}
      </div>
      ${extra.length ? `<div class="set-add" style="display:block">
        <div class="hint" style="margin:0 0 6px">${String(YEAR).slice(2)}년 데이터에만 있는 값 ${extra.length}개 — 목록에 넣으면 신규 등록에서 고를 수 있습니다.</div>
        ${extra.map(v=>`<span class="dchip">${esc(v)}${admin?`<button data-promote="${esc(v)}" data-pkey="${d.key}">＋ 추가</button>`:""}</span>`).join("")}
      </div>` : ``}
      ${admin ? `<div class="set-add">
        <input placeholder="${d.name} 추가" data-add="${d.key}">
        <button class="btn primary sm" data-addbtn="${d.key}">추가</button>
      </div>` : `<div class="set-add"><span class="hint" style="margin:0">${d.desc}</span></div>`}
    </div>`;
  }).join("");

  $("setGrid").querySelectorAll("[data-promote]").forEach(b=>{
    b.onclick = async ()=>{
      const key = b.dataset.pkey, v = b.dataset.promote;
      try{
        await saveSetting(key, [...(SETTINGS[key]||[]), v]);
        renderSettings(); refreshOptionLists(); toast(`"${v}" 항목을 목록에 추가했습니다.`);
      }catch(e){ toast(errText(e)); }
    };
  });

  if(!admin) return;

  $("setGrid").querySelectorAll("[data-addbtn]").forEach(b=>{
    const key = b.dataset.addbtn;
    const inp = $("setGrid").querySelector(`[data-add="${key}"]`);
    b.onclick = ()=> addItem(key, inp);
    inp.addEventListener("keydown", e=>{ if(e.key==="Enter") addItem(key, inp); });
  });
  $("setGrid").querySelectorAll(".set-item").forEach(el=>{
    const key = el.closest(".set-card").dataset.key;
    const i   = Number(el.dataset.i);
    const btnE = el.querySelector('[data-act="edit"]');
    const btnD = el.querySelector('[data-act="del"]');
    if(btnE) btnE.onclick = ()=> startEdit(el, key, i);
    if(btnD) btnD.onclick = ()=> delItem(key, i);
  });
}

async function addItem(key, inp){
  const v = inp.value.trim();
  if(!v) return;
  const items = (SETTINGS[key]||[]).slice();
  if(items.some(x=>x===v)){ toast("이미 있는 항목입니다."); return; }
  items.push(v);
  try{ await saveSetting(key, items); inp.value=""; renderSettings(); refreshOptionLists(); toast(`"${v}" 항목을 추가했습니다.`); }
  catch(e){ toast(errText(e)); }
}

function startEdit(el, key, i){
  const old = SETTINGS[key][i];
  el.innerHTML = `<input class="ed" value="${esc(old)}">
    <button class="btn primary sm" data-ok>저장</button>
    <button class="btn sm ghost" data-cancel>취소</button>`;
  const inp = el.querySelector("input");
  inp.focus(); inp.select();
  const done = () => renderSettings();
  el.querySelector("[data-cancel]").onclick = done;
  const save = async ()=>{
    const v = inp.value.trim();
    if(!v || v===old) return done();
    if((SETTINGS[key]||[]).some((x,j)=>x===v && j!==i)){ toast("이미 있는 항목입니다."); return; }
    const used = await countUsing(key, old);
    let alsoData = false;
    if(used > 0){
      alsoData = confirm(
        `"${old}" 을(를) 이미 사용 중인 데이터가 ${comma(used)}건 있습니다.\n\n` +
        `확인 → 그 ${comma(used)}건의 값도 "${v}" 로 함께 변경합니다.\n` +
        `취소 → 선택 목록의 이름만 바꾸고, 기존 데이터는 "${old}" 로 그대로 둡니다.`);
    }
    try{
      const items = SETTINGS[key].slice(); items[i] = v;
      await saveSetting(key, items);
      if(alsoData){
        const { error } = await sb.from("sales_rows").update({ [key]: v }).eq(key, old);
        if(error) throw error;
        await loadYear(YEAR);
      }
      renderSettings(); refreshOptionLists();
      toast(alsoData ? `항목명과 데이터 ${comma(used)}건을 함께 변경했습니다.` : "항목명을 변경했습니다.");
    }catch(e){ toast(errText(e)); done(); }
  };
  el.querySelector("[data-ok]").onclick = save;
  inp.addEventListener("keydown", e=>{ if(e.key==="Enter") save(); if(e.key==="Escape") done(); });
}

async function delItem(key, i){
  const v = SETTINGS[key][i];
  const used = await countUsing(key, v);
  const msg = used > 0
    ? `"${v}" 을(를) 사용 중인 데이터가 ${comma(used)}건 있습니다.\n\n선택 목록에서만 빼고, 기존 ${comma(used)}건의 값은 그대로 둡니다.\n삭제할까요?`
    : `"${v}" 항목을 삭제할까요?`;
  if(!confirm(msg)) return;
  try{
    const items = SETTINGS[key].filter((_,j)=>j!==i);
    await saveSetting(key, items);
    renderSettings(); refreshOptionLists();
    toast(`"${v}" 항목을 삭제했습니다.`);
  }catch(e){ toast(errText(e)); }
}

/** 설정 목록에는 없는데 데이터에는 들어있는 값 (현재 연도 기준) */
function dataOnly(key){
  const have = new Set(SETTINGS[key] || []);
  const set = new Set();
  ROWS.forEach(r=>{ const v=(r[key]||"").trim(); if(v && !have.has(v)) set.add(v); });
  return [...set].sort((a,b)=>a.localeCompare(b,"ko"));
}

/** 해당 값이 전체 연도에서 몇 건 쓰이고 있는지 */
async function countUsing(key, val){
  try{
    const { count, error } = await sb.from("sales_rows")
      .select("id", { count:"exact", head:true }).eq(key, val);
    if(error) throw error;
    return count || 0;
  }catch(e){
    return ROWS.filter(r=>(r[key]||"")===val).length;   // 실패 시 현재 연도 기준
  }
}

function errText(e){
  const m = e && e.message ? e.message : String(e);
  return /row-level security|permission/i.test(m)
    ? "설정 변경 권한이 없습니다. 팀장 또는 마스터 계정으로 진행해 주세요." : "실패: " + m;
}
</script>

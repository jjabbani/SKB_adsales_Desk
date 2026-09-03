<script>
/* =====================================================================
   광고영업팀 매출관리 데스크
   GitHub + Supabase + Vercel — 단일 정적 페이지
   ===================================================================== */

/* ------------ ① 여기 두 줄만 본인 Supabase 값으로 바꾸세요 ------------ */
const SUPABASE_URL      = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-KEY";
/* -------------------------------------------------------------------- */

/* 설정 탭에서 관리하는 선택 항목 — 아래는 Supabase 연결 전 기본값입니다.
   실제 값은 app_settings 테이블에서 불러오고, 설정 탭에서 추가·수정·삭제합니다. */
const SETTING_DEFS = [
  { key:"rep",         name:"미디어렙",      icon:"📡", desc:"신규 등록의 미디어렙 선택지" },
  { key:"channel",     name:"채널",          icon:"🧭", desc:"신규 등록의 채널 선택지" },
  { key:"product",     name:"상품",          icon:"📦", desc:"신규 등록의 상품 선택지" },
  { key:"industry",    name:"업종",          icon:"🏷️", desc:"신규 등록의 업종 선택지" },
  { key:"promotion",   name:"프로모션",      icon:"🎯", desc:"프로모션 적용여부 선택지 (기본값 없음)" },
  { key:"added_value", name:"Added Value",   icon:"🎁", desc:"Added Value 활용 선택지 (기본값 없음)" }
];
const SETTINGS = {
  channel:     ["미디어렙","대행사","광고주","Programmatic","인포","교환","지역광고","기타"],
  rep:         ["나스미디어","딜라이브","KOBACO","APM","애드크래프트","스카이라이프","모아미디어","인크로스","메조미디어","DMC미디어","리노컴즈","HCN",
                "이펙트원","휴앤아이","미디어에스","다트미디어","파스텔애드","메인애드","웰메이드씨존","JCN울산방송","어니스트컴퍼니","미디어747","드림에이지이",
                "케이티이엔에이","애드고온","디지털퍼스트","페이백헬스케어","애드원","인포벨","지에스","이노바인코리아","문화미디어렙","KICAD","프라이머스",
                "리얼투데이","DK텔레콤","엠투미디어","바이메이더","IGA웍스","KPPL"],
  product:     ["AD+","Addr.Tv","Basic","C-실시간","C-VOD","VOD","커머스","온애드","티온","비즈챗","지역","ASUM","시니어","기타"],
  industry:    ["기타","제약 및 의료","관공서 및 단체","요식업","서비스","식음료","건설,건재 및 부동산",
                "그룹 및 기업광고","가정용품","금융,보험 및 증권","컴퓨터 및 정보통신","유통",
                "교육 및 복지후생","화장품 및 보건용품","패션","전기전자","자동차"],
  promotion:   ["신규광고주","제안프로모션","공공지자체","증액프로모션","커머스링크"],
  added_value: ["소노리조트","약국미디어보드","카카오VX","이마트DOOH"],
  years:       []
};

/* 엑셀 컬럼 ↔ DB 필드 매핑 (순서 = 엑셀 열 순서) */
const COLS = [
  { x:"제안일",              k:"propose_date",  type:"date"  },
  { x:"제안월",              k:"propose_month", type:"month" },
  { x:"집행(예정)월",        k:"exec_month",    type:"month" },
  { x:"매출월",              k:"revenue_month", type:"month" },
  { x:"제안/수주",           k:"stage"    },
  { x:"채널",                k:"channel"  },
  { x:"미디어렙",            k:"rep"      },
  { x:"대행사",              k:"agency"   },
  { x:"상품",                k:"product"  },
  { x:"업종",                k:"industry" },
  { x:"광고주",              k:"advertiser" },
  { x:"브랜드",              k:"brand"    },
  { x:"금액(원)",            k:"amount",  type:"num" },
  { x:"Basic 총예산",        k:"basic_budget" },
  { x:"비고",                k:"note"     },
  { x:"Added Value 활용",    k:"added_value" },
  { x:"프로모션 적용여부",   k:"promotion" }
];

/* ===================== 전역 상태 ===================== */
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let ME = null;                 // { id, email, name, role }
let YEARS = [];                // 데이터가 있는 연도 + 수동 추가 연도
let YEAR = new Date().getFullYear();
let ROWS = [];                 // 현재 연도 전체 행
let VIEW = "dash";
let PAGE = 1, PAGE_SIZE = 100;
let SORT = { k:"propose_date", dir:"desc" };
let EDIT_ID = null;
let IMPORT_ROWS = null;
let rtChannel = null;
let PV = { dim:"rep", value:"amount", q:"", month:"", showFuture:false };

/* ===================== 유틸 ===================== */
const $  = (id) => document.getElementById(id);
const esc = (s) => String(s==null?"":s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** 1234567 → "1,234,567" */
function comma(n){
  if(n===null||n===undefined||n==="") return "";
  const v = Math.round(Number(n)||0);
  return v.toLocaleString("ko-KR");
}
/** "1,234,567원" → 1234567 */
function uncomma(s){
  if(s===null||s===undefined) return 0;
  const v = String(s).replace(/[^0-9.\-]/g,"");
  return v===""?0:Math.round(Number(v)||0);
}
/** "15000000" · "15,000,000" 처럼 숫자만 있는 문자열인지 (메모성 텍스트와 구분) */
function isNumericText(s){
  const v = String(s==null?"":s).trim();
  return v !== "" && /^[0-9,]+$/.test(v);
}
/** 숫자만 있으면 콤마를 넣어 보여주고, 메모성 텍스트는 그대로 */
function commaIfNumeric(s){
  return isNumericText(s) ? comma(uncomma(s)) : (s==null ? "" : String(s));
}
/** 선택 항목 이름 통일 — 값이 목록 항목으로 시작하면 그 항목으로 맞춤
    예: "소노리조트 라이트(750만원)" → "소노리조트", "신규광고주(25.4Q)" → "신규광고주" */
function normalizeChoice(val, key){
  const v = String(val==null?"":val).trim();
  if(!v) return "";
  const list = (SETTINGS[key] || []).slice().sort((a,b)=>b.length-a.length);
  const hit = list.find(x => v === x || v.startsWith(x));
  return hit || v;
}
/** 10자를 넘으면 …으로 줄임 (표 칸 넓어짐 방지) */
function trunc(s, n){
  const v = String(s==null?"":s);
  return v.length > (n||10) ? v.slice(0, n||10) + "…" : v;
}
/** 억/만 단위 축약 */
function shortWon(n){
  const v = Number(n)||0;
  if(Math.abs(v) >= 100000000) return (v/100000000).toFixed(v%100000000===0?0:1)+"억";
  if(Math.abs(v) >= 10000)      return Math.round(v/10000).toLocaleString("ko-KR")+"만";
  return comma(v);
}
/** "2026-01" → "26년01월" */
function monthLabel(ym){
  if(!ym) return "";
  const m = String(ym).match(/^(\d{4})-(\d{2})$/);
  return m ? m[1].slice(2)+"년"+m[2]+"월" : String(ym);
}
/** "26년01월" / "2026.01" / Date → "2026-01" */
function toYM(v){
  if(v==null||v==="") return "";
  if(v instanceof Date) return v.getFullYear()+"-"+String(v.getMonth()+1).padStart(2,"0");
  const s = String(v).trim();
  let m = s.match(/^(\d{2})년\s*(\d{1,2})월$/);      if(m) return "20"+m[1]+"-"+m[2].padStart(2,"0");
  m = s.match(/^(\d{4})년\s*(\d{1,2})월$/);           if(m) return m[1]+"-"+m[2].padStart(2,"0");
  m = s.match(/^(\d{4})[-./\s]+(\d{1,2})/);           if(m) return m[1]+"-"+m[2].padStart(2,"0");
  return "";
}
/** "2026. 02. 2" / Date / 엑셀 시리얼 → "2026-02-02" */
function toISODate(v){
  if(v==null||v==="") return "";
  if(v instanceof Date && !isNaN(v)) return fmtISO(v);
  if(typeof v === "number"){
    const d = new Date(Math.round((v-25569)*86400*1000));
    return isNaN(d)?"":fmtISO(new Date(d.getTime()+d.getTimezoneOffset()*60000));
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-.\s/]+(\d{1,2})[-.\s/]+(\d{1,2})/);
  if(m) return m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");
  const d = new Date(s);
  return isNaN(d)?"":fmtISO(d);
}
function fmtISO(d){
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
/** "2026-02-02" → "2026. 02. 2"  (원본 엑셀과 동일한 표기) */
function toExcelDate(iso){
  if(!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}. ${m[2]}. ${Number(m[3])}` : String(iso);
}
function toast(msg){
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 2600);
}
function fillSelect(el, list, firstLabel, firstValue){
  const cur = el.value;
  el.innerHTML = (firstLabel!==undefined ? `<option value="${firstValue===undefined?"":esc(firstValue)}">${esc(firstLabel)}</option>` : "")
    + list.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if([...el.options].some(o=>o.value===cur)) el.value = cur;
}
/** 설정 목록 ∪ 실제 데이터에 들어있는 값 (과거 데이터가 사라지지 않도록) */
function optionsFor(key){
  const set = new Set(SETTINGS[key] || []);
  ROWS.forEach(r=>{ const v=(r[key]||"").trim(); if(v) set.add(v); });
  return [...set].sort((a,b)=>a.localeCompare(b,"ko"));
}
/** 팀장(lead) · 마스터(master) = 전체 수정·삭제 + 설정 관리 */
function isAdmin(){ return !!ME && (ME.role==="lead" || ME.role==="master"); }
function canEdit(row){ return !!ME && (isAdmin() || row.created_by===ME.id); }
const ROLE_LABEL = { master:"마스터", lead:"팀장", member:"팀원" };

/* ===================== 인증 ===================== */
let authMode = "login";
$("tabLogin").onclick  = ()=>setAuthMode("login");
$("tabSignup").onclick = ()=>setAuthMode("signup");
function setAuthMode(m){
  authMode = m;
  $("tabLogin").classList.toggle("on", m==="login");
  $("tabSignup").classList.toggle("on", m==="signup");
  $("nameRow").classList.toggle("hide", m!=="signup");
  $("aSubmit").textContent = m==="login" ? "로그인" : "회원가입";
  $("aMsg").textContent = "";
}
$("aSubmit").onclick = doAuth;
["aEmail","aPw","aName"].forEach(id=>$(id).addEventListener("keydown",e=>{ if(e.key==="Enter") doAuth(); }));

async function doAuth(){
  const email = $("aEmail").value.trim(), pw = $("aPw").value;
  const msg = $("aMsg"); msg.className="msg";
  if(!email || !pw){ msg.className="msg err"; msg.textContent="이메일과 비밀번호를 입력해 주세요."; return; }
  $("aSubmit").disabled = true;
  try{
    if(authMode==="signup"){
      const name = $("aName").value.trim();
      if(!name){ msg.className="msg err"; msg.textContent="이름을 입력해 주세요."; return; }
      const { error } = await sb.auth.signUp({ email, password: pw, options:{ data:{ name } } });
      if(error) throw error;
      msg.className="msg ok"; msg.textContent="가입이 완료되었습니다. 로그인해 주세요.";
      setTimeout(()=>setAuthMode("login"), 600);
    }else{
      const { error } = await sb.auth.signInWithPassword({ email, password: pw });
      if(error) throw error;
    }
  }catch(e){
    msg.className="msg err";
    msg.textContent = /Invalid login/i.test(e.message) ? "이메일 또는 비밀번호가 올바르지 않습니다." : e.message;
  }finally{ $("aSubmit").disabled = false; }
}

$("btnLogout").onclick = async ()=>{ await sb.auth.signOut(); location.reload(); };
$("btnRename").onclick = async ()=>{
  const nm = prompt("표시할 이름을 입력하세요.", ME.name);
  if(!nm || !nm.trim()) return;
  const { error } = await sb.from("profiles").update({ name: nm.trim() }).eq("id", ME.id);
  if(error){ alert(error.message); return; }
  ME.name = nm.trim(); $("myName").textContent = ME.name; toast("이름을 변경했습니다.");
};

let booted = false;
sb.auth.onAuthStateChange((_e, session)=>{ if(session && !booted) boot(session); });
(async ()=>{ const { data } = await sb.auth.getSession(); if(data.session && !booted) boot(data.session); })();

async function boot(session){
  if(booted) return; booted = true;
  const u = session.user;
  let { data: prof } = await sb.from("profiles").select("*").eq("id", u.id).maybeSingle();
  if(!prof){
    await sb.from("profiles").insert({ id:u.id, name:(u.user_metadata?.name || u.email.split("@")[0]) });
    ({ data: prof } = await sb.from("profiles").select("*").eq("id", u.id).maybeSingle());
  }
  ME = { id:u.id, email:u.email, name:prof?.name || u.email.split("@")[0], role:prof?.role || "member" };
  $("myName").textContent = ME.name;
  const badge = $("roleBadge");
  badge.classList.toggle("hide", ME.role==="member");
  badge.textContent = ROLE_LABEL[ME.role] || "";
  $("authView").classList.add("hide");
  $("appView").classList.remove("hide");

  bindUI();
  await loadSettings();
  await loadYears();
  await loadYear(YEARS.includes(new Date().getFullYear()) ? new Date().getFullYear() : YEARS[YEARS.length-1]);
}

/* ===================== 설정 · 연도 ===================== */
async function loadSettings(){
  const { data, error } = await sb.from("app_settings").select("*");
  if(error || !data) return;
  data.forEach(r=>{
    let items = r.items;
    if(typeof items === "string"){ try{ items = JSON.parse(items); }catch(e){ items = []; } }
    if(Array.isArray(items)) SETTINGS[r.key] = items;
  });
}

async function saveSetting(key, items){
  const payload = { key, items, updated_at:new Date().toISOString(), updated_by:ME.id, updated_name:ME.name };
  let { error } = await sb.from("app_settings").update(payload).eq("key", key);
  if(error) ({ error } = await sb.from("app_settings").insert(payload));
  if(error) throw error;
  SETTINGS[key] = items;
}

/** 연도 탭 = 데이터가 실제로 있는 연도 ∪ 설정에서 수동 추가한 연도 */
async function loadYears(){
  const set = new Set((SETTINGS.years || []).map(Number).filter(Boolean));
  try{
    const { data, error } = await sb.rpc("sales_years");
    if(!error && data) data.forEach(r=> set.add(Number(r.y ?? r)));
  }catch(e){ /* rpc 미지원 환경 무시 */ }
  if(!set.size) set.add(new Date().getFullYear());
  YEARS = [...set].filter(y=>y>2000 && y<2100).sort((a,b)=>a-b);
  renderYearTabs();
}

function renderYearTabs(){
  $("yearTabs").innerHTML = YEARS.map(y=>
    `<button data-y="${y}" class="${y===YEAR?"on":""}">${String(y).slice(2)}년</button>`).join("");
  $("yearTabs").querySelectorAll("button").forEach(b=>{
    b.onclick = ()=>loadYear(Number(b.dataset.y));
  });
  $("btnAddYear").classList.toggle("hide", !isAdmin());
}

async function addYear(){
  const cur = new Date().getFullYear();
  const v = prompt("추가할 연도를 입력하세요. (예: " + (cur+1) + ")", String(cur+1));
  if(!v) return;
  const y = Number(String(v).trim());
  if(!y || y<2000 || y>2100){ toast("연도는 2000~2100 사이 숫자로 입력해 주세요."); return; }
  if(YEARS.includes(y)){ loadYear(y); return; }
  try{
    await saveSetting("years", [...new Set([...(SETTINGS.years||[]).map(Number), y])].sort((a,b)=>a-b));
    await loadYears();
    await loadYear(y);
    toast(y + "년 탭을 추가했습니다.");
  }catch(e){ toast("연도 추가 실패: " + e.message); }
}
</script>

/* 테스트용 가짜 Supabase (실제 서버 없이 앱 로직만 검증) */
(function(){
  const DB = {
    profiles: [],
    sales_rows: [],
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
  let session = null;
  const listeners = [];
  const uuid = () => 'x'+Math.random().toString(36).slice(2)+Date.now().toString(36);
  const fiscal = r => Number(String(r.revenue_month || r.propose_month || '').slice(0,4)) || 0;

  function builder(table){
    const st = { op:'select', filters:[], from:0, to:1e9, order:null, payload:null, single:false, count:false, head:false };
    const api = {
      select(_c, opt){ if(opt && opt.count) st.count = true; if(opt && opt.head) st.head = true; return api; },
      insert(v){ st.op='insert'; st.payload = Array.isArray(v)?v:[v]; return api; },
      update(v){ st.op='update'; st.payload = v; return api; },
      delete(){ st.op='delete'; return api; },
      eq(k,v){ st.filters.push([k,v]); return api; },
      order(k,o){ st.order = [k, o&&o.ascending===false?-1:1]; return api; },
      range(a,b){ st.from=a; st.to=b; return api; },
      maybeSingle(){ st.single=true; return api; },
      then(res, rej){ return run().then(res, rej); }
    };
    function match(row){ return st.filters.every(([k,v])=>String(row[k])===String(v)); }
    async function run(){
      const T = DB[table];
      if(st.op==='insert'){
        const now = new Date().toISOString();
        const added = st.payload.map(p=>{
          const r = Object.assign({ id: uuid(), created_at: now, updated_at: now }, p);
          if(table==='sales_rows') r.fiscal_year = fiscal(r);
          return r;
        });
        T.push(...added);
        return { data: added, error: null };
      }
      if(st.op==='update'){
        let n=0;
        T.forEach((r,i)=>{ if(match(r)){ Object.assign(T[i], st.payload); if(table==='sales_rows') T[i].fiscal_year = fiscal(T[i]); n++; } });
        if(!n && table==='app_settings') return { data:null, error:{ message:'no row' } };
        return { data:null, error:null, count:n };
      }
      if(st.op==='delete'){
        for(let i=T.length-1;i>=0;i--) if(match(T[i])) T.splice(i,1);
        return { data:null, error:null };
      }
      let rows = T.filter(match);
      if(st.count) return { data: st.head ? null : rows, count: rows.length, error: null };
      if(st.order) rows = rows.slice().sort((a,b)=>String(a[st.order[0]]).localeCompare(String(b[st.order[0]]))*st.order[1]);
      rows = rows.slice(st.from, st.to+1);
      return { data: st.single ? (rows[0]||null) : rows, error: null };
    }
    return api;
  }

  window.supabase = {
    createClient(){
      return {
        auth: {
          async getSession(){ return { data:{ session } }; },
          onAuthStateChange(cb){ listeners.push(cb); return { data:{ subscription:{ unsubscribe(){} } } }; },
          async signUp({ email, password, options }){
            const user = { id: uuid(), email, user_metadata:{ name: options?.data?.name } };
            DB.profiles.push({ id:user.id, name: options?.data?.name || email.split('@')[0], role:'member' });
            return { data:{ user }, error:null };
          },
          async signInWithPassword({ email }){
            let p = DB.profiles[0];
            if(!p){ const id = uuid(); p = { id, name: email.split('@')[0], role: (window.__ROLE || 'lead') }; DB.profiles.push(p); }
            session = { user:{ id:p.id, email, user_metadata:{ name:p.name } } };
            listeners.forEach(cb=>cb('SIGNED_IN', session));
            return { data:{ session }, error:null };
          },
          async signOut(){ session = null; return { error:null }; }
        },
        from: (t)=>builder(t),
        async rpc(name){
          if(name === 'sales_years'){
            const ys = [...new Set(DB.sales_rows.map(r=>r.fiscal_year).filter(Boolean))].sort();
            return { data: ys.map(y=>({ y })), error:null };
          }
          return { data:null, error:{ message:'unknown rpc' } };
        },
        channel(){ return { on(){ return this; }, subscribe(){ return this; } }; },
        removeChannel(){}
      };
    }
  };
  window.__DB = DB;
})();

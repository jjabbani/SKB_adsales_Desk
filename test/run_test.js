/* 앱 전체 자동 검증 (Playwright + 가짜 Supabase) */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');

const ROOT = path.join(__dirname, '..');
const SRC_XLSX = process.argv[2];
const SRC_XLSX25 = process.argv[3];
const OUT_DIR  = path.join(__dirname, 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });

const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8')
  .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[^"]*"><\/script>/,
           '<script src="/fake_supabase.js"></script>')
  .replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx[^"]*"><\/script>/,
           '<script src="/xlsx.js"></script>');

const server = http.createServer((req, res) => {
  if (req.url === '/fake_supabase.js') { res.writeHead(200, {'Content-Type':'text/javascript'}); res.end(fs.readFileSync(path.join(__dirname,'fake_supabase.js'))); }
  else if (req.url === '/xlsx.js') { res.writeHead(200, {'Content-Type':'text/javascript'}); res.end(fs.readFileSync(path.join(__dirname,'node_modules/xlsx/dist/xlsx.full.min.js'))); }
  else { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(html); }
});

const fails = [];
const ok = (name, cond, extra='') => { console.log((cond?'  PASS  ':'  FAIL  ') + name + (extra?' — '+extra:'')); if(!cond) fails.push(name); };
const comma_ = n => n.toLocaleString('ko-KR');
const years = p => p.evaluate(() => [...document.querySelectorAll('#yearTabs button')].map(b=>b.textContent));

(async () => {
  await new Promise(r => server.listen(4321, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport:{width:1440,height:1000} });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { const t=m.text(); if (m.type()==='error' && !/Failed to load resource|ERR_TUNNEL|fonts\.googleapis/.test(t)) errs.push('console: '+t); });
  await page.goto('http://localhost:4321/');
  await page.waitForFunction(() => typeof XLSX !== 'undefined', null, { timeout: 30000 });

  /* 1) 로그인 (팀장 권한) */
  await page.fill('#aEmail', 'lead@company.com');
  await page.fill('#aPw', 'pw1234');
  await page.click('#aSubmit');
  await page.waitForSelector('#appView:not(.hide)', { timeout: 10000 });
  ok('로그인 후 앱 진입', true);
  ok('첫 화면 기본값 = 현재월 현황 탭',
     await page.evaluate(()=>!document.getElementById('viewDash').classList.contains('hide')
                          && document.querySelector('.tabs button.on').dataset.view==='dash'));

  /* 2) 서체 */
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  ok('Noto Sans KR 적용', /Noto Sans KR/.test(font), font.split(',')[0]);
  const tnum = await page.evaluate(() => getComputedStyle(document.body).fontVariantNumeric);
  ok('숫자 tabular-nums 적용', /tabular/.test(tnum), tnum);

  /* 3) 연도 탭 — 데이터 없을 때 */
  ok('데이터 없을 때 연도 탭은 올해 하나만', (await years(page)).length === 1, (await years(page)).join(','));

  /* 4) 엑셀 업로드 */
  await page.click('.tabs button[data-view="list"]');
  await page.click('#btnUpload');
  await page.setInputFiles('#fileInput', SRC_XLSX);
  await page.waitForSelector('#upResult:not(.hide)', { timeout: 20000 });
  await page.click('#btnDoImport');
  await page.waitForFunction(() => /등록했습니다/.test(document.getElementById('upMsg').textContent), null, { timeout: 60000 });
  await page.waitForTimeout(1800);
  const dbCount = await page.evaluate(() => window.__DB.sales_rows.length);
  ok('엑셀 업로드 건수', dbCount === 1154, dbCount + '건');
  ok('업로드 후 연도 탭은 데이터 있는 연도만', JSON.stringify(await years(page)) === '["26년"]', (await years(page)).join(','));

  /* 4-1) 26년 시트 왕복 검증용 내려받기 (25년 병합 전) */
  const [dl] = await Promise.all([ page.waitForEvent('download', { timeout: 30000 }), page.click('#btnDownload') ]);
  await dl.saveAs(path.join(OUT_DIR, 'roundtrip.xlsx'));
  ok('엑셀 내려받기', fs.existsSync(path.join(OUT_DIR, 'roundtrip.xlsx')));

  /* 4-2) 25년 시트 업로드 — 헤더가 "NO"/"돈터치"로 깨져 있어도 인식 */
  await page.click('#btnUpload');
  await page.setInputFiles('#fileInput', SRC_XLSX25);
  await page.waitForSelector('#upResult:not(.hide)', { timeout: 30000 });
  const sum25 = await page.textContent('#upSummary');
  console.log('  25년 미리보기:', sum25.replace(/\s+/g,' ').slice(0,170));
  await page.click('#btnDoImport');
  await page.waitForFunction(() => /등록했습니다/.test(document.getElementById('upMsg').textContent), null, { timeout: 90000 });
  await page.waitForTimeout(2200);
  const c25 = await page.evaluate(() => window.__DB.sales_rows.filter(r=>r.fiscal_year===2025).length);
  const cAll = await page.evaluate(() => window.__DB.sales_rows.length);
  // 25년 시트에는 매출월이 26년인 건이 38건 있고, 그중 26년 시트와 완전히 같은 27건은 중복으로 제외됩니다.
  ok('25년 시트 업로드', cAll === 1154 + 2583 - 27 && c25 === 2545, `총 ${comma_(cAll)}건 (25년 분류 ${comma_(c25)}건)`);
  ok('25년 탭 생성', JSON.stringify(await years(page)) === '["25년","26년"]', (await years(page)).join(','));
  const norm = await page.evaluate(()=>{
    const v = k => [...new Set(window.__DB.sales_rows.map(r=>r[k]).filter(Boolean))].sort();
    return { promo: v('promotion'), added: v('added_value') };
  });
  ok('프로모션 이름 통일', !norm.promo.some(v=>/\(/.test(v)), norm.promo.join(' / '));
  ok('Added Value 이름 통일', !norm.added.some(v=>/\(|PKG/.test(v)), norm.added.join(' / '));
  await page.click('#yearTabs button[data-y="2026"]');
  await page.waitForTimeout(900);

  /* 5) 신규 등록 — 텍스트 입력 / 기본값 없음 / 27년 탭 자동 생성 */
  await page.click('#btnNew');
  const types = await page.evaluate(() => ({
    agency: document.getElementById('iAgency').tagName,
    adv:    document.getElementById('iAdvertiser').tagName,
    brand:  document.getElementById('iBrand').tagName,
    promo:  document.getElementById('iPromo').tagName,
    added:  document.getElementById('iAdded').tagName
  }));
  ok('대행사·광고주·브랜드는 텍스트 입력',
     types.agency==='INPUT' && types.adv==='INPUT' && types.brand==='INPUT', JSON.stringify(types));
  const defs = await page.evaluate(() => ({
    promo: document.getElementById('iPromo').value,
    promoOpts: [...document.getElementById('iPromo').options].map(o=>o.textContent),
    added: document.getElementById('iAdded').value,
    addedOpts: [...document.getElementById('iAdded').options].map(o=>o.textContent)
  }));
  ok('프로모션 기본값 없음 + 기본 2개 + 실제 데이터 값 반영',
     defs.promo==='' && defs.promoOpts[0]==='없음'
     && ['신규광고주','제안프로모션'].every(v=>defs.promoOpts.includes(v))
     && ['공공지자체','증액프로모션','커머스링크'].every(v=>defs.promoOpts.includes(v))
     && !defs.promoOpts.some(v=>/\(/.test(v)), defs.promoOpts.join('/'));
  ok('Added Value 기본값 없음 + 기본 4개 + 실제 데이터 값 반영',
     defs.added==='' && defs.addedOpts[0]==='없음'
     && ['소노리조트','약국미디어보드','카카오VX','이마트DOOH'].every(v=>defs.addedOpts.includes(v))
     && !defs.addedOpts.some(v=>/PKG|\(/.test(v)), defs.addedOpts.join('/'));

  await page.fill('#iDate', '2027-01-15');
  await page.fill('#iExecMonth', '2027-03');
  await page.fill('#iRevMonth', '2027-03');
  await page.selectOption('#iStage', '수주');
  await page.fill('#iAgency', '테스트대행사');
  await page.fill('#iAdvertiser', '테스트광고주');
  await page.fill('#iBrand', '테스트브랜드');
  await page.fill('#iAmount', '5000000');
  await page.fill('#iBasic', '15000000');
  const basicShown = await page.inputValue('#iBasic');
  ok('Basic 총예산 숫자 입력 시 콤마', basicShown === '15,000,000', basicShown);
  await page.fill('#iBasic', 'OK +ENA 채널 포함');
  ok('Basic 총예산 메모성 텍스트는 그대로', (await page.inputValue('#iBasic')) === 'OK +ENA 채널 포함');
  await page.fill('#iBasic', '15000000');
  await page.click('#btnSaveRow');
  await page.waitForTimeout(1500);
  ok('27년 매출 등록 시 27년 탭 생성', JSON.stringify(await years(page)) === '["25년","26년","27년"]', (await years(page)).join(','));
  ok('저장 후 27년 탭으로 이동', await page.evaluate(()=>document.querySelector('#yearTabs button.on').textContent) === '27년');

  /* 6) 26년으로 복귀 → 현재월 현황 */
  await page.click('#yearTabs button[data-y="2026"]');
  await page.waitForTimeout(900);
  await page.click('.tabs button[data-view="dash"]');
  await page.waitForTimeout(400);
  const dashTab = await page.evaluate(()=>document.getElementById('tabDashLabel').textContent);
  ok('첫 탭 이름이 "0월 현황"', /^\d{1,2}월 현황$/.test(dashTab), dashTab);
  const curKpi = await page.evaluate(()=>[...document.querySelectorAll('#kpis .kpi .t')].map(e=>e.textContent));
  ok('현재월 KPI 4종', JSON.stringify(curKpi)===JSON.stringify(['제안 건수','제안 금액','수주 건수','수주 금액']), curKpi.join(' / '));
  await page.selectOption('#curMonth', '2026-09');
  await page.waitForTimeout(400);
  ok('기준 월 변경 시 탭 이름 반영', (await page.evaluate(()=>document.getElementById('tabDashLabel').textContent)) === '9월 현황');
  const tops = await page.evaluate(()=>({
    product: [...document.querySelectorAll('#topProduct tbody tr')].length,
    channel: [...document.querySelectorAll('#topChannel tbody tr')].length,
    rep:     [...document.querySelectorAll('#topRep tbody tr')].length,
    head:    document.querySelector('#topRep thead th:nth-child(3)').textContent
  }));
  ok('상품·채널·미디어렙 상위 10 노출',
     tops.product>1 && tops.channel>1 && tops.rep>1 && tops.head==='수주 금액',
     `상품 ${tops.product}행 / 채널 ${tops.channel}행 / 렙 ${tops.rep}행`);
  const over10 = await page.evaluate(()=>[...document.querySelectorAll('#topRep tbody tr')]
      .filter(r=>!r.classList.contains('tot') && r.children[0].textContent.trim()!=='').length);
  ok('상위 10개까지만', over10 <= 10, over10 + '개');
  const tabNames = await page.evaluate(()=>[...document.querySelectorAll('.tabs button')].map(b=>b.textContent.trim()));
  ok('탭 이름 변경 (매출 분석 / 전체 데이터 / ＋신규 등록)',
     tabNames.includes('매출 분석') && tabNames.includes('전체 데이터') && tabNames.some(t=>/신규 등록/.test(t)), tabNames.join(' | '));
  await page.screenshot({ path: path.join(OUT_DIR, 'current.png') });

  /* 7) 수주 분석 (월별 제안·수주 현황 + 피벗) */
  await page.click('.tabs button[data-view="pivot"]');
  await page.waitForSelector('#chart svg', { timeout: 10000 });
  ok('월별 제안·수주 현황이 수주 분석 탭으로 이동',
     await page.evaluate(()=>document.querySelectorAll('#chart svg path').length) > 0);
  await page.waitForSelector('#pivotTbl tbody tr', { timeout: 10000 });
  const pv = await page.evaluate(() => {
    const head = [...document.querySelectorAll('#pivotTbl thead th')].map(t=>t.textContent);
    const first = [...document.querySelectorAll('#pivotTbl tbody tr')][0];
    return { head, dim: first.children[0].textContent, rows: document.querySelectorAll('#pivotTbl tbody tr').length,
             info: document.getElementById('pvInfo').textContent };
  });
  ok('피벗 열이 최신 월부터 왼쪽 정렬',
     pv.head[1]==='9월' && pv.head[2]==='8월' && pv.head[9]==='1월', pv.head.join(' '));
  ok('미도래 월(10~12월) 기본 숨김', !pv.head.includes('10월') && !pv.head.includes('12월'), pv.head.join(' '));
  ok('수주만 집계', /수주/.test(pv.info), pv.info.slice(0, 70));
  ok('미디어렙사별은 미입력 제외',
     await page.evaluate(()=>![...document.querySelectorAll('#pivotTbl tbody td.dim')].some(t=>t.textContent==='(미입력)')));

  // 미도래 월 토글
  await page.click('#btnFuture2');
  await page.waitForTimeout(400);
  const withFuture = await page.evaluate(()=>[...document.querySelectorAll('#pivotTbl thead th')].map(t=>t.textContent));
  ok('미도래 월 버튼으로 10~12월 노출',
     withFuture[1]==='12월' && withFuture[2]==='11월' && withFuture[3]==='10월', withFuture.slice(0,5).join(' '));
  await page.click('#btnFuture2'); await page.waitForTimeout(400);

  // 검색창 노출 조건
  const qVis = async () => page.evaluate(()=>!document.getElementById('pvQBox').classList.contains('hide'));
  ok('검색창 — 미디어렙사별에서 노출', await qVis());
  await page.selectOption('#pvDim','product'); await page.waitForTimeout(250);
  ok('검색창 — 상품별에서 숨김', !(await qVis()));
  await page.selectOption('#pvDim','advertiser'); await page.waitForTimeout(250);
  ok('검색창 — 광고주별에서 노출', await qVis());
  await page.selectOption('#pvDim','industry'); await page.waitForTimeout(250);
  ok('업종별은 미입력 유지',
     await page.evaluate(()=>[...document.querySelectorAll('#pivotTbl tbody td.dim')].some(t=>t.textContent==='(미입력)')));
  await page.selectOption('#pvDim','rep'); await page.waitForTimeout(250);

  await page.fill('#pvQ', '나스');
  await page.waitForTimeout(400);
  const searched = await page.evaluate(()=>[...document.querySelectorAll('#pivotTbl tbody tr')].filter(r=>!r.classList.contains('tot')).length);
  ok('피벗 항목 검색', searched >= 1 && searched < pv.rows, searched + '행');
  await page.fill('#pvQ', ''); await page.waitForTimeout(300);

  await page.selectOption('#pvMonth', '2026-03');
  await page.waitForTimeout(300);
  const mo = await page.evaluate(()=>[...document.querySelectorAll('#pivotTbl thead th')].map(t=>t.textContent));
  ok('월 단독 보기', mo.filter(x=>/월$/.test(x)).length === 1, mo.join(' '));
  await page.selectOption('#pvMonth', ''); await page.waitForTimeout(300);

  for (const d of ['channel','product','industry']) {
    await page.selectOption('#pvDim', d);
    await page.waitForTimeout(250);
    const n = await page.evaluate(()=>document.querySelectorAll('#pivotTbl tbody tr').length);
    ok('구분 기준 전환: ' + d, n > 1, n + '행');
  }
  await page.selectOption('#pvDim', 'rep');
  await page.click('#pvValue button[data-v="count"]');
  await page.waitForTimeout(250);
  ok('금액/건수 전환', /합계 [\d,]+건/.test(await page.evaluate(()=>document.getElementById('pvInfo').textContent)));
  await page.screenshot({ path: path.join(OUT_DIR, 'pivot.png') });

  /* 6-2) 연도 비교 탭 */
  await page.click('.tabs button[data-view="compare"]');
  await page.waitForSelector('#cmpTbl tbody tr', { timeout: 15000 });
  const cmp = await page.evaluate(()=>({
    a: document.getElementById('cmpA').value,
    b: document.getElementById('cmpB').value,
    head: [...document.querySelectorAll('#cmpTbl thead th')].map(t=>t.textContent),
    rows: document.querySelectorAll('#cmpTbl tbody tr').length,
    kpi: [...document.querySelectorAll('#cmpKpis .kpi .t')].map(t=>t.textContent),
    chart: document.querySelectorAll('#cmpChart svg path').length,
    info: document.getElementById('cmpInfo').textContent
  }));
  ok('연도 비교 기본값 = 25년 vs 26년', cmp.a==='2025' && cmp.b==='2026', cmp.a+' vs '+cmp.b);
  ok('같은 기간(1~9월)만 비교 기본 적용', cmp.rows === 10 && /같은 기간/.test(cmp.info), cmp.rows+'행 · '+cmp.info.slice(-30));
  await page.uncheck('#cmpSame'); await page.waitForTimeout(400);
  const full = await page.evaluate(()=>document.querySelectorAll('#cmpTbl tbody tr').length);
  ok('체크 해제 시 12개월 전체 비교', full === 13, full+'행');
  await page.check('#cmpSame'); await page.waitForTimeout(400);
  ok('연도 열 머리글', cmp.head.includes('2025년') && cmp.head.includes('2026년'), cmp.head.join(' '));
  ok('증감·증감률 열', cmp.head.includes('증감') && cmp.head.includes('증감률'), cmp.head.join(' '));
  ok('연도 비교 KPI 4종', cmp.kpi.length===4 && /증감률/.test(cmp.kpi[3]), cmp.kpi.join(' / '));
  ok('월별 비교 차트', cmp.chart > 0, cmp.chart+'개 막대');
  console.log('  연도 비교:', cmp.info);

  for (const d of ['product','channel','rep','industry']) {
    await page.selectOption('#cmpDim', d);
    await page.waitForTimeout(400);
    const n = await page.evaluate(()=>document.querySelectorAll('#cmpTbl tbody tr').length);
    const chartHidden = await page.evaluate(()=>document.getElementById('cmpChartBox').classList.contains('hide'));
    ok('연도 비교 구분 전환: ' + d, n > 1 && chartHidden, n+'행');
  }
  await page.selectOption('#cmpDim','rep'); await page.waitForTimeout(300);
  ok('연도 비교 미디어렙사별 미입력 제외',
     await page.evaluate(()=>![...document.querySelectorAll('#cmpTbl tbody td.dim')].some(t=>t.textContent==='(미입력)')));
  await page.fill('#cmpQ','나스'); await page.waitForTimeout(400);
  ok('연도 비교 항목 검색',
     await page.evaluate(()=>[...document.querySelectorAll('#cmpTbl tbody tr')].filter(r=>!r.classList.contains('tot')).length) === 1);
  await page.fill('#cmpQ',''); await page.waitForTimeout(300);
  await page.click('#cmpValue button[data-v="count"]'); await page.waitForTimeout(300);
  ok('연도 비교 금액/건수 전환', /건 →/.test(await page.evaluate(()=>document.getElementById('cmpInfo').textContent)));
  await page.selectOption('#cmpDim','month'); await page.click('#cmpValue button[data-v="amount"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT_DIR, 'compare.png') });

  /* 7) 설정 탭 — 추가 / 수정 / 삭제 */
  await page.click('.tabs button[data-view="settings"]');
  await page.waitForSelector('#setGrid .set-card', { timeout: 10000 });
  const cards = await page.evaluate(()=>[...document.querySelectorAll('#setGrid .set-card .h b')].map(b=>b.textContent));
  ok('설정 카드 6종', cards.length === 6, cards.join(' / '));

  await page.fill('#setGrid [data-add="rep"]', '테스트렙사');
  await page.click('#setGrid [data-addbtn="rep"]');
  await page.waitForTimeout(600);
  ok('설정 항목 추가', await page.evaluate(()=>window.__DB.app_settings.find(s=>s.key==='rep').items.includes('테스트렙사')));

  await page.evaluate(() => {
    const card = document.querySelector('#setGrid .set-card[data-key="rep"]');
    const items = [...card.querySelectorAll('.set-item')];
    const target = items.find(el => el.querySelector('.nm').textContent === '테스트렙사');
    target.querySelector('[data-act="edit"]').click();
  });
  await page.fill('#setGrid .set-card[data-key="rep"] input.ed', '테스트렙사2');
  await page.click('#setGrid .set-card[data-key="rep"] [data-ok]');
  await page.waitForTimeout(600);
  ok('설정 항목 이름 변경', await page.evaluate(()=>window.__DB.app_settings.find(s=>s.key==='rep').items.includes('테스트렙사2')));

  page.once('dialog', d => d.accept());
  await page.evaluate(() => {
    const card = document.querySelector('#setGrid .set-card[data-key="rep"]');
    const target = [...card.querySelectorAll('.set-item')].find(el => el.querySelector('.nm').textContent === '테스트렙사2');
    target.querySelector('[data-act="del"]').click();
  });
  await page.waitForTimeout(700);
  ok('설정 항목 삭제', await page.evaluate(()=>!window.__DB.app_settings.find(s=>s.key==='rep').items.includes('테스트렙사2')));
  await page.screenshot({ path: path.join(OUT_DIR, 'settings.png') });

  /* 8) 목록 · 검색 · 대시보드 */
  await page.click('.tabs button[data-view="list"]');
  await page.waitForSelector('#dataTbl tbody tr', { timeout: 10000 });
  const amtCell = await page.evaluate(() => document.querySelector('#dataTbl tbody tr').children[13].textContent.trim());
  ok('목록 금액 천단위 콤마', /^\d{1,3}(,\d{3})*$/.test(amtCell), amtCell);
  await page.fill('#fQ', '나스미디어'); await page.waitForTimeout(400);
  ok('통합 검색', await page.evaluate(()=>document.querySelectorAll('#dataTbl tbody tr').length) > 0);
  await page.fill('#fQ', ''); await page.waitForTimeout(400);
  const colsDefault = await page.evaluate(()=>[...document.querySelectorAll('#dataTbl thead th')].map(t=>t.textContent.replace(/[▲▼ ]/g,'')));
  ok('추가 4개 열 기본 숨김',
     !colsDefault.includes('Basic 총예산') && !colsDefault.includes('비고')
     && !colsDefault.includes('Added Value 활용') && !colsDefault.includes('프로모션 적용여부'), colsDefault.join(' '));
  await page.click('#btnExtraCols'); await page.waitForTimeout(300);
  const colsOpen = await page.evaluate(()=>[...document.querySelectorAll('#dataTbl thead th')].map(t=>t.textContent.replace(/[▲▼ ]/g,'')));
  ok('버튼으로 추가 열 펼치기',
     ['Basic총예산','비고','AddedValue활용','프로모션적용여부'].every(x=>colsOpen.join('').includes(x)), colsOpen.join(' '));

  const clipped = await page.evaluate(()=>{
    const tr = document.querySelector('#dataTbl tbody tr');
    const cells = [...tr.children];
    const bad = cells.filter(td=>td.classList.contains('clip'))
      .filter(td=>td.textContent.length>11 || (td.title.length>10 && !/…$/.test(td.textContent)));
    return { clipCount: cells.filter(td=>td.classList.contains('clip')).length, bad: bad.length };
  });
  ok('업종·광고주·브랜드·비고 10자 초과 시 … 처리', clipped.clipCount===4 && clipped.bad===0, JSON.stringify(clipped));

  // 상단 신규 등록 바로가기
  await page.click('.tabs button[data-view="dash"]'); await page.waitForTimeout(300);
  await page.click('#btnQuickNew'); await page.waitForTimeout(500);
  ok('＋신규 등록 바로가기',
     await page.evaluate(()=>!document.getElementById('rowModal').classList.contains('hide')
                          && !document.getElementById('viewList').classList.contains('hide')));
  await page.click('[data-close="rowModal"]'); await page.waitForTimeout(200);

  await page.click('.tabs button[data-view="pivot"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, 'pivot2.png') });

  ok('JS 런타임 오류 없음', errs.length === 0, errs.join(' / '));

  await browser.close();
  server.close();
  console.log(fails.length ? '\n실패 ' + fails.length + '건: ' + fails.join(', ') : '\n모든 검증 통과');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

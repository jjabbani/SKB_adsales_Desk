-- =====================================================================
-- 광고영업팀 매출관리 데스크 — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 RUN 하세요.
-- (여러 번 실행해도 안전합니다)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) profiles : 로그인 사용자 이름 / 역할
--    role = 'member' (팀원, 기본)
--         | 'lead'   (팀장   — 전체 수정·삭제 + 설정 관리)
--         | 'master' (마스터 — 전체 수정·삭제 + 설정 관리)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null default '',
  role       text not null default 'member',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2) sales_rows : 매출/제안 데이터 (엑셀 1행 = 1레코드)
-- ---------------------------------------------------------------------
create table if not exists public.sales_rows (
  id            uuid primary key default gen_random_uuid(),

  propose_date  date,          -- 제안일        (예: 2026-02-02)
  propose_month text,          -- 제안월        'YYYY-MM'  (제안일에서 자동 파생)
  exec_month    text,          -- 집행(예정)월  'YYYY-MM'
  revenue_month text,          -- 매출월        'YYYY-MM'
  stage         text,          -- 제안/수주
  channel       text,          -- 채널
  rep           text,          -- 미디어렙
  agency        text,          -- 대행사
  product       text,          -- 상품
  industry      text,          -- 업종
  advertiser    text,          -- 광고주
  brand         text,          -- 브랜드
  amount        bigint default 0,  -- 금액(원)
  basic_budget  text,          -- Basic 총예산
  note          text,          -- 비고
  added_value   text,          -- Added Value 활용
  promotion     text,          -- 프로모션 적용여부

  fiscal_year   int  not null,      -- 연도 탭 기준 = 매출월의 연도
  created_by    uuid references auth.users(id) on delete set null,
  created_name  text not null default '',
  updated_by    uuid references auth.users(id) on delete set null,
  updated_name  text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_sales_year        on public.sales_rows (fiscal_year);
create index if not exists idx_sales_rev_month   on public.sales_rows (revenue_month);
create index if not exists idx_sales_prop_month  on public.sales_rows (propose_month);
create index if not exists idx_sales_stage       on public.sales_rows (stage);
create index if not exists idx_sales_advertiser  on public.sales_rows (advertiser);
create index if not exists idx_sales_created_by  on public.sales_rows (created_by);

create or replace function public.sales_rows_touch()
returns trigger language plpgsql as $$
begin
  if new.revenue_month is not null and new.revenue_month <> '' then
    new.fiscal_year := substring(new.revenue_month from 1 for 4)::int;
  elsif new.propose_month is not null and new.propose_month <> '' then
    new.fiscal_year := substring(new.propose_month from 1 for 4)::int;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_sales_rows_touch on public.sales_rows;
create trigger trg_sales_rows_touch
  before insert or update on public.sales_rows
  for each row execute function public.sales_rows_touch();

-- 연도 탭에 쓸 "데이터가 실제로 있는 연도" 목록
create or replace function public.sales_years()
returns table(y int) language sql stable security definer set search_path = public as $$
  select distinct fiscal_year from public.sales_rows order by 1;
$$;

-- ---------------------------------------------------------------------
-- 3) app_settings : 설정 탭에서 관리하는 선택 항목 목록
--    key = 'rep' | 'channel' | 'product' | 'industry'
--        | 'promotion' | 'added_value' | 'years'(수동 추가 연도)
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key          text primary key,
  items        jsonb not null default '[]'::jsonb,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null,
  updated_name text not null default ''
);

insert into public.app_settings (key, items) values
  ('channel',  '["미디어렙", "대행사", "광고주", "Programmatic", "인포", "교환", "지역광고", "기타"]'::jsonb),
  ('rep',  '["나스미디어", "딜라이브", "KOBACO", "APM", "애드크래프트", "스카이라이프", "모아미디어", "인크로스", "메조미디어", "DMC미디어", "리노컴즈", "HCN", "이펙트원", "휴앤아이", "미디어에스", "다트미디어", "파스텔애드", "메인애드", "웰메이드씨존", "JCN울산방송", "어니스트컴퍼니", "미디어747", "드림에이지이", "케이티이엔에이", "애드고온", "디지털퍼스트", "페이백헬스케어", "애드원", "인포벨", "지에스", "이노바인코리아", "문화미디어렙", "KICAD", "프라이머스", "리얼투데이", "DK텔레콤", "엠투미디어", "바이메이더", "IGA웍스", "KPPL"]'::jsonb),
  ('product',  '["AD+", "Addr.Tv", "Basic", "C-실시간", "C-VOD", "VOD", "커머스", "온애드", "티온", "비즈챗", "지역", "ASUM", "시니어", "기타"]'::jsonb),
  ('industry',  '["기타", "제약 및 의료", "관공서 및 단체", "요식업", "서비스", "식음료", "건설,건재 및 부동산", "그룹 및 기업광고", "가정용품", "금융,보험 및 증권", "컴퓨터 및 정보통신", "유통", "교육 및 복지후생", "화장품 및 보건용품", "패션", "전기전자", "자동차"]'::jsonb),
  ('promotion',  '["신규광고주", "제안프로모션", "공공지자체", "증액프로모션", "커머스링크"]'::jsonb),
  ('added_value',  '["소노리조트", "약국미디어보드", "카카오VX", "이마트DOOH"]'::jsonb),
  ('years',  '[]'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 4) 회원가입 시 profiles 자동 생성
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 5) RLS 정책
--    조회      : 로그인한 팀원 전체
--    등록      : 로그인한 팀원 (본인 명의로만)
--    수정/삭제 : 본인이 등록한 행 + 팀장(lead) · 마스터(master)는 전체
--    설정 관리 : 팀장(lead) · 마스터(master)만
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('lead','master')
  );
$$;

alter table public.profiles     enable row level security;
alter table public.sales_rows   enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin());

drop policy if exists sales_select on public.sales_rows;
drop policy if exists sales_insert on public.sales_rows;
drop policy if exists sales_update on public.sales_rows;
drop policy if exists sales_delete on public.sales_rows;
create policy sales_select on public.sales_rows
  for select to authenticated using (true);
create policy sales_insert on public.sales_rows
  for insert to authenticated with check (created_by = auth.uid());
create policy sales_update on public.sales_rows
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());
create policy sales_delete on public.sales_rows
  for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

drop policy if exists settings_select on public.app_settings;
drop policy if exists settings_write  on public.app_settings;
drop policy if exists settings_update on public.app_settings;
create policy settings_select on public.app_settings
  for select to authenticated using (true);
create policy settings_write on public.app_settings
  for insert to authenticated with check (public.is_admin());
create policy settings_update on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 6) 실시간(Realtime) 발행
-- ---------------------------------------------------------------------
alter table public.sales_rows   replica identity full;
alter table public.app_settings replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.sales_rows;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.app_settings; exception when duplicate_object then null; end;
end $$;

-- ---------------------------------------------------------------------
-- 7) 권한 지정 (해당 계정이 회원가입을 마친 뒤 실행)
-- ---------------------------------------------------------------------
-- 마스터 계정
-- update public.profiles set role = 'master'
-- where id = (select id from auth.users where email = '마스터이메일@회사.com');
--
-- 팀장 계정
-- update public.profiles set role = 'lead'
-- where id = (select id from auth.users where email = '팀장이메일@회사.com');

-- CarbonWise Phase 3.5 schema (Supabase)
-- Use only anon/public keys on the frontend. RLS enforced by auth.uid().

create extension if not exists "pgcrypto";

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  country text not null,
  region text null,
  reporting_year_preference text null default 'all',
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;

create policy "Companies are scoped to owner (select)" on public.companies
  for select using (auth.uid() = user_id);
create policy "Companies are scoped to owner (insert)" on public.companies
  for insert with check (auth.uid() = user_id);
create policy "Companies are scoped to owner (update)" on public.companies
  for update using (auth.uid() = user_id);
create policy "Companies are scoped to owner (delete)" on public.companies
  for delete using (auth.uid() = user_id);

create table if not exists public.company_sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  country text not null,
  region text not null,
  is_hq boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.company_sites enable row level security;

create policy "Company sites scoped to owner (select)" on public.company_sites
  for select using (auth.uid() = (select user_id from public.companies where id = company_id));
create policy "Company sites scoped to owner (insert)" on public.company_sites
  for insert with check (auth.uid() = (select user_id from public.companies where id = company_id));
create policy "Company sites scoped to owner (update)" on public.company_sites
  for update using (auth.uid() = (select user_id from public.companies where id = company_id));
create policy "Company sites scoped to owner (delete)" on public.company_sites
  for delete using (auth.uid() = (select user_id from public.companies where id = company_id));

create unique index if not exists company_sites_unique_location
  on public.company_sites(company_id, country, region);
create unique index if not exists company_sites_unique_hq
  on public.company_sites(company_id) where is_hq;

create table if not exists public.scope2_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid null references public.company_sites(id) on delete restrict,
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  kwh numeric not null,
  location_based_emissions numeric not null,
  market_based_emissions numeric null,
  market_instrument_type text null,
  covered_kwh numeric null,
  emission_factor_value numeric not null,
  emission_factor_year int not null,
  emission_factor_source text not null,
  calc_country text not null,
  calc_region text not null,
  created_at timestamptz not null default now(),
  constraint scope2_period_not_future check (
    (period_year < date_part('year', now())::int)
    or (period_year = date_part('year', now())::int and period_month <= date_part('month', now())::int)
  )
);

alter table public.scope2_records enable row level security;

create policy "Scope2 records scoped to owner (select)" on public.scope2_records
  for select using (auth.uid() = user_id);
create policy "Scope2 records scoped to owner (insert)" on public.scope2_records
  for insert with check (auth.uid() = user_id);
create policy "Scope2 records scoped to owner (update)" on public.scope2_records
  for update using (auth.uid() = user_id);
create policy "Scope2 records scoped to owner (delete)" on public.scope2_records
  for delete using (auth.uid() = user_id);

-- Prevent duplicate periods per company/user/region
create unique index if not exists scope2_records_unique_period
  on public.scope2_records(user_id, company_id, period_year, period_month, calc_country, calc_region);

-- Helpful index for history listing
create index if not exists scope2_records_user_created_idx
  on public.scope2_records(user_id, created_at desc);

alter table public.scope1_records
  add column if not exists site_id uuid null references public.company_sites(id) on delete restrict;

create table if not exists public.scope3_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  period_year int not null,
  spend_country text not null,
  spend_region text not null,
  spend_amount numeric not null check (spend_amount >= 0),
  currency text not null,
  category_id text not null,
  category_label text not null,
  vendor_name text null,
  notes text null,
  eio_sector text not null,
  emission_factor_value numeric not null,
  emission_factor_year int not null,
  emission_factor_source text not null,
  emission_factor_model text not null,
  emission_factor_geo text not null,
  emission_factor_currency text not null,
  emissions numeric not null,
  created_at timestamptz not null default now(),
  constraint scope3_year_not_future check (
    period_year <= date_part('year', now())::int
  )
);

alter table public.scope3_records enable row level security;

create policy "Scope3 records scoped to owner (select)" on public.scope3_records
  for select using (auth.uid() = user_id);
create policy "Scope3 records scoped to owner (insert)" on public.scope3_records
  for insert with check (auth.uid() = user_id);
create policy "Scope3 records scoped to owner (update)" on public.scope3_records
  for update using (auth.uid() = user_id);
create policy "Scope3 records scoped to owner (delete)" on public.scope3_records
  for delete using (auth.uid() = user_id);

create index if not exists scope3_records_user_created_idx
  on public.scope3_records(user_id, created_at desc);

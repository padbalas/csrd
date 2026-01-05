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
drop policy if exists "Company sites scoped to owner (insert)" on public.company_sites;
create policy "Company sites scoped to owner (insert)" on public.company_sites
  for insert with check (
    auth.uid() = (select user_id from public.companies where id = company_id)
    and (
      select count(*)
      from public.company_sites s
      where s.company_id = company_id
    ) < coalesce(
      (select e.max_sites from public.entitlements e where e.company_id = company_id),
      1
    )
  );
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
drop policy if exists "Scope2 records scoped to owner (insert)" on public.scope2_records;
create policy "Scope2 records scoped to owner (insert)" on public.scope2_records
  for insert with check (
    auth.uid() = user_id
    and (
      select count(*)
      from public.scope2_records r
      where r.user_id = auth.uid() and r.company_id = company_id
    ) < coalesce(
      (select e.max_scope2_records from public.entitlements e where e.company_id = company_id),
      5
    )
  );
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

alter table public.scope1_records enable row level security;

drop policy if exists "Scope1 records scoped to owner (select)" on public.scope1_records;
drop policy if exists "Scope1 records scoped to owner (insert)" on public.scope1_records;
drop policy if exists "Scope1 records scoped to owner (update)" on public.scope1_records;
drop policy if exists "Scope1 records scoped to owner (delete)" on public.scope1_records;

create policy "Scope1 records scoped to owner (select)" on public.scope1_records
  for select using (auth.uid() = user_id);
create policy "Scope1 records scoped to owner (insert)" on public.scope1_records
  for insert with check (
    auth.uid() = user_id
    and (
      select count(*)
      from public.scope1_records r
      where r.user_id = auth.uid() and r.company_id = company_id
    ) < coalesce(
      (select e.max_scope1_records from public.entitlements e where e.company_id = company_id),
      5
    )
  );
create policy "Scope1 records scoped to owner (update)" on public.scope1_records
  for update using (auth.uid() = user_id);
create policy "Scope1 records scoped to owner (delete)" on public.scope1_records
  for delete using (auth.uid() = user_id);

create table if not exists public.scope3_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  period_year int not null,
  period_month int null,
  spend_country text not null,
  spend_region text not null,
  spend_amount numeric null check (spend_amount >= 0),
  currency text null,
  category_id text not null,
  category_label text not null,
  vendor_name text null,
  notes text null,
  eio_sector text null,
  emission_factor_value numeric null,
  emission_factor_year int null,
  emission_factor_source text null,
  emission_factor_model text null,
  emission_factor_geo text null,
  emission_factor_currency text null,
  emissions_source text null,
  calculation_method text not null default 'eio',
  emissions numeric not null,
  created_at timestamptz not null default now(),
  constraint scope3_year_not_future check (
    period_year <= date_part('year', now())::int
  ),
  constraint scope3_month_valid check (
    period_month is null or (period_month between 1 and 12)
  )
);

alter table public.scope3_records
  add column if not exists emissions_source text null,
  add column if not exists calculation_method text not null default 'eio',
  add column if not exists period_month int null;

alter table public.scope3_records
  alter column spend_amount drop not null,
  alter column currency drop not null,
  alter column eio_sector drop not null,
  alter column emission_factor_value drop not null,
  alter column emission_factor_year drop not null,
  alter column emission_factor_source drop not null,
  alter column emission_factor_model drop not null,
  alter column emission_factor_geo drop not null,
  alter column emission_factor_currency drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scope3_month_valid'
  ) then
    alter table public.scope3_records
      add constraint scope3_month_valid
      check (period_month is null or (period_month between 1 and 12));
  end if;
end $$;

alter table public.scope3_records enable row level security;

create policy "Scope3 records scoped to owner (select)" on public.scope3_records
  for select using (auth.uid() = user_id);
drop policy if exists "Scope3 records scoped to owner (insert)" on public.scope3_records;
drop policy if exists "Scope3 records scoped to owner (update)" on public.scope3_records;
drop policy if exists "Scope3 records scoped to owner (delete)" on public.scope3_records;
create policy "Scope3 records scoped to owner (insert)" on public.scope3_records
  for insert with check (
    auth.uid() = user_id
    and coalesce(
      (select e.allow_scope3 from public.entitlements e where e.company_id = company_id),
      false
    )
  );
create policy "Scope3 records scoped to owner (update)" on public.scope3_records
  for update using (
    auth.uid() = user_id
    and coalesce(
      (select e.allow_scope3 from public.entitlements e where e.company_id = company_id),
      false
    )
  );
create policy "Scope3 records scoped to owner (delete)" on public.scope3_records
  for delete using (
    auth.uid() = user_id
    and coalesce(
      (select e.allow_scope3 from public.entitlements e where e.company_id = company_id),
      false
    )
  );

create index if not exists scope3_records_user_created_idx
  on public.scope3_records(user_id, created_at desc);

-- Subscription state and entitlements (Stripe-backed)
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  status text not null,
  tier text not null,
  current_period_end timestamptz null,
  updated_at timestamptz not null default now(),
  constraint subscriptions_tier_valid check (tier in ('free', 'core', 'complete'))
);

create unique index if not exists subscriptions_unique_stripe_sub
  on public.subscriptions(stripe_subscription_id);
create index if not exists subscriptions_company_idx
  on public.subscriptions(company_id);

alter table public.subscriptions enable row level security;

create policy "Subscriptions scoped to owner (select)" on public.subscriptions
  for select using (auth.uid() = user_id);

create table if not exists public.entitlements (
  company_id uuid primary key references public.companies(id) on delete cascade,
  tier text not null,
  max_scope1_records int null,
  max_scope2_records int null,
  allow_scope3 boolean not null default false,
  allow_exports boolean not null default false,
  allow_insights boolean not null default false,
  max_sites int null,
  updated_at timestamptz not null default now(),
  constraint entitlements_tier_valid check (tier in ('free', 'core', 'complete'))
);

alter table public.entitlements enable row level security;

create policy "Entitlements scoped to owner (select)" on public.entitlements
  for select using (
    auth.uid() = (select user_id from public.companies where id = company_id)
  );

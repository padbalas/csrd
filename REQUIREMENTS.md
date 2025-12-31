# CarbonWise (esgrise.com) Requirements

## Scope
Static, client-first web app hosted on GitHub Pages with Supabase Auth + Postgres (RLS) for data. The CarbonWise app lives at the repo root (static HTML/CSS/JS). Focused on self-service Scope 2 electricity emissions with privacy-first UX, plus a production Scope 1 natural gas estimator stored in Supabase (RLS-protected).

## Functional Requirements
1) **Landing & Calculator (`index.html`)**
   - Inputs: persona, country, region/state, billing month, billing year (no future periods), electricity (kWh).
   - Optional market-based fields (off by default): instrument type, covered kWh, reporting year.
   - Validation: block future months/years; allow current month with partial-period note; prevent covered kWh > total; market reporting year must be current or past.
   - Calculation: location-based Scope 2 using public, year-stamped factors from `data/emission-factors.js` (final data only); market-based uses uncovered kWh only when enabled.
   - Output: location-based tCO₂e, market-based tCO₂e (if provided), factor sentence (value/year/source/version/region), real-world comparison, mismatch note when activity year exceeds factor year.
   - CTA: save record (requires auth); post-save redirect to `records.html`.
   - **Auth modal**: email/password sign-in, email passcode sign-in (OTP), password reset link, password update flow.
   - **Scope 1 (Supabase-backed)**: optional natural gas entries stored in Supabase with month/year, location, quantity, unit, notes; shows estimate + factor details; toggle persisted locally.

2) **Authentication**
   - Supabase email/password, email passcode (OTP), password reset and update flows.
   - Auth gating:
     - `exports.html`, `insights.html`, `settings.html` redirect to landing if unauthenticated.
     - `records.html` shows a logged-out message if unauthenticated (no redirect).
   - No anonymous records stored in DB; unauthenticated users can calculate but cannot save/export.

3) **Records (`records.html`)**
   - Task-style list with filters: Reporting Year, Country, Region, Method (location/market).
   - Transaction row layout: emissions primary value, secondary month/region, method, View action.
   - Slide-out detail panel with View/Edit/Delete for Scope 2 entries. Edit recalculates emissions; Delete removes record in Supabase and local cache where applicable.
   - Add + Bulk add: inline slide-out forms for single and multi-row entry for Scope 2, with validation and Supabase upsert. Scope 2 supports optional market-based fields.
   - Carbon Snapshot: total, avg/month, highest region, coverage count, real-world comparison; respects current filters.
   - Insights & Reminders: missing-month ranges per region, region share >30%; respects filters and reporting year preference.
   - Export action (scoped): export current filtered view from records as CSV.
   - Local cache: `cw_records` mirrors Scope 2 for fast rendering, filters, and insights.
3a) **Scope 1 Records (`scope1.html`)**
   - Dedicated Scope 1 records page linked from the side nav.
   - Task-style list with filters: Reporting Year, Country, Region.
   - Add + Bulk add, View/Edit/Delete for Scope 1 natural gas entries, with validation and Supabase upsert.
   - Export action (scoped): export current filtered Scope 1 view as CSV.

4) **Export / Reports (`exports.html`)**
   - Auth required; redirect to landing if not authenticated.
   - Company display (first company) with country/region.
   - Year selector populated from records; default respects company reporting year preference (All/current/previous).
   - Export scope: exports all records (optionally year-filtered), not tied to Records filters.
   - CSV export (Scope 2): columns `company_name`, `period` (YYYY-MM), `country` (country/region display label), `kwh`, `scope2_location_based_tco2e`, `scope2_market_based_tco2e`, `emission_factor_value`, `emission_factor_year`, `emission_factor_source`; disclosure line “Location-based Scope 2 electricity calculation aligned with the GHG Protocol.”; CRLF line endings; UTF-8.
   - Scope 1 CSV export: exports natural gas entries from Supabase with Scope 1-specific columns and disclosure.
   - PDF export placeholder (disabled).
   - Loading/error states; buttons disabled while generating.

5) **Insights (`insights.html`)**
   - Auth required.
   - Year selector with default based on company reporting preference.
   - Monthly trend line for location-based emissions; regional contribution bars; data coverage count.
   - Pulls from Supabase when online; caches in localStorage and renders cached data if needed.

6) **Settings (`settings.html`)**
   - Auth required.
   - Company profile: name, country/region, reporting year preference (All/current/previous).
   - Updates the `companies` table and feeds defaults in Records/Exports/Insights.

7) **Navigation**
   - Side nav on app pages (records, scope 1 records, insights, exports, settings) with Log out.
   - Landing/calculator has header auth controls only.

## Non-Functional Requirements
- **Privacy-first:** No bill uploads; calculations without an account; Scope 1 entries stored in Supabase with RLS.
- **Security:** Supabase anon key only; RLS on all queries; no `service_role` in client; rely on Supabase auth session.
- **Performance:** Static assets only; minimal JS; CSV generated client-side.
- **UX:** Finance-grade tone; clear errors; avoid popups except prompts/modals; responsive layouts with sticky filters.

## Data & Storage
- **Supabase tables:**
  - `companies`: `id`, `user_id`, `company_name`, `country`, `region`, `reporting_year_preference`, `created_at`.
  - `scope2_records`: `id`, `user_id`, `company_id`, `period_year`, `period_month`, `kwh`, `location_based_emissions`, `market_based_emissions`, `market_instrument_type`, `covered_kwh`, `emission_factor_value`, `emission_factor_year`, `emission_factor_source`, `calc_country`, `calc_region`, `created_at`.
  - `scope1_records`: `id`, `user_id`, `company_id`, `period_year`, `period_month`, `country`, `region`, `quantity`, `unit`, `notes`, `emissions`, `factor_value`, `factor_year`, `factor_source`, `factor_basis`, `factor_label`, `created_at`.
- **Uniqueness:** records are unique per user/company/period/country/region.
- **Local storage:**
  - `cw_records` for Scope 2 cache.
  - `scope1_v1_beta_enabled` for Scope 1 toggle state.

## Disclaimers (user-facing)
- “Location-based Scope 2 electricity calculation aligned with the GHG Protocol.”
- Estimates only; not legal/tax/audit advice.
- Market-based inputs are user-declared; CarbonWise does not verify contracts or certificates.
- Scope 1 results are partial and not a full inventory.

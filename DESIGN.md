# CarbonWise (esgrise.com) – Design Document

## Overview
CarbonWise is a privacy-first, self-service carbon accounting frontend (static HTML/CSS/JS) hosted on GitHub Pages, backed by Supabase Auth + Postgres with RLS. The product focuses on Scope 2 electricity emissions (location-based by default, optional market-based) and includes a production Scope 1 natural gas estimator stored in Supabase. The CarbonWise app lives at the repo root.

## Goals
- Make carbon estimation and reporting fast, plain-English, and audit-friendly.
- Keep UX calm and finance-grade; avoid enterprise clutter.
- Preserve privacy: no uploads, minimal inputs, no personal data beyond auth and company.
- Enable trustworthy exports (CSV now; PDF later) that users can hand to auditors.

## Architecture
- **Frontend:** Static pages at the repo root (`index.html`, `records.html`, `scope1.html`, `insights.html`, `exports.html`, `settings.html`, `methodology.html`), vanilla JS modules in `js`.
- **Data:** Supabase Postgres with RLS enforcing `auth.uid()` on `companies` and `scope2_records`.
- **Auth:** Supabase email/password + email passcode (OTP) + password reset/update flows.
- **Local cache:** `localStorage` for Scope 2 records (`cw_records`) to power filters/snapshots/reminders; Scope 1 uses Supabase with optional local cache if needed for UI performance.
- **Navigation:** Side nav on app pages (records/insights/exports/settings); landing stays marketing/calculator-focused.

## Key Flows
1) **Calculate (index.html)**
   - Inputs: persona, country/region, month, year, kWh; optional market-based (instrument type, covered kWh, reporting year).
   - Validation: no future months/years; current month allowed with partial-period note; covered kWh ≤ total; market reporting year ≤ current.
   - Calculation: location-based emissions = kWh × factor; market-based emissions use uncovered kWh when enabled.
   - Output: location-based/market-based tCO₂e, factor sentence with year/source/version, mismatch note when activity year exceeds factor year, real-world comparison.
   - Save: requires auth; if company missing, prompts for company details; save upserts to `scope2_records` and redirects to records.
   - **Scope 1 (production):** optional module for stationary natural gas entries (month/year/country/region/quantity/unit/notes) stored in Supabase with disclosure.

2) **Records (records.html)**
   - Filters: Reporting Year, Country, Region, Method (location/market), defaulted by reporting preference and company defaults.
   - Transaction list: primary emissions, secondary month/region, method, View action.
   - Slide-out panel: view details; Edit/Delete callbacks; edit uses prompt flow to update kWh and recompute emissions.
   - Add + Bulk add: inline slide-out forms with validation; optional market-based fields per row; Supabase upsert.
   - Snapshot: total, average per month, top region, coverage, and real-world comparison; respects filters.
   - Reminders: missing months per region + region share >30%; respects filters and reporting preference.
   - Filtered export: CSV scoped to current filters.

3) **Scope 1 Records (scope1.html)**
   - Dedicated Scope 1 records page with filters (year/country/region), add + bulk add, view/edit/delete, and filtered export.
   - Supabase-backed storage with RLS; CSV export mirrors Scope 2 export format with Scope 1-specific columns.

4) **Insights (insights.html)**
   - Monthly trend line (location-based totals), regional contribution bars, coverage count.
   - Uses Supabase for fresh data and localStorage fallback for offline/cached view.

5) **Exports (exports.html)**
   - Auth required; company display and reporting year selector.
   - CSV export (Scope 2): all records (optionally year-filtered) with disclosure line and CRLF line endings.
   - Scope 1 CSV export: local-only natural gas entries.
   - PDF export placeholder (disabled).

6) **Settings (settings.html)**
   - Company profile: name, country/region, reporting year preference.
   - Updates `companies` table; drives defaults for records, insights, and exports.

## Data Model (Supabase)
- `companies`: `id`, `user_id`, `company_name`, `country`, `region`, `reporting_year_preference`, `created_at`.
- `scope2_records`: `id`, `user_id`, `company_id`, `period_year`, `period_month`, `kwh`, `location_based_emissions`, `market_based_emissions`, `market_instrument_type`, `covered_kwh`, `emission_factor_value`, `emission_factor_year`, `emission_factor_source`, `calc_country`, `calc_region`, `created_at`.
- `scope1_records`: `id`, `user_id`, `company_id`, `period_year`, `period_month`, `country`, `region`, `quantity`, `unit`, `notes`, `emissions`, `factor_value`, `factor_year`, `factor_source`, `factor_basis`, `factor_label`, `created_at`.
- RLS: CRUD where `user_id = auth.uid()`. Uniqueness scoped to user/company/period/country/region.

## Emission Factors
- Location-based Scope 2 factors live in `data/emission-factors.js` and are versioned and immutable (final datasets only).
- Factor selection: prefer exact billing year; otherwise use the most recent final year.
- Factors include `source`, `year`, and `version` to preserve audit traceability.
- Scope 1 natural gas factors (per unit) are stored in the same data file with defaults per country.

## UX Principles
- Clear hierarchy: headline → subhead → CTA → steps/trust.
- Task-first app pages with minimal chrome; finance-grade tone.
- Progressive disclosure: market-based and Scope 1 are optional and opt-in.
- Responsive, accessible defaults; avoid popups unless necessary.

## Error & Loading
- Auth/exports: show friendly status; disable buttons during work.
- Records: graceful empty states; cached data shown when available.
- Save: redirects to records; avoid intrusive alerts beyond required prompts.

## Security & Privacy
- Supabase anon key only; no `service_role` in client.
- RLS enforced on all queries; no client-only filtering for security.
- No uploads; minimal inputs; Scope 1 entries are local-only.

## Open Items / TODO
- PDF summary export (single doc with table + disclosure).
- Nav icons/badges and keyboard navigation polish.
- Additional reminder severity/dismissal controls.
- Methodology content polish as factors evolve.

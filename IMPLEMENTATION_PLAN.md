# CarbonWise (esgrise.com) – Granular Implementation Plan

## Phase 1: Baseline Setup (done)
- [x] Static pages at the repo root: `index.html`, `records.html`, `scope1.html`, `insights.html`, `exports.html`, `settings.html`, `methodology.html`.
- [x] Supabase client setup (anon key) + auth flows (email/password, OTP/passcode, password reset/update).
- [x] RLS enforced tables: `companies`, `scope2_records`.
- [x] Calculator, results rendering, and save flow with redirect to records.

## Phase 2: Records UX & Data (done)
- [x] Transaction-style records list with filters (Year, Country, Region, Method).
- [x] Slide-out detail panel with View/Edit/Delete wired to Supabase + local cache.
- [x] Add + Bulk add entry within records; market-based optional per row.
- [x] Carbon Snapshot (totals/avg/top region/coverage/comparison) respecting filters.
- [x] Insights & Reminders (missing-month ranges per region, >30% region share) respecting filters and reporting preference.
- [x] Filtered export action on records (scoped to current filters).
- [x] Side nav on app pages; landing stays nav-free.

## Phase 3: Export / Reports (done, PDF pending)
1) Auth guard
   - [x] Redirect unauthenticated users from `exports.html` to `index.html`.
2) Company + year controls
   - [x] Show company name and region (first company).
   - [x] Populate year dropdown from records; default respects reporting year preference.
3) CSV export (required)
   - [x] Fetch records via Supabase (RLS), optional year filter.
   - [x] CSV headers: company_name, period (YYYY-MM), country/region, kwh, scope2_location_based_tco2e, scope2_market_based_tco2e, emission_factor_value/year/source.
   - [x] Include disclosure line: “Location-based Scope 2 electricity calculation aligned with the GHG Protocol.”
   - [x] UTF-8, CRLF line endings, downloadable file.
   - [x] Loading/error states; disable buttons during export.
- [x] Scope 1 CSV export from Supabase-backed entries on `exports.html`.
4) PDF export (optional, future)
   - [ ] Implement single summary PDF (company, year, table, disclosure) using a lightweight client lib or HTML-to-canvas if acceptable in static context.
5) Nav/UX
   - [x] Export / Reports link active in side nav; Insights/Settings enabled.

## Phase 4: Data & Factors (done)
- [x] Versioned, append-only Scope 2 emission factors in `data/emission-factors.js`.
- [x] Store factor value/year/source per record for audit traceability.
- [x] Scope 1 natural gas factors and defaults (Supabase-backed module).

## Phase 5: Scope 1 Records + Dashboard/Insights (done)
- [x] Scope 1 records page (`scope1.html`): filters, add/bulk add, view/edit/delete, and scoped export.
- [x] Insights page (`insights.html`): trend line, regional ranking bars, coverage count.
- [ ] Optional dashboard page (not in scope yet).

## Phase 6: Settings (done)
- [x] Company defaults (country/region) and profile display.
- [x] Reporting year preference (All/current/previous).

## Phase 7: Polish & Compliance (in progress)
- [x] Mobile nav collapse for side nav on app pages.
- [ ] Icons/badges in nav; keyboard navigation improvements.
- [ ] Additional reminders (severity/dismiss).
- [ ] PDF export delivery; optional ZIP bundle for CSV+PDF.
- [ ] Methodology page content polish (sources, limitations, disclosures).
- [ ] Scope 1 early access polish (copy, factors, and disclosures) as data sources evolve.

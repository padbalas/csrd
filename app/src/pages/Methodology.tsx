const Methodology = () => {
  return (
    <div className="stack">
      <section className="page-card stack">
        <h1 className="page-title">Methodology &amp; Disclosures</h1>
        <p className="muted">
          How CarbonWise calculates Scope 2 electricity emissions (tCO2e), Scope 1 stationary combustion estimates,
          and Scope 3 vendor-reported actuals plus spend-based screening estimates.
        </p>
      </section>

      <section className="page-card stack">
        <h2 className="section-title">Scope Covered</h2>
        <p className="muted">
          CarbonWise supports Scope 2 emissions from purchased electricity, Scope 1 emissions from stationary natural
          gas combustion, and Scope 3 records via vendor-reported actuals or spend-based EIO screening. Each scope has
          its own inputs, factors, and disclosures.
        </p>
      </section>

      <section className="page-card stack" id="scope-2">
        <h2 className="section-title">Scope 2 Methodology (Electricity)</h2>
        <p><strong>Inputs</strong></p>
        <p className="muted">Monthly electricity usage (kWh), billing month/year, and country/region.</p>
        <p><strong>Calculation</strong></p>
        <p className="muted">
          Location-based Scope 2 emissions are calculated by multiplying kWh by the grid emission factor for the
          selected location.
        </p>
        <p><strong>Emission factors</strong></p>
        <p className="muted">
          Factors represent average grid emissions intensity by country/region. They are sourced from public,
          government-issued datasets and are year-stamped.
        </p>
        <p><strong>Factor year alignment</strong></p>
        <p className="muted">
          Grid factors are published after the year they describe. CarbonWise may use the most recent final factor if
          an exact year match is unavailable.
        </p>
        <p><strong>Location-based vs market-based</strong></p>
        <p className="muted">
          Location-based is the default. Market-based adjustments are optional and user-declared (RECs/PPAs).
          Uncovered electricity remains location-based.
        </p>
        <p className="muted">
          CarbonWise does not verify certificates, contracts, or registry claims. Market-based results are estimates
          intended for internal reporting.
        </p>
      </section>

      <section className="page-card stack" id="scope-1">
        <h2 className="section-title">Scope 1 Methodology (Stationary combustion — Natural gas)</h2>
        <p><strong>What is included</strong></p>
        <p className="muted">
          Stationary combustion only, natural gas, owned/controlled facilities, and heating/boilers/furnaces/generators
          with regular metered usage.
        </p>
        <p><strong>What is excluded</strong></p>
        <p className="muted">
          Mobile combustion, fugitive emissions, process emissions, backup generators with irregular usage (unless
          metered), personal fuel use, and shared buildings without clear allocation.
        </p>
        <p><strong>Inputs</strong></p>
        <p className="muted">Monthly fuel quantity, unit, billing month/year, and facility location.</p>
        <p><strong>Calculation</strong></p>
        <p className="muted">
          Scope 1 emissions are calculated by multiplying the reported fuel quantity by the applicable stationary
          combustion factor for the location and unit.
        </p>
        <p><strong>Emission factors</strong></p>
        <p className="muted">Factors are sourced from public, government-issued datasets and are year-stamped.</p>
        <p><strong>Estimation limitations</strong></p>
        <p className="muted">
          Results are partial and may omit other Scope 1 sources. Factors are simplified and are not a full inventory
          or verification.
        </p>
      </section>

      <section className="page-card stack" id="scope-3">
        <h2 className="section-title">Scope 3 Methodology (Actuals + Spend-based)</h2>

        <h3>Scope 3 Actuals (Vendor-reported)</h3>
        <p><strong>What this represents</strong></p>
        <p className="muted">
          Vendor-reported emissions for your usage (e.g., cloud provider carbon reports). These values come directly
          from suppliers and are not recalculated by CarbonWise.
        </p>
        <p><strong>Inputs</strong></p>
        <p className="muted">
          Reporting period (month/year), category, vendor name (optional), and the vendor-reported emissions (tCO2e).
          Optional source reference can be stored for traceability.
        </p>
        <p><strong>Calculation</strong></p>
        <p className="muted">
          CarbonWise stores the provided emissions value and includes it in totals and exports without applying EIO
          factors.
        </p>
        <p><strong>Limitations</strong></p>
        <p className="muted">
          Accuracy depends on supplier methodology and boundary alignment. CarbonWise does not verify supplier claims.
        </p>

        <h3>Scope 3 Spend-based Screening (EIO)</h3>
        <p><strong>What spend-based EIO modeling is</strong></p>
        <p className="muted">
          Spend-based screening uses environmentally extended input-output (EIO) models to estimate emissions from
          spend. Spend in each category is multiplied by a national-average EIO factor expressed as tCO2e per currency
          unit.
        </p>
        <p><strong>Supported categories (v1)</strong></p>
        <p className="muted">
          Purchased Goods &amp; Services (General), Professional Services, Software &amp; Cloud Services, Marketing &amp;
          Advertising Services, and Logistics &amp; Shipping (Upstream, spend-based only).
        </p>
        <p className="muted">
          CarbonWise intentionally limits Scope 3 v1 to a small set of high-confidence categories to prioritize
          clarity and defensibility over broad but uncertain coverage.
        </p>
        <p><strong>Limitations and uncertainty</strong></p>
        <p className="muted">
          These results are screening-level only, based on average sector data. They do not use supplier-specific data,
          activity quantities, or process-based LCA. Uncertainty is high and results should not be treated as
          audit-grade.
        </p>
        <p><strong>Appropriate use cases</strong></p>
        <p className="muted">Early screening, directional insights, and prioritization for deeper analysis.</p>
        <p><strong>Inappropriate use cases</strong></p>
        <p className="muted">
          Audits, supplier claims, product-level LCAs, or public-facing assertions of supplier performance.
        </p>
        <p className="muted">
          Spend-based Scope 3 emissions shown here are screening-level estimates calculated using EIO models. Results
          are indicative only and subject to high uncertainty.
        </p>
      </section>

      <section className="page-card stack">
        <h2 className="section-title">Precision, Rounding, and Comparability</h2>
        <p className="muted">
          Calculations retain reasonable numeric precision. Results may differ from other tools because of emission
          factor selection, year alignment, or rounding conventions.
        </p>
      </section>

      <section className="page-card stack">
        <h2 className="section-title">Intended Use &amp; Limitations</h2>
        <p className="muted">
          CarbonWise supports internal reporting, planning, and disclosure preparation. It does not replace
          third-party verification or formal assurance, and users remain responsible for final reporting decisions.
        </p>
      </section>

      <section className="page-card stack">
        <h2 className="section-title">Updates &amp; Changes</h2>
        <p className="muted">
          Emission factors and methodology may be updated as new data becomes available. Significant changes will be
          documented so you can understand what changed and why.
        </p>
        <div className="note">
          <a href="mailto:hello@esgrise.com">Contact / support</a> · Emission factors updated as of 2024.
        </div>
      </section>
    </div>
  );
};

export default Methodology;

import { useEffect, useMemo, useState } from 'react';
import {
  EMISSION_FACTORS,
  GLOBAL_FALLBACK,
  SCOPE1_NATURAL_GAS_DEFAULT,
  SCOPE1_NATURAL_GAS_FACTORS,
} from '../data/emission-factors';
import { ensureCompanySites } from '../lib/sites';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthProvider';

const REGION_OPTIONS: Record<string, string[]> = {
  US: [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','District of Columbia',
    'Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine',
    'Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
    'New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma',
    'Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
    'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
  ],
  CA: [
    'Alberta','British Columbia','Manitoba','New Brunswick','Newfoundland and Labrador','Northwest Territories',
    'Nova Scotia','Nunavut','Ontario','Prince Edward Island','Quebec','Saskatchewan','Yukon',
  ],
  UK: ['England','Northern Ireland','Scotland','Wales'],
  AU: [
    'New South Wales','Victoria','Queensland','Western Australia','South Australia',
    'Tasmania','Australian Capital Territory','Northern Territory',
  ],
  SG: ['Singapore'],
  NZ: [
    "Auckland","Bay of Plenty","Canterbury","Gisborne","Hawke's Bay","Manawatu-Whanganui","Marlborough",
    'Nelson','Northland','Otago','Southland','Taranaki','Tasman','Waikato','Wellington','West Coast',
  ],
};

const COUNTRY_OPTIONS = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'AU', label: 'Australia' },
  { value: 'SG', label: 'Singapore' },
  { value: 'NZ', label: 'New Zealand' },
];

const MONTHS = [
  'January','February','March','April','May','June','July','August','September','October','November','December',
];

const CAR_MILES_PER_TON = 1 / 0.000404;
const AVG_HOME_KWH_MONTH = 877;
const SCOPE1_DISCLOSURE =
  'Scope 1 emissions are estimates based on user-provided fuel data. Results may be partial and do not represent full Scope 1 coverage.';

const SCOPE1_UNIT_LABELS: Record<string, string> = {
  therms: 'Therms (US)',
  m3: 'Cubic meters (m3)',
  'kwh-eq': 'kWh-equivalent',
};

const formatNumber = (value: number, digits = 2) =>
  Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });

const normalizeKey = (value: string) => value.trim().toUpperCase();

const selectFinalFactor = (records: typeof GLOBAL_FALLBACK, billingYear: number) => {
  const finals = records.filter((record) => record.status === 'final');
  const match = finals.find((record) => record.year === billingYear);
  if (match) return match;
  return finals.reduce((latest, record) => (record.year > latest.year ? record : latest), finals[0]);
};

const getEmissionFactor = (country: string, region: string, billingYear: number) => {
  const countryData = EMISSION_FACTORS[country];
  const regionKey = normalizeKey(region);
  const regionRecords = countryData?.regions?.[regionKey];
  const records = regionRecords && regionRecords.length ? regionRecords : countryData?.default || GLOBAL_FALLBACK;
  const selected = selectFinalFactor(records, billingYear);
  return {
    factor: selected.factor,
    year: selected.year,
    source: selected.source,
    version: selected.version,
    regionLabel: regionRecords ? `${region}, ${country}` : `${country}`,
  };
};

const getScope1Factor = (country: string, region: string, unit: string) => {
  const countryData = SCOPE1_NATURAL_GAS_FACTORS[country] as any;
  const regionKey = normalizeKey(region);
  const regional = countryData?.regions?.[regionKey]?.[unit] || null;
  if (regional) {
    return { ...regional, label: 'Region-specific' };
  }
  const defaultData = countryData?.default?.[unit] || null;
  if (defaultData) {
    return { ...defaultData, label: 'Default' };
  }
  const fallback = SCOPE1_NATURAL_GAS_DEFAULT?.[unit] || null;
  if (fallback) {
    return { ...fallback, label: 'Default' };
  }
  return null;
};

const Calculator = () => {
  const { openAuth } = useAuth();
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const [activeTab, setActiveTab] = useState<'scope2' | 'scope1'>('scope2');
  const [persona, setPersona] = useState('');
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState(String(currentYear));
  const [kwh, setKwh] = useState('');
  const [marketEnabled, setMarketEnabled] = useState(false);
  const [marketType, setMarketType] = useState('');
  const [marketKwh, setMarketKwh] = useState('');
  const [marketYear, setMarketYear] = useState(String(currentYear));
  const [error, setError] = useState('');

  const [scope1Month, setScope1Month] = useState('');
  const [scope1Year, setScope1Year] = useState('');
  const [scope1Country, setScope1Country] = useState('');
  const [scope1Region, setScope1Region] = useState('');
  const [scope1Quantity, setScope1Quantity] = useState('');
  const [scope1Unit, setScope1Unit] = useState('');
  const [scope1Notes, setScope1Notes] = useState('');
  const [scope1Status, setScope1Status] = useState('');
  const [scope1SaveStatus, setScope1SaveStatus] = useState('');
  const [scope2SaveStatus, setScope2SaveStatus] = useState('');
  const [scope1Saving, setScope1Saving] = useState(false);
  const [scope2Saving, setScope2Saving] = useState(false);

  const [scope1Result, setScope1Result] = useState<null | {
    emissions: number;
    factorValue: number;
    factorYear: number;
    factorSource: string;
    factorBasis: string;
    factorLabel: string;
  }>(null);

  const [scope1Pending, setScope1Pending] = useState<null | {
    period_year: number;
    period_month: number;
    country: string;
    region: string;
    quantity: number;
    unit: string;
    notes: string;
    emissions: number;
    factor_value: number;
    factor_year: number;
    factor_source: string;
    factor_basis: string;
    factor_label: string;
  }>(null);

  const [result, setResult] = useState<null | {
    tonsLocation: number;
    tonsMarket: number;
    factorSentence: string;
    interpretation: string;
    compare: string;
    next: string;
    mismatch: boolean;
    marketDetails: string;
  }>(null);

  const [scope2Pending, setScope2Pending] = useState<null | {
    period_year: number;
    period_month: number;
    month_name: string;
    kwh: number;
    country: string;
    region: string;
    market_enabled: boolean;
    market_type: string | null;
    covered_kwh: number;
    location_emissions: number;
    market_emissions: number;
    factor_value: number;
    factor_year: number;
    factor_source: string;
  }>(null);

  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'scope1') setActiveTab('scope1');
      if (hash === 'scope2') setActiveTab('scope2');
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear; y >= 2024; y -= 1) years.push(y);
    return years;
  }, [currentYear]);

  const regionOptions = useMemo(() => REGION_OPTIONS[country] || [], [country]);
  const scope1RegionOptions = useMemo(() => REGION_OPTIONS[scope1Country] || [], [scope1Country]);

  const handleCalculate = () => {
    setError('');
    setResult(null);
    setScope2SaveStatus('');
    setScope2Pending(null);
    const monthNumber = MONTHS.indexOf(month) + 1;
    const yearValue = parseInt(year, 10);
    const kwhValue = parseFloat(kwh || '0');
    const marketKwhValue = parseFloat(marketKwh || '0');
    const marketYearValue = parseInt(marketYear || String(currentYear), 10);

    if (yearValue > currentYear) {
      setError('Carbon emissions can only be calculated for past or current periods.');
      return;
    }
    if (yearValue === currentYear && monthNumber > currentMonth) {
      setError('Future months are not supported. Please select a completed or current billing period.');
      return;
    }
    if (!persona || !country || !month || !yearValue || !kwhValue || kwhValue <= 0 || !region) {
      setError('Please complete all fields to calculate.');
      return;
    }

    if (marketEnabled) {
      if (!marketType || Number.isNaN(marketKwhValue) || marketKwhValue < 0 || !marketYearValue) {
        setError('Please provide market-based instrument type, covered kWh, and reporting year.');
        return;
      }
      if (marketYearValue > currentYear) {
        setError('Carbon emissions can only be calculated for past or current periods.');
        return;
      }
      if (marketKwhValue > kwhValue) {
        setError('Covered electricity (kWh) cannot exceed total electricity used.');
        return;
      }
    }

    const factorData = getEmissionFactor(country, region, yearValue);
    const factor = factorData.factor;
    const tonsLocation = kwhValue * factor;
    const coveredKwh = marketEnabled ? Math.min(marketKwhValue, kwhValue) : 0;
    const uncoveredKwh = Math.max(kwhValue - coveredKwh, 0);
    const tonsMarket = marketEnabled ? uncoveredKwh * factor : tonsLocation;

    const homes = kwhValue / AVG_HOME_KWH_MONTH;
    const compare = `${formatNumber(tonsLocation * CAR_MILES_PER_TON, 0)} car miles or ${formatNumber(homes, 1)} homes for a month`;

    const next = persona === 'finance'
      ? 'Save this number for your monthly close and share with leadership.'
      : persona === 'advisor'
        ? 'Use this as a directional input in your client’s ESG summary.'
        : 'Track this month-over-month to spot reductions and set targets.';

    const factorSentence = `This estimate uses ${factorData.year} ${factorData.source} location-based electricity emission factors for ${factorData.regionLabel} (${formatNumber(factor, 6)} tCO2e/kWh, version ${factorData.version}).`;
    const isPartialCurrent = yearValue === currentYear && monthNumber === currentMonth;
    const partialNote = isPartialCurrent
      ? ' Partial period estimate: This calculation is based on usage entered for the current month and may change once the billing period is complete.'
      : '';
    const interpretation = `For ${month} ${yearValue} in ${region}, your electricity use generates about ${formatNumber(tonsLocation, 3)} tCO2e (location-based).${partialNote}`;
    const mismatch = yearValue > factorData.year || (marketEnabled && marketYearValue > factorData.year);
    const marketDetails = marketEnabled
      ? `Instrument: ${marketType} • Covered kWh: ${formatNumber(coveredKwh, 0)} • Reporting year: ${marketYearValue}. Market-based emissions depend on contractual instruments and are reported separately from location-based emissions.`
      : '';

    setResult({
      tonsLocation,
      tonsMarket,
      factorSentence,
      interpretation,
      compare,
      next,
      mismatch,
      marketDetails,
    });
    setScope2Pending({
      period_year: yearValue,
      period_month: monthNumber,
      month_name: month,
      kwh: kwhValue,
      country,
      region,
      market_enabled: marketEnabled,
      market_type: marketEnabled ? marketType : null,
      covered_kwh: coveredKwh,
      location_emissions: tonsLocation,
      market_emissions: tonsMarket,
      factor_value: factor,
      factor_year: factorData.year,
      factor_source: factorData.source,
    });
  };

  const handleScope1Calculate = () => {
    setScope1Status('');
    setScope1Result(null);
    setScope1SaveStatus('');
    setScope1Pending(null);
    const monthValue = parseInt(scope1Month || '', 10);
    const yearValue = parseInt(scope1Year || '', 10);
    const quantityValue = Number(scope1Quantity || '');
    const unitValue = scope1Unit;

    const errors: string[] = [];
    if (!monthValue) errors.push('Select a billing month.');
    if (!yearValue) errors.push('Select a billing year.');
    if (!scope1Country) errors.push('Select a facility country.');
    if (!scope1Region) errors.push('Select a facility region.');
    if (!unitValue) errors.push('Select a unit.');
    if (!Number.isFinite(quantityValue) || quantityValue < 0) errors.push('Enter a non-negative quantity.');
    if (yearValue && monthValue) {
      const isFuture = yearValue > currentYear || (yearValue === currentYear && monthValue > currentMonth);
      if (isFuture) errors.push('Scope 1 entries must be for past or current months.');
    }
    if (unitValue && !SCOPE1_UNIT_LABELS[unitValue]) {
      errors.push('Select a valid unit option.');
    }
    if (errors.length) {
      setScope1Status(errors.join(' '));
      return;
    }

    const factorData = getScope1Factor(scope1Country, scope1Region, unitValue);
    if (!factorData) {
      setScope1Status('No emission factor is available for this selection. Please adjust the location or unit.');
      return;
    }

    const emissions = quantityValue * factorData.factor;
    setScope1Result({
      emissions,
      factorValue: factorData.factor,
      factorYear: factorData.year,
      factorSource: factorData.source,
      factorBasis: factorData.basis,
      factorLabel: factorData.label,
    });
    setScope1Pending({
      period_year: yearValue,
      period_month: monthValue,
      country: scope1Country,
      region: scope1Region,
      quantity: quantityValue,
      unit: unitValue,
      notes: scope1Notes.trim(),
      emissions,
      factor_value: factorData.factor,
      factor_year: factorData.year,
      factor_source: factorData.source,
      factor_basis: factorData.basis,
      factor_label: factorData.label,
    });
    setScope1Status('Scope 1 estimate ready.');
  };

  const handleScope2Save = async () => {
    if (!scope2Pending) {
      setScope2SaveStatus('Calculate before saving.');
      return;
    }
    setScope2SaveStatus('');
    setScope2Saving(true);
    const { data } = await supabase.auth.getSession();
    if (!data?.session) {
      openAuth({
        view: 'signin',
        title: 'Log in to save results',
        description: 'Log in to save results and track your history. Calculations work without an account.',
        onComplete: handleScope2Save,
      });
      setScope2Saving(false);
      return;
    }
    const session = data.session;
    const siteData = await ensureCompanySites(session.user.id);
    if (!siteData.companyId) {
      openAuth({
        view: 'company',
        title: 'Add your company',
        description: 'Provide company details to save results. No bill uploads required.',
        onComplete: handleScope2Save,
      });
      setScope2Saving(false);
      return;
    }
    if (!siteData.sites.length) {
      setScope2SaveStatus('Add at least one site in Settings before saving.');
      setScope2Saving(false);
      return;
    }
    const matchedSite = siteData.sites.find(
      (site) => site.country === scope2Pending.country && site.region === scope2Pending.region
    );
    if (!matchedSite) {
      setScope2SaveStatus('Select a configured site from Settings before saving.');
      setScope2Saving(false);
      return;
    }
    const { data: existing, error: existingError } = await supabase
      .from('scope2_records')
      .select('id')
      .eq('company_id', siteData.companyId)
      .eq('period_year', scope2Pending.period_year)
      .eq('period_month', scope2Pending.period_month)
      .eq('calc_country', scope2Pending.country)
      .eq('calc_region', scope2Pending.region)
      .limit(1);
    if (existingError) {
      setScope2SaveStatus('Could not check existing records.');
      setScope2Saving(false);
      return;
    }
    if (existing && existing.length) {
      const confirmReplace = window.confirm('A record for this period already exists. Replace it?');
      if (!confirmReplace) {
        setScope2Saving(false);
        return;
      }
    }
    const payload = {
      user_id: session.user.id,
      company_id: siteData.companyId,
      site_id: matchedSite.id,
      period_year: scope2Pending.period_year,
      period_month: scope2Pending.period_month,
      kwh: scope2Pending.kwh,
      location_based_emissions: scope2Pending.location_emissions,
      market_based_emissions: scope2Pending.market_enabled ? scope2Pending.market_emissions : null,
      market_instrument_type: scope2Pending.market_enabled ? scope2Pending.market_type : null,
      covered_kwh: scope2Pending.market_enabled ? scope2Pending.covered_kwh : null,
      emission_factor_value: scope2Pending.factor_value,
      emission_factor_year: scope2Pending.factor_year,
      emission_factor_source: scope2Pending.factor_source,
      calc_country: scope2Pending.country,
      calc_region: scope2Pending.region,
    };
    const { error } = await supabase
      .from('scope2_records')
      .upsert([payload], { onConflict: 'user_id,company_id,period_year,period_month,calc_country,calc_region' });
    if (error) {
      setScope2SaveStatus('Save failed. Please try again.');
      setScope2Saving(false);
      return;
    }
    setScope2SaveStatus('Saved.');
    setScope2Saving(false);
    window.location.href = '/records';
  };

  const handleScope1Save = async () => {
    if (!scope1Pending) {
      setScope1SaveStatus('Calculate before saving.');
      return;
    }
    setScope1SaveStatus('');
    setScope1Saving(true);
    const { data } = await supabase.auth.getSession();
    if (!data?.session) {
      openAuth({
        view: 'signin',
        title: 'Log in to save Scope 1 records',
        description: 'Log in to save Scope 1 results to your account.',
        onComplete: handleScope1Save,
      });
      setScope1Saving(false);
      return;
    }
    const session = data.session;
    const siteData = await ensureCompanySites(session.user.id);
    if (!siteData.companyId) {
      openAuth({
        view: 'company',
        title: 'Add your company',
        description: 'Provide company details to save results. No bill uploads required.',
        onComplete: handleScope1Save,
      });
      setScope1Saving(false);
      return;
    }
    if (!siteData.sites.length) {
      setScope1SaveStatus('Add at least one site in Settings before saving.');
      setScope1Saving(false);
      return;
    }
    const matchedSite = siteData.sites.find(
      (site) => site.country === scope1Pending.country && site.region === scope1Pending.region
    );
    if (!matchedSite) {
      setScope1SaveStatus('Select a configured site from Settings.');
      setScope1Saving(false);
      return;
    }
    const payload = {
      user_id: session.user.id,
      company_id: siteData.companyId,
      site_id: matchedSite.id,
      period_year: scope1Pending.period_year,
      period_month: scope1Pending.period_month,
      country: scope1Pending.country,
      region: scope1Pending.region,
      quantity: scope1Pending.quantity,
      unit: scope1Pending.unit,
      notes: scope1Pending.notes || null,
      emissions: scope1Pending.emissions,
      factor_value: scope1Pending.factor_value,
      factor_year: scope1Pending.factor_year,
      factor_source: scope1Pending.factor_source,
      factor_basis: scope1Pending.factor_basis,
      factor_label: scope1Pending.factor_label,
    };
    const { error } = await supabase
      .from('scope1_records')
      .upsert([payload], { onConflict: 'user_id,company_id,period_year,period_month,country,region' });
    if (error) {
      setScope1SaveStatus('Save failed. Please try again.');
      setScope1Saving(false);
      return;
    }
    setScope1SaveStatus('Scope 1 record saved.');
    setScope1Saving(false);
    window.location.href = '/scope/scope1';
  };

  return (
    <div>
      <section className="page-card">
        <h1 className="page-title">Monthly emissions calculator</h1>
        <p className="muted">Calculate Scope 2 electricity or Scope 1 natural gas estimates.</p>
      </section>

      <section className="page-card">
        <div className="tab-header">
          <button
            type="button"
            className={`tab-button ${activeTab === 'scope2' ? 'active' : ''}`}
            onClick={() => setActiveTab('scope2')}
          >
            Scope 2 electricity
          </button>
          <button
            type="button"
            className={`tab-button ${activeTab === 'scope1' ? 'active' : ''}`}
            onClick={() => setActiveTab('scope1')}
          >
            Scope 1 natural gas
          </button>
        </div>
      </section>

      {activeTab === 'scope2' ? (
        <section className="page-card stack">
          <div className="two-col">
            <div>
              <label htmlFor="persona">Who are you?</label>
              <select id="persona" value={persona} onChange={(event) => setPersona(event.target.value)}>
                <option value="">Select one</option>
                <option value="founder">Founder / operator</option>
                <option value="finance">Finance / accounting</option>
                <option value="advisor">Fractional CFO / advisor</option>
                <option value="other">Other</option>
              </select>
              <div className="hint">We tailor the explanation tone. No personal data stored.</div>
            </div>
            <div>
              <label htmlFor="country">Country / region</label>
              <select
                id="country"
                value={country}
                onChange={(event) => {
                  setCountry(event.target.value);
                  setRegion('');
                }}
              >
                <option value="">Select country</option>
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="hint">We match public grid factors; you can adjust later.</div>
            </div>
          </div>

          <div className="two-col">
            <div>
              <label htmlFor="month">Billing month</label>
              <select id="month" value={month} onChange={(event) => setMonth(event.target.value)}>
                <option value="">Select month</option>
                {MONTHS.map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
              <div className="hint">Enter the month electricity was consumed, not when the bill was paid.</div>
            </div>
            <div>
              <label htmlFor="year">Billing year</label>
              <select id="year" value={year} onChange={(event) => setYear(event.target.value)}>
                {yearOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <div className="hint">We show only years up to the current year; future periods are blocked.</div>
            </div>
          </div>

          <div className="two-col">
            <div>
              <label htmlFor="kwh">Electricity used (kWh)</label>
              <input
                id="kwh"
                type="number"
                min="1"
                step="any"
                value={kwh}
                onChange={(event) => setKwh(event.target.value)}
                placeholder="e.g., 1200"
              />
              <div className="hint">Found on your statement as total kWh for the month.</div>
            </div>
            <div>
              <label htmlFor="region">State / region</label>
              <select id="region" value={region} onChange={(event) => setRegion(event.target.value)}>
                <option value="">Select state / province</option>
                {regionOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <div className="hint">Choose your state or province for precise factors.</div>
            </div>
          </div>

          <div className="notice">
            No portals, no jargon - just a clear estimate. Calculate without an account; sign in only to save or export.
          </div>

          <button type="button" className="btn primary" onClick={handleCalculate}>
            See my Scope 2 electricity emissions
          </button>

          <div className="notice">
            <label className="toggle-line">
              <input
                type="checkbox"
                checked={marketEnabled}
                onChange={(event) => setMarketEnabled(event.target.checked)}
              />
              Include market-based Scope 2 (using RECs/PPAs where provided)
            </label>
            <div className="hint">Market-based Scope 2 reflects purchased renewable energy instruments such as RECs or PPAs.</div>
            {marketEnabled ? (
              <div className="stack" style={{ marginTop: '10px' }}>
                <div className="two-col">
                  <div>
                    <label htmlFor="market-type">Instrument type (market-based Scope 2)</label>
                    <select id="market-type" value={marketType} onChange={(event) => setMarketType(event.target.value)}>
                      <option value="">Select instrument</option>
                      <option value="REC">REC</option>
                      <option value="PPA">PPA</option>
                      <option value="Green tariff">Green tariff</option>
                    </select>
                    <div className="hint">We do not verify certificates or contracts; this is user-declared.</div>
                  </div>
                  <div>
                    <label htmlFor="market-kwh">Covered electricity (kWh)</label>
                    <input
                      id="market-kwh"
                      type="number"
                      min="0"
                      step="any"
                      value={marketKwh}
                      onChange={(event) => setMarketKwh(event.target.value)}
                      placeholder="e.g., 500"
                    />
                    <div className="hint">Portion of your kWh covered by RECs/PPAs.</div>
                  </div>
                </div>
                <div className="two-col">
                  <div>
                    <label htmlFor="market-year">Reporting year (market-based Scope 2)</label>
                    <select id="market-year" value={marketYear} onChange={(event) => setMarketYear(event.target.value)}>
                      {yearOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {error ? <div className="status">{error}</div> : null}
        </section>
      ) : null}

      {activeTab === 'scope2' ? (
        <section className="page-card">
          <h2 className="section-title">Your Scope 2 electricity estimate</h2>
          {result ? (
            <div className="result">
              <div className="grid-3">
                <div className="stat-box">
                  <strong>{formatNumber(result.tonsLocation, 3)} tCO2e</strong>
                  <span className="muted">Location-based Scope 2 electricity</span>
                </div>
                <div className="stat-box">
                  <strong>{result.compare}</strong>
                  <span className="muted">Real-world comparison</span>
                </div>
                <div className="stat-box">
                  <strong>{result.next}</strong>
                  <span className="muted">What to do next</span>
                </div>
                <div className="stat-box">
                  <strong>{marketEnabled ? `${formatNumber(result.tonsMarket, 3)} tCO2e` : 'Not provided'}</strong>
                  <span className="muted">Market-based Scope 2 electricity</span>
                </div>
              </div>
              <div className="notice">{result.factorSentence}</div>
              {result.mismatch ? (
                <p className="muted">Emission factors are published with a delay. This calculation uses the most recent available data.</p>
              ) : null}
              <p className="muted">{result.interpretation}</p>
              {marketEnabled ? (
                <div className="notice">
                  <strong>Market-based note:</strong> {result.marketDetails}
                </div>
              ) : null}
              <div className="actions">
                <button type="button" className="btn primary" onClick={handleScope2Save} disabled={scope2Saving}>
                  {scope2Saving ? 'Saving...' : 'Save record'}
                </button>
                <div className="status">{scope2SaveStatus}</div>
              </div>
            </div>
          ) : (
            <p className="muted">Your results will appear here after you calculate.</p>
          )}
        </section>
      ) : null}

      {activeTab === 'scope1' ? (
        <section className="page-card stack">
          <div className="two-col">
            <div>
              <h3 className="section-title" style={{ marginTop: 0 }}>Included</h3>
              <ul className="list">
                <li>stationary combustion only</li>
                <li>natural gas</li>
                <li>owned or controlled facilities</li>
                <li>regular metered usage</li>
              </ul>
            </div>
            <div>
              <h3 className="section-title" style={{ marginTop: 0 }}>Excluded</h3>
              <ul className="list">
                <li>mobile combustion</li>
                <li>fugitive emissions</li>
                <li>process emissions</li>
                <li>backup generators without metering</li>
              </ul>
            </div>
          </div>
          <div className="two-col">
            <div>
              <label htmlFor="scope1-month">Billing month</label>
              <select id="scope1-month" value={scope1Month} onChange={(event) => setScope1Month(event.target.value)}>
                <option value="">Select month</option>
                {MONTHS.map((label, index) => (
                  <option
                    key={label}
                    value={String(index + 1)}
                    disabled={scope1Year === String(currentYear) && index + 1 > currentMonth}
                  >
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="scope1-year">Billing year</label>
              <select id="scope1-year" value={scope1Year} onChange={(event) => setScope1Year(event.target.value)}>
                <option value="">Select year</option>
                {yearOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="two-col">
            <div>
              <label htmlFor="scope1-country">Country</label>
              <select
                id="scope1-country"
                value={scope1Country}
                onChange={(event) => {
                  setScope1Country(event.target.value);
                  setScope1Region('');
                }}
              >
                <option value="">Select country</option>
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="scope1-region">Region</label>
              <select id="scope1-region" value={scope1Region} onChange={(event) => setScope1Region(event.target.value)}>
                <option value="">Select region</option>
                {scope1RegionOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="two-col">
            <div>
              <label htmlFor="scope1-quantity">Fuel quantity</label>
              <input
                id="scope1-quantity"
                type="number"
                min="0"
                step="any"
                value={scope1Quantity}
                onChange={(event) => setScope1Quantity(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="scope1-unit">Unit</label>
              <select id="scope1-unit" value={scope1Unit} onChange={(event) => setScope1Unit(event.target.value)}>
                <option value="">Select unit</option>
                {Object.entries(SCOPE1_UNIT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="scope1-notes">Notes (optional)</label>
            <input
              id="scope1-notes"
              type="text"
              value={scope1Notes}
              onChange={(event) => setScope1Notes(event.target.value.slice(0, 240))}
            />
          </div>
          <button type="button" className="btn primary" onClick={handleScope1Calculate}>
            Calculate Scope 1 emissions
          </button>
          {scope1Status ? <div className="status">{scope1Status}</div> : null}
        </section>
      ) : null}

      {activeTab === 'scope1' ? (
        <section className="page-card">
          <h2 className="section-title">Your Scope 1 estimate</h2>
          {scope1Result ? (
            <div className="result">
              <div className="stat-box">
                <strong>{formatNumber(scope1Result.emissions, 3)} tCO2e</strong>
                <span className="muted">Estimated Scope 1 emissions</span>
              </div>
              <div className="notice">
                Factor: {formatNumber(scope1Result.factorValue, 6)} {scope1Result.factorBasis} • {scope1Result.factorYear} • {scope1Result.factorSource} • {scope1Result.factorLabel}
              </div>
              <p className="note">{SCOPE1_DISCLOSURE}</p>
              <div className="actions">
                <button type="button" className="btn primary" onClick={handleScope1Save} disabled={scope1Saving}>
                  {scope1Saving ? 'Saving...' : 'Save record'}
                </button>
                <div className="status">{scope1SaveStatus}</div>
              </div>
            </div>
          ) : (
            <p className="muted">Your results will appear here after you calculate.</p>
          )}
        </section>
      ) : null}
    </div>
  );
};

export default Calculator;

import { useEffect, useMemo, useState } from 'react';
import { fetchCompany, fetchEntitlements, requireSession, supabase } from '../lib/supabase';
import { useCarbonStore } from '../stores/useCarbonStore';

type Scope2Row = {
  period_year: number | null;
  period_month: number | null;
  kwh: number | null;
  location_based_emissions: number | null;
  market_based_emissions: number | null;
  emission_factor_value: number | null;
  emission_factor_year: number | null;
  emission_factor_source: string | null;
  calc_country: string | null;
  calc_region: string | null;
  companies?: { company_name?: string | null } | null;
};

type Scope1Row = {
  period_year: number | null;
  period_month: number | null;
  quantity: number | null;
  unit: string | null;
  emissions: number | null;
  factor_value: number | null;
  factor_year: number | null;
  factor_source: string | null;
};

type Scope3Row = {
  period_year: number | null;
  period_month: number | null;
  spend_amount: number | null;
  currency: string | null;
  category_label: string | null;
  eio_sector: string | null;
  emission_factor_value: number | null;
  emission_factor_year: number | null;
  emission_factor_source: string | null;
  emissions: number | null;
  emissions_source: string | null;
  calculation_method: string | null;
};

type Company = {
  company_name: string | null;
  country: string | null;
  region: string | null;
  reporting_year_preference: string | null;
};

const CURRENT_YEAR = new Date().getFullYear();
const SCOPE1_DISCLOSURE =
  'Scope 1 emissions are estimates based on user-provided fuel data. Results may be partial and do not represent full Scope 1 coverage.';
const SCOPE3_DISCLOSURE =
  'Scope 3 emissions shown here are screening-level estimates calculated using spend-based environmentally extended input-output (EIO) models. Results are indicative only and subject to high uncertainty.';

const SCOPE1_UNIT_LABELS: Record<string, string> = {
  therms: 'Therms (US)',
  m3: 'Cubic meters (m3)',
  'kwh-eq': 'kWh-equivalent',
};

const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const toCsv = (records: Scope2Row[], company: Company | null) => {
  const disclosure = 'Location-based Scope 2 electricity calculation aligned with the GHG Protocol.';
  const headers = [
    'company_name',
    'period',
    'country',
    'kwh',
    'scope2_location_based_tco2e',
    'scope2_market_based_tco2e',
    'emission_factor_value',
    'emission_factor_year',
    'emission_factor_source',
  ];
  const rows = records.map((row) => {
    const period = `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
    const country = `${row.calc_country || ''}${row.calc_region ? ` / ${row.calc_region}` : ''}`;
    return [
      row.companies?.company_name || company?.company_name || '',
      period,
      country,
      row.kwh ?? '',
      row.location_based_emissions ?? '',
      row.market_based_emissions ?? '',
      row.emission_factor_value ?? '',
      row.emission_factor_year ?? '',
      row.emission_factor_source ?? '',
    ];
  });
  rows.push(['Disclosure', disclosure]);
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
};

const toScope1Csv = (entries: Scope1Row[]) => {
  const headers = [
    'Scope',
    'Category',
    'Fuel type',
    'Period',
    'Quantity',
    'Unit',
    'Emissions (tCO2e)',
    'Emission factor value',
    'Factor year',
    'Factor source',
    'Disclosure text',
  ];
  const rows = entries.map((entry) => {
    const period = `${entry.period_year}-${String(entry.period_month).padStart(2, '0')}`;
    return [
      'Scope 1',
      'Stationary combustion',
      'Natural gas',
      period,
      entry.quantity ?? '',
      SCOPE1_UNIT_LABELS[entry.unit || ''] || entry.unit || '',
      entry.emissions ?? '',
      entry.factor_value ?? '',
      entry.factor_year ?? '',
      entry.factor_source ?? '',
      SCOPE1_DISCLOSURE,
    ];
  });
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
};

const toScope3Csv = (entries: Scope3Row[]) => {
  const headers = [
    'Scope',
    'Method',
    'Period',
    'Category',
    'Spend amount',
    'Currency',
    'EIO sector reference',
    'Emission factor value',
    'Factor year',
    'Factor source',
    'Emissions source',
    'Emissions (tCO2e)',
    'Disclosure text',
  ];
  const rows = entries.map((entry) => {
    const period = entry.period_month
      ? `${entry.period_year}-${String(entry.period_month).padStart(2, '0')}`
      : `${entry.period_year || ''}`;
    const method = entry.calculation_method === 'actual' ? 'Actuals' : 'Spend-based';
    return [
      'Scope 3',
      method,
      period,
      entry.category_label || '',
      entry.spend_amount ?? '',
      entry.currency || '',
      entry.eio_sector || '',
      entry.emission_factor_value ?? '',
      entry.emission_factor_year ?? '',
      entry.emission_factor_source ?? '',
      entry.emissions_source ?? '',
      entry.emissions ?? '',
      SCOPE3_DISCLOSURE,
    ];
  });
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
};

const downloadCsv = (csv: string, filename: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const Exports = () => {
  const {
    exportsFilters,
    setExportsFilters,
    reportingYear,
    setReportingYear,
    recordsFilters,
    setRecordsFilters,
    scopeFilters,
    setScopeFilters,
  } = useCarbonStore();
  const [company, setCompany] = useState<Company | null>(null);
  const tab = exportsFilters.tab;
  const [status, setStatus] = useState('');
  const [scope1Status, setScope1Status] = useState('');
  const [scope3Status, setScope3Status] = useState('');
  const [scope3Locked, setScope3Locked] = useState(false);
  const [yearOptions, setYearOptions] = useState<number[]>([]);
  const [scope1YearOptions, setScope1YearOptions] = useState<number[]>([]);
  const [scope3YearOptions, setScope3YearOptions] = useState<number[]>([]);
  const year = recordsFilters.year;
  const scope1Year = scopeFilters.year;
  const scope3Year = scopeFilters.year;
  const [loading, setLoading] = useState(false);
  const [scope1Loading, setScope1Loading] = useState(false);
  const [scope3Loading, setScope3Loading] = useState(false);

  useEffect(() => {
    if (!year && reportingYear) {
      setRecordsFilters({ year: reportingYear });
    }
  }, [year, reportingYear, setRecordsFilters]);

  const companyLabel = useMemo(() => {
    if (!company) return 'Company not set';
    const region = company.region ? ` / ${company.region}` : '';
    return `${company.company_name || 'Company'} (${company.country || ''}${region})`;
  }, [company]);

  const populateYears = (records: Array<{ period_year: number | null }>) => {
    const years = Array.from(new Set(records.map((row) => row.period_year))).filter(Boolean) as number[];
    if (!years.includes(CURRENT_YEAR)) years.push(CURRENT_YEAR);
    years.sort((a, b) => b - a);
    setYearOptions(years);
    if (!year) {
      const nextYear = reportingYear && years.includes(Number(reportingYear))
        ? reportingYear
        : years.includes(CURRENT_YEAR)
          ? String(CURRENT_YEAR)
          : '';
      setRecordsFilters({ year: nextYear });
    }
  };

  const populateScope1Years = (records: Array<{ period_year: number | null }>) => {
    const years = Array.from(new Set(records.map((row) => row.period_year))).filter(Boolean) as number[];
    if (!years.includes(CURRENT_YEAR)) years.push(CURRENT_YEAR);
    years.sort((a, b) => b - a);
    setScope1YearOptions(years);
    if (!scope1Year) {
      setScopeFilters({ year: years.includes(CURRENT_YEAR) ? String(CURRENT_YEAR) : '' });
    }
  };

  const populateScope3Years = (records: Array<{ period_year: number | null }>) => {
    const years = Array.from(new Set(records.map((row) => row.period_year))).filter(Boolean) as number[];
    if (!years.includes(CURRENT_YEAR)) years.push(CURRENT_YEAR);
    years.sort((a, b) => b - a);
    setScope3YearOptions(years);
    if (!scope3Year) {
      setScopeFilters({ year: years.includes(CURRENT_YEAR) ? String(CURRENT_YEAR) : '' });
    }
  };

  const applyReportingPreference = (companyData: Company | null, years: number[]) => {
    const pref = companyData?.reporting_year_preference || 'all';
    const now = new Date().getFullYear();
    const targetYear = pref === 'current' ? now : pref === 'previous' ? now - 1 : null;
    if (!targetYear) return;
    if (years.includes(targetYear)) {
      if (!year) {
        setRecordsFilters({ year: String(targetYear) });
        setReportingYear(String(targetYear));
      }
    }
  };

  const fetchScope2Records = async () => {
    let query = supabase
      .from('scope2_records')
      .select(
        'period_year,period_month,kwh,location_based_emissions,market_based_emissions,emission_factor_value,emission_factor_year,emission_factor_source,calc_country,calc_region,companies(company_name)'
      )
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false });
    if (recordsFilters.year) query = query.eq('period_year', recordsFilters.year);
    if (recordsFilters.country) query = query.eq('calc_country', recordsFilters.country);
    if (recordsFilters.region) query = query.eq('calc_region', recordsFilters.region);
    if (recordsFilters.method === 'market') query = query.not('market_based_emissions', 'is', null);
    if (recordsFilters.method === 'location') query = query.is('market_based_emissions', null);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Scope2Row[];
  };

  const fetchScope1Records = async () => {
    let query = supabase
      .from('scope1_records')
      .select('period_year,period_month,quantity,unit,emissions,factor_value,factor_year,factor_source')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false });
    if (scopeFilters.year) query = query.eq('period_year', scopeFilters.year);
    if (scopeFilters.country) query = query.eq('country', scopeFilters.country);
    if (scopeFilters.region) query = query.eq('region', scopeFilters.region);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Scope1Row[];
  };

  const fetchScope3Records = async () => {
    let query = supabase
      .from('scope3_records')
      .select(
        'period_year,period_month,spend_amount,currency,category_label,eio_sector,emission_factor_value,emission_factor_year,emission_factor_source,emissions,emissions_source,calculation_method'
      )
      .order('period_year', { ascending: false })
      .order('created_at', { ascending: false });
    if (scopeFilters.year) query = query.eq('period_year', scopeFilters.year);
    if (scopeFilters.category) query = query.eq('category_label', scopeFilters.category);
    if (scopeFilters.country) query = query.eq('spend_country', scopeFilters.country);
    if (scopeFilters.region) query = query.eq('spend_region', scopeFilters.region);
    if (scopeFilters.method === 'actuals') query = query.eq('calculation_method', 'actual');
    if (scopeFilters.method === 'spend') query = query.eq('calculation_method', 'eio');
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Scope3Row[];
  };

  useEffect(() => {
    const init = async () => {
      setStatus('Checking access...');
      const session = await requireSession();
      if (!session) return;
      const companyData = await fetchCompany(session.user.id);
      setCompany(companyData);
      const entitlements = companyData?.id ? await fetchEntitlements(companyData.id) : null;
      setScope3Locked(!entitlements?.allow_scope3);
      if (!entitlements?.allow_scope3) {
        setExportsFilters({ tab: 'scope2' });
      }

      const records = await fetchScope2Records();
      populateYears(records);
      const years = Array.from(new Set(records.map((row) => row.period_year))).filter(Boolean) as number[];
      applyReportingPreference(companyData, years);
      setStatus('');

      try {
        const scope1Records = await fetchScope1Records();
        populateScope1Years(scope1Records);
      } catch (error) {
        console.warn('Scope 1 records load failed', error);
        populateScope1Years([]);
      }

      try {
        const scope3Records = scope3Locked ? [] : await fetchScope3Records();
        populateScope3Years(scope3Records);
      } catch (error) {
        console.warn('Scope 3 records load failed', error);
        populateScope3Years([]);
      }
    };

    init().catch((error) => setStatus(`Unable to load exports: ${String(error)}`));
  }, []);

  const handleScope2Export = async () => {
    setLoading(true);
    setStatus('Generating CSV...');
    try {
      const data = await fetchScope2Records();
      if (!data.length) {
        setStatus(
          'No Scope 2 electricity records found for this period. Add a record to include it in calculations and exports.'
        );
        setLoading(false);
        return;
      }
      const csv = toCsv(data, company);
      const namePart = year ? `${year}` : 'filtered';
      downloadCsv(csv, `carbonwise_scope2_${namePart}.csv`);
      setStatus('CSV generated.');
    } catch (error) {
      console.warn('CSV export error', error);
      setStatus('Could not generate CSV right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleScope1Export = async () => {
    setScope1Loading(true);
    setScope1Status('Generating Scope 1 CSV...');
    try {
      const entries = await fetchScope1Records();
      if (!entries.length) {
        setScope1Status('No Scope 1 entries found for this period. Add a record to include it in exports.');
        setScope1Loading(false);
        return;
      }
      const csv = toScope1Csv(entries);
      const namePart = scope1Year ? `${scope1Year}` : 'filtered';
      downloadCsv(csv, `carbonwise_scope1_${namePart}.csv`);
      setScope1Status('Scope 1 CSV generated.');
    } catch (error) {
      console.warn('Scope 1 CSV export error', error);
      setScope1Status('Could not generate Scope 1 CSV right now. Please try again.');
    } finally {
      setScope1Loading(false);
    }
  };

  const handleScope3Export = async () => {
    if (scope3Locked) {
      setScope3Status('');
      return;
    }
    setScope3Loading(true);
    setScope3Status('Generating Scope 3 CSV...');
    try {
      const entries = await fetchScope3Records();
      if (!entries.length) {
        setScope3Status('No Scope 3 records found for this period. Add a record to include it in exports.');
        setScope3Loading(false);
        return;
      }
      const csv = toScope3Csv(entries);
      const namePart = scope3Year ? `${scope3Year}` : 'filtered';
      downloadCsv(csv, `carbonwise_scope3_${namePart}.csv`);
      setScope3Status('Scope 3 CSV generated.');
    } catch (error) {
      console.warn('Scope 3 CSV export error', error);
      setScope3Status('Could not generate Scope 3 CSV right now. Please try again.');
    } finally {
      setScope3Loading(false);
    }
  };

  return (
    <div>
      <section className="page-card">
        <h1 className="page-title">Export / Reports</h1>
        <p className="muted">Generate CSV exports for Scope 1, 2, and 3 emissions.</p>
        <div className="company-label">{companyLabel}</div>
      </section>

      <section className="page-card">
        <div className="tab-header">
          <button
            type="button"
            className={`tab-button ${tab === 'scope2' ? 'active' : ''}`}
            onClick={() => setExportsFilters({ tab: 'scope2' })}
          >
            Scope 2
          </button>
          <button
            type="button"
            className={`tab-button ${tab === 'scope1' ? 'active' : ''}`}
            onClick={() => setExportsFilters({ tab: 'scope1' })}
          >
            Scope 1
          </button>
          <button
            type="button"
            className={`tab-button ${tab === 'scope3' ? 'active' : ''} ${scope3Locked ? 'locked' : ''}`}
            onClick={() => {
              if (!scope3Locked) setExportsFilters({ tab: 'scope3' });
            }}
            disabled={scope3Locked}
          >
            Scope 3
          </button>
        </div>
        {scope3Locked ? (
          <div className="lock-banner">Upgrade to CarbonWise Complete to unlock Scope 3 exports.</div>
        ) : null}
      </section>

      {tab === 'scope2' ? (
        <section className="page-card stack">
          <h2 className="section-title">Scope 2 electricity CSV</h2>
          <p className="note">
            Using current Records filters (year, country/region, method). Update filters in Records to refine exports.
          </p>
          <div>
            <label htmlFor="exportYear">Reporting year</label>
            <select
              id="exportYear"
              value={year}
              onChange={(event) => {
                const value = event.target.value;
                setRecordsFilters({ year: value });
                setReportingYear(value);
              }}
            >
              <option value="">All years</option>
              {yearOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="actions">
            <button type="button" className="btn primary" onClick={handleScope2Export} disabled={loading}>
              {loading ? 'Generating...' : 'Export CSV'}
            </button>
            <button type="button" className="btn secondary" disabled>
              Export PDF (coming soon)
            </button>
          </div>
          <div className="status">{status}</div>
          <p className="note">CSV includes factor values and disclosure text aligned with the GHG Protocol.</p>
        </section>
      ) : null}

      {tab === 'scope1' ? (
        <section className="page-card stack">
          <h2 className="section-title">Scope 1 natural gas CSV</h2>
          <p className="note">
            Using current Scope filters (year, country/region). Update filters in Scope 1 records to refine exports.
          </p>
          <div>
            <label htmlFor="scope1ExportYear">Reporting year</label>
            <select
              id="scope1ExportYear"
              value={scope1Year}
              onChange={(event) => setScopeFilters({ year: event.target.value })}
            >
              <option value="">All years</option>
              {scope1YearOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="actions">
            <button type="button" className="btn primary" onClick={handleScope1Export} disabled={scope1Loading}>
              {scope1Loading ? 'Generating...' : 'Export CSV'}
            </button>
          </div>
          <div className="status">{scope1Status}</div>
          <p className="note">Scope 1 exports include factor data and disclosure text for audit readiness.</p>
        </section>
      ) : null}

      {tab === 'scope3' && !scope3Locked ? (
        <section className="page-card stack">
          <h2 className="section-title">Scope 3 CSV</h2>
          <p className="note">
            Using current Scope filters (year, country/region, category, method). Update filters in Scope 3 records to refine exports.
          </p>
          <div>
            <label htmlFor="scope3ExportYear">Reporting year</label>
            <select
              id="scope3ExportYear"
              value={scope3Year}
              onChange={(event) => setScopeFilters({ year: event.target.value })}
            >
              <option value="">All years</option>
              {scope3YearOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="actions">
            <button type="button" className="btn primary" onClick={handleScope3Export} disabled={scope3Loading}>
              {scope3Loading ? 'Generating...' : 'Export CSV'}
            </button>
          </div>
          <div className="status">{scope3Status}</div>
          <p className="note">Scope 3 CSV includes method, factors, and disclosure text for screening estimates.</p>
        </section>
      ) : null}
    </div>
  );
};

export default Exports;

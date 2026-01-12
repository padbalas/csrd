import { useEffect, useMemo, useState } from 'react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useCarbonStore } from '../stores/useCarbonStore';
import {
  buildSiteLabel,
  fetchCompany,
  fetchCompanySites,
  supabase,
  type CompanySite,
} from '../lib/supabase';
import { useAuth } from '../components/AuthProvider';

type Scope1Row = {
  period_year: number | null;
  period_month: number | null;
  emissions: number | null;
  site_id: string | null;
};

type Scope2Row = {
  period_year: number | null;
  period_month: number | null;
  location_based_emissions: number | null;
  market_based_emissions: number | null;
  site_id: string | null;
};

type Scope3Row = {
  period_year: number | null;
  period_month: number | null;
  emissions: number | null;
  calculation_method: string | null;
};

type Basis = 'location' | 'market';

const formatNumber = (value: number, digits = 2) =>
  Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });

const getScope2Value = (row: Scope2Row, basis: Basis) => {
  if (basis === 'market') {
    return row.market_based_emissions != null
      ? Number(row.market_based_emissions)
      : Number(row.location_based_emissions || 0);
  }
  return Number(row.location_based_emissions || 0);
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toYearRange = (year: string) => {
  if (!year) {
    return { start: '', end: '' };
  }
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
};

const Dashboard = () => {
  const {
    setOrganization,
    setSite,
    setDateRange,
    fetchRecords,
    computeDerived,
    records,
  } = useCarbonStore();
  const { session } = useAuth();
  const [ready, setReady] = useState(false);
  const [sites, setSites] = useState<CompanySite[]>([]);
  const [yearOptions, setYearOptions] = useState<number[]>([]);
  const [year, setYear] = useState('');
  const [siteId, setSiteId] = useState('');
  const [basis, setBasis] = useState<Basis>('location');
  const [status, setStatus] = useState('Checking access...');
  const [totalNote, setTotalNote] = useState('Select a year to see combined monthly trend.');
  const [coverage, setCoverage] = useState('—');
  const [topSite, setTopSite] = useState('—');
  const [trendEmpty, setTrendEmpty] = useState('Select a year to see combined monthly trend.');
  const [trendData, setTrendData] = useState<Array<{ month: string; total: number }>>([]);
  const [metrics, setMetrics] = useState({
    total: 0,
    scope1: 0,
    scope2: 0,
    scope3Actuals: 0,
    scope3Screening: 0,
  });

  const loadScope1 = async (yearValue: string, siteValue: string) => {
    let query = supabase
      .from('scope1_records')
      .select('period_year,period_month,emissions,site_id');
    if (yearValue) query = query.eq('period_year', Number(yearValue));
    if (siteValue) query = query.eq('site_id', siteValue);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Scope1Row[];
  };

  const loadScope2 = async (yearValue: string, siteValue: string) => {
    let query = supabase
      .from('scope2_records')
      .select('period_year,period_month,location_based_emissions,market_based_emissions,site_id');
    if (yearValue) query = query.eq('period_year', Number(yearValue));
    if (siteValue) query = query.eq('site_id', siteValue);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Scope2Row[];
  };

  const loadScope3 = async (yearValue: string) => {
    let query = supabase
      .from('scope3_records')
      .select('period_year,period_month,emissions,calculation_method');
    if (yearValue) query = query.eq('period_year', Number(yearValue));
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Scope3Row[];
  };

  const populateYearOptions = (scope1: Scope1Row[], scope2: Scope2Row[], pref: string | null) => {
    const years = new Set<number>();
    scope1.forEach((row) => row.period_year && years.add(row.period_year));
    scope2.forEach((row) => row.period_year && years.add(row.period_year));
    const list = Array.from(years).sort((a, b) => b - a);
    setYearOptions(list);
    const now = new Date().getFullYear();
    const preferred = pref === 'current' ? now : pref === 'previous' ? now - 1 : null;
    if (preferred && list.includes(preferred)) {
      setYear(String(preferred));
      return;
    }
    if (list.includes(now)) {
      setYear(String(now));
      return;
    }
    setYear('');
  };

  const renderTrend = (scope1: Scope1Row[], scope2: Scope2Row[], scope3Actuals: Scope3Row[]) => {
    const availableYears = [
      ...scope1.map((row) => row.period_year || 0),
      ...scope2.map((row) => row.period_year || 0),
      ...scope3Actuals.map((row) => row.period_year || 0),
    ].filter((value) => value);
    const latestYear = availableYears.length ? Math.max(...availableYears) : null;
    const displayYear = year ? Number(year) : latestYear;
    if (!displayYear) {
      setTrendData([]);
      setTrendEmpty('Select a year to see combined monthly trend.');
      return;
    }
    const totals = Array.from({ length: 12 }, (_, idx) => {
      const month = idx + 1;
      const scope1Total = scope1
        .filter((row) => row.period_year === displayYear && row.period_month === month)
        .reduce((sum, row) => sum + Number(row.emissions || 0), 0);
      const scope2Total = scope2
        .filter((row) => row.period_year === displayYear && row.period_month === month)
        .reduce((sum, row) => sum + getScope2Value(row, basis), 0);
      const scope3Total = scope3Actuals
        .filter((row) => row.period_year === displayYear && row.period_month === month)
        .reduce((sum, row) => sum + Number(row.emissions || 0), 0);
      return scope1Total + scope2Total + scope3Total;
    });
    const max = Math.max(...totals, 0);
    if (max === 0) {
      setTrendData([]);
      setTrendEmpty('No records found for this year.');
      return;
    }
    setTrendEmpty('');
    setTrendData(
      totals.map((value, idx) => ({
        month: MONTH_LABELS[idx],
        total: Number(value.toFixed(3)),
      }))
    );
  };

  const renderMetrics = (scope1: Scope1Row[], scope2: Scope2Row[], scope3: Scope3Row[]) => {
    const scope1Total = scope1.reduce((sum, row) => sum + Number(row.emissions || 0), 0);
    const scope2Total = scope2.reduce((sum, row) => sum + getScope2Value(row, basis), 0);
    const scope3Actuals = scope3.filter((row) => (row.calculation_method || 'eio') === 'actual');
    const scope3Screening = scope3.filter((row) => (row.calculation_method || 'eio') !== 'actual');
    const scope3ActualsTotal = scope3Actuals.reduce((sum, row) => sum + Number(row.emissions || 0), 0);
    const scope3ScreeningTotal = scope3Screening.reduce((sum, row) => sum + Number(row.emissions || 0), 0);
    const total = scope1Total + scope2Total + scope3ActualsTotal;

    setMetrics({
      total,
      scope1: scope1Total,
      scope2: scope2Total,
      scope3Actuals: scope3ActualsTotal,
      scope3Screening: scope3ScreeningTotal,
    });

    setTotalNote(
      year
        ? `Totals for ${year} • ${basis === 'market' ? 'Market-based Scope 2' : 'Location-based Scope 2'}`
        : 'Select a year to see combined monthly trend.'
    );

    const coverageMonths = new Set<string>();
    scope1.forEach((row) => coverageMonths.add(`${row.period_year}-${row.period_month}`));
    scope2.forEach((row) => coverageMonths.add(`${row.period_year}-${row.period_month}`));
    scope3Actuals
      .filter((row) => row.period_month)
      .forEach((row) => coverageMonths.add(`${row.period_year}-${row.period_month}`));
    setCoverage(coverageMonths.size ? String(coverageMonths.size) : '—');

    if (siteId) {
      const site = sites.find((s) => String(s.id) === String(siteId));
      setTopSite(site ? buildSiteLabel(site) : '—');
      return;
    }
    const siteTotals = new Map<string, number>();
    scope1.forEach((row) => {
      const key = row.site_id || 'unknown';
      siteTotals.set(key, (siteTotals.get(key) || 0) + Number(row.emissions || 0));
    });
    scope2.forEach((row) => {
      const key = row.site_id || 'unknown';
      siteTotals.set(key, (siteTotals.get(key) || 0) + getScope2Value(row, basis));
    });
    let topId = '';
    let topValue = 0;
    siteTotals.forEach((value, key) => {
      if (value > topValue) {
        topValue = value;
        topId = key;
      }
    });
    const site = sites.find((s) => String(s.id) === String(topId));
    setTopSite(site ? buildSiteLabel(site) : '—');
  };

  const syncStore = async () => {
    setSite(siteId);
    setDateRange(toYearRange(year));
    await fetchRecords();
    computeDerived();
  };

  const loadDashboard = async () => {
    try {
      setStatus('Loading dashboard...');
      await syncStore();
      const [scope1, scope2, scope3] = await Promise.all([
        loadScope1(year, siteId),
        loadScope2(year, siteId),
        loadScope3(year),
      ]);
      renderMetrics(scope1, scope2, scope3);
      renderTrend(
        scope1,
        scope2,
        scope3.filter((row) => (row.calculation_method || 'eio') === 'actual')
      );
      setStatus('');
    } catch (error) {
      setStatus(`Unable to load dashboard: ${String(error)}`);
    }
  };

  useEffect(() => {
    const init = async () => {
      if (!session?.user?.id) {
        setReady(false);
        setStatus('Checking access...');
        return;
      }
      const company = await fetchCompany(session.user.id);
      if (company?.id) {
        setOrganization(company.id);
        const siteList = await fetchCompanySites(company.id);
        setSites(siteList);
      }
      const [scope1All, scope2All] = await Promise.all([loadScope1('', ''), loadScope2('', '')]);
      populateYearOptions(scope1All, scope2All, company?.reporting_year_preference || null);
      setReady(true);
      setStatus('');
    };
    init();
  }, [setOrganization, session?.user?.id]);

  useEffect(() => {
    if (!ready) return;
    loadDashboard();
  }, [ready, year, siteId, basis]);

  const yearOptionsSorted = useMemo(() => yearOptions.slice().sort((a, b) => b - a), [yearOptions]);

  return (
    <div>
      <section className="dashboard-top">
        <div className="controls">
          <div>
            <label htmlFor="dashboard-year">Reporting year</label>
            <select id="dashboard-year" value={year} onChange={(event) => setYear(event.target.value)}>
              <option value="">All years</option>
              {yearOptionsSorted.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dashboard-site">Site</label>
            <select id="dashboard-site" value={siteId} onChange={(event) => setSiteId(event.target.value)}>
              <option value="">All sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {buildSiteLabel(site)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Scope 2 basis</label>
            <div className="toggle-group" role="group" aria-label="Scope 2 basis">
              <button
                type="button"
                className={basis === 'location' ? 'active' : ''}
                onClick={() => setBasis('location')}
              >
                Location-based
              </button>
              <button
                type="button"
                className={basis === 'market' ? 'active' : ''}
                onClick={() => setBasis('market')}
              >
                Market-based
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="hero-card">
        <div className="metric-label">Total company carbon (Scope 1 + Scope 2 + Scope 3 actuals)</div>
        <div className="hero-value">{formatNumber(metrics.total, 2)} tCO2e</div>
        <div className="metric-label">{totalNote}</div>
        <div className="metric-label">
          Scope 3 spend-based screening is shown separately and not included in this total.
        </div>
      </section>

      <section>
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">Scope 1 total</div>
            <div className="metric-value">{formatNumber(metrics.scope1, 2)} tCO2e</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Scope 2 total</div>
            <div className="metric-value">{formatNumber(metrics.scope2, 2)} tCO2e</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Scope 3 actuals total</div>
            <div className="metric-value">{formatNumber(metrics.scope3Actuals, 2)} tCO2e</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Scope 3 screening total</div>
            <div className="metric-value">{formatNumber(metrics.scope3Screening, 2)} tCO2e</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Coverage (months)</div>
            <div className="metric-value">{coverage}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Top site</div>
            <div className="metric-value">{topSite}</div>
          </div>
        </div>
      </section>

      <section className="trend-wrap">
        <div className="metric-label">Monthly trend (Scope 1 + Scope 2 + Scope 3 actuals)</div>
        {trendData.length ? (
          <div className="trend-chart" role="img" aria-label="Monthly trend">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => formatNumber(value, 0)}
                />
                <Tooltip
                  formatter={(value) => [`${formatNumber(Number(value), 2)} tCO2e`, 'Total']}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#0f766e"
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="empty">{trendEmpty}</div>
        )}
      </section>

      <section className="page-card">
        {/* TODO: Remove once dashboard parity/QA is complete. */}
        <h2 className="page-title">Data status</h2>
        <p>{status || `Loaded ${records.length} records from the shared store.`}</p>
      </section>
    </div>
  );
};

export default Dashboard;

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchCompany,
  fetchEntitlements,
  requireSession,
  supabase,
} from '../lib/supabase';
import { useCarbonStore } from '../stores/useCarbonStore';

type Scope2Row = {
  period_year: number | null;
  period_month: number | null;
  location_based_emissions: number | null;
  calc_country: string | null;
  calc_region: string | null;
};

type Scope1Row = {
  period_year: number | null;
  period_month: number | null;
  emissions: number | null;
  country: string | null;
  region: string | null;
};

type Scope3Row = {
  period_year: number | null;
  period_month: number | null;
  emissions: number | null;
  category_label: string | null;
  spend_country: string | null;
  spend_region: string | null;
};

type BarRow = {
  label: string;
  value: number;
  share: number;
};

const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const formatNumber = (value: number, digits = 2) =>
  Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });

const buildTrend = <T,>(rows: T[], field: keyof T, yearLabel: string) => {
  const grouped = new Map<string, number>();
  rows.forEach((row: any) => {
    if (!row.period_year || !row.period_month) return;
    const key = `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
    grouped.set(key, (grouped.get(key) || 0) + Number(row[field] || 0));
  });
  const keys = Array.from(grouped.keys()).sort();
  if (!keys.length) {
    return {
      total: '—',
      range: 'Monthly totals based on saved records',
      empty: `No ${yearLabel} records found for this period. Add a record to include it in calculations and exports.`,
      data: [] as Array<{ label: string; value: number }>,
    };
  }
  const data = keys.map((key) => {
    const [year, month] = key.split('-');
    const label = `${monthNames[Number(month) - 1]} ${year}`;
    return { label, value: grouped.get(key) || 0 };
  });
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const rangeLabel = `${data[0].label} – ${data[data.length - 1].label} (saved records only)`;
  return {
    total: `${formatNumber(total, 3)} tCO2e`,
    range: rangeLabel,
    empty: '',
    data,
  };
};

const buildBars = <T,>(rows: T[], label: (row: T) => string, field: keyof T): BarRow[] => {
  const totals: Record<string, number> = {};
  let total = 0;
  rows.forEach((row) => {
    const key = label(row) || '—';
    const value = Number((row as any)[field] || 0);
    totals[key] = (totals[key] || 0) + value;
    total += value;
  });
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({
      label: key,
      value,
      share: total ? (value / total) * 100 : 0,
    }));
};

const buildCoverage = <T,>(rows: T[], formatter: (row: T) => string) => {
  const set = new Set(rows.map(formatter));
  return set.size ? `${set.size} month${set.size === 1 ? '' : 's'}` : '—';
};

const Insights = () => {
  const { insightsFilters, setInsightsFilters, reportingYear, setReportingYear } = useCarbonStore();
  const [yearOptions, setYearOptions] = useState<number[]>([]);
  const year = insightsFilters.year;
  const tab = insightsFilters.tab;
  const [scope2, setScope2] = useState<Scope2Row[]>([]);
  const [scope1, setScope1] = useState<Scope1Row[]>([]);
  const [scope3, setScope3] = useState<Scope3Row[]>([]);
  const [status, setStatus] = useState('Checking access...');
  const [scope3Locked, setScope3Locked] = useState(false);

  const filteredScope2 = useMemo(
    () => (year ? scope2.filter((row) => String(row.period_year) === year) : scope2),
    [scope2, year]
  );
  const filteredScope1 = useMemo(
    () => (year ? scope1.filter((row) => String(row.period_year) === year) : scope1),
    [scope1, year]
  );
  const filteredScope3 = useMemo(
    () => (year ? scope3.filter((row) => String(row.period_year) === year) : scope3),
    [scope3, year]
  );

  const scope2Trend = useMemo(
    () => buildTrend(filteredScope2, 'location_based_emissions', 'electricity'),
    [filteredScope2]
  );
  const scope1Trend = useMemo(
    () => buildTrend(filteredScope1, 'emissions', 'Scope 1'),
    [filteredScope1]
  );

  const scope2Regions = useMemo(
    () => buildBars(filteredScope2, (row) => `${row.calc_country || '—'}${row.calc_region ? ` / ${row.calc_region}` : ''}`, 'location_based_emissions'),
    [filteredScope2]
  );
  const scope1Regions = useMemo(
    () => buildBars(filteredScope1, (row) => `${row.country || '—'}${row.region ? ` / ${row.region}` : ''}`, 'emissions'),
    [filteredScope1]
  );
  const scope3Categories = useMemo(
    () => buildBars(filteredScope3, (row) => row.category_label || '—', 'emissions'),
    [filteredScope3]
  );
  const scope3Regions = useMemo(
    () => buildBars(filteredScope3, (row) => `${row.spend_country || '—'}${row.spend_region ? ` / ${row.spend_region}` : ''}`, 'emissions'),
    [filteredScope3]
  );

  const scope2Coverage = useMemo(
    () => buildCoverage(filteredScope2, (row) => `${row.period_year}-${row.period_month}`),
    [filteredScope2]
  );
  const scope1Coverage = useMemo(
    () => buildCoverage(filteredScope1, (row) => `${row.period_year}-${row.period_month}`),
    [filteredScope1]
  );
  const scope3Coverage = useMemo(
    () => (filteredScope3.length ? `${filteredScope3.length} record${filteredScope3.length === 1 ? '' : 's'}` : '—'),
    [filteredScope3]
  );

  const loadData = async (selectedYear: string, allowScope3: boolean) => {
    const scope2Query = supabase
      .from('scope2_records')
      .select('period_year,period_month,location_based_emissions,calc_country,calc_region');
    const scope1Query = supabase
      .from('scope1_records')
      .select('period_year,period_month,emissions,country,region');
    const scope3Query = supabase
      .from('scope3_records')
      .select('period_year,period_month,emissions,category_label,spend_country,spend_region');

    if (selectedYear) {
      scope2Query.eq('period_year', Number(selectedYear));
      scope1Query.eq('period_year', Number(selectedYear));
      if (allowScope3) scope3Query.eq('period_year', Number(selectedYear));
    }

    const [scope2Resp, scope1Resp, scope3Resp] = await Promise.all([
      scope2Query,
      scope1Query,
      allowScope3 ? scope3Query : Promise.resolve({ data: [], error: null }),
    ]);

    if (scope2Resp.error) throw scope2Resp.error;
    if (scope1Resp.error) throw scope1Resp.error;
    if (scope3Resp.error) throw scope3Resp.error;

    setScope2((scope2Resp.data || []) as Scope2Row[]);
    setScope1((scope1Resp.data || []) as Scope1Row[]);
    setScope3((scope3Resp.data || []) as Scope3Row[]);
  };

  useEffect(() => {
    const init = async () => {
      const session = await requireSession();
      if (!session) return;
      const company = await fetchCompany(session.user.id);
      const entitlements = company?.id ? await fetchEntitlements(company.id) : null;
      const allowScope3 = Boolean(entitlements?.allow_scope3);
      setScope3Locked(!allowScope3);
      if (!allowScope3) {
        setInsightsFilters({ tab: 'scope2' });
      }

      const { data, error } = await supabase
        .from('scope2_records')
        .select('period_year')
        .order('period_year', { ascending: false });
      if (error) throw error;
      const years = Array.from(new Set((data || []).map((row) => row.period_year).filter(Boolean))) as number[];
      const now = new Date().getFullYear();
      const pref = company?.reporting_year_preference || null;
      const preferred = pref === 'current' ? now : pref === 'previous' ? now - 1 : null;
      if (!years.includes(now)) years.push(now);
      years.sort((a, b) => b - a);
      setYearOptions(years);
      if (preferred && years.includes(preferred)) {
        if (!year) {
          setInsightsFilters({ year: String(preferred) });
          setReportingYear(String(preferred));
        }
      } else if (years.includes(now)) {
        if (!year) {
          setInsightsFilters({ year: String(now) });
          setReportingYear(String(now));
        }
      }

      await loadData('', allowScope3);
      setStatus('');
    };
    init().catch((error) => {
      setStatus(`Unable to load insights: ${String(error)}`);
    });
  }, []);

  useEffect(() => {
    if (!year && reportingYear) {
      setInsightsFilters({ year: reportingYear });
    }
  }, [year, reportingYear, setInsightsFilters]);

  useEffect(() => {
    if (!yearOptions.length) return;
    const load = async () => {
      setStatus('Loading insights...');
      await loadData(year, !scope3Locked);
      setStatus('');
    };
    load().catch((error) => setStatus(`Unable to load insights: ${String(error)}`));
  }, [year, scope3Locked, yearOptions.length]);

  return (
    <div>
      <section className="page-card">
        <h1 className="page-title">Insights</h1>
        <p className="muted">Trends and coverage for Scope 1, 2, and 3 emissions.</p>
        <div className="filters">
          <div>
            <label htmlFor="insightYear">Reporting year</label>
            <select
              id="insightYear"
              value={year}
              onChange={(event) => {
                const value = event.target.value;
                setInsightsFilters({ year: value });
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
          <div className="status">{status}</div>
        </div>
      </section>

      <section className="page-card">
        <div className="tab-header">
          <button
            type="button"
            className={`tab-button ${tab === 'scope2' ? 'active' : ''}`}
            onClick={() => setInsightsFilters({ tab: 'scope2' })}
          >
            Scope 2
          </button>
          <button
            type="button"
            className={`tab-button ${tab === 'scope1' ? 'active' : ''}`}
            onClick={() => setInsightsFilters({ tab: 'scope1' })}
          >
            Scope 1
          </button>
          <button
            type="button"
            className={`tab-button ${tab === 'scope3' ? 'active' : ''} ${scope3Locked ? 'locked' : ''}`}
            onClick={() => {
              if (!scope3Locked) setInsightsFilters({ tab: 'scope3' });
            }}
            disabled={scope3Locked}
          >
            Scope 3
          </button>
        </div>
        {scope3Locked ? (
          <div className="lock-banner">Upgrade to CarbonWise Complete to unlock Scope 3 insights.</div>
        ) : null}
      </section>

      {tab === 'scope2' ? (
        <>
          <section className="page-card">
            <h2 className="section-title">Monthly trend</h2>
            <div className="metric">{scope2Trend.total}</div>
            <div className="subtitle">{scope2Trend.range}</div>
            {scope2Trend.data.length ? (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={scope2Trend.data}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => `${formatNumber(Number(value), 3)} tCO2e`} />
                    <Line type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty">{scope2Trend.empty}</div>
            )}
          </section>

          <section className="page-card">
            <h2 className="section-title">Regional contribution</h2>
            {scope2Regions.length ? (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={scope2Regions} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                    <XAxis tick={{ fontSize: 12 }} type="number" />
                    <YAxis dataKey="label" type="category" width={140} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value, _name, props) =>
                        `${formatNumber(Number(value), 3)} tCO2e (${props?.payload?.share?.toFixed(0)}%)`
                      }
                    />
                    <Bar dataKey="value" fill="#0f766e" radius={[6, 6, 6, 6]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty">No electricity records found for this period.</div>
            )}
          </section>

          <section className="page-card">
            <h2 className="section-title">Data coverage</h2>
            <div className="metric">{scope2Coverage}</div>
            <div className="subtitle">Coverage based on saved records only</div>
          </section>
        </>
      ) : null}

      {tab === 'scope1' ? (
        <>
          <section className="page-card">
            <h2 className="section-title">Monthly trend</h2>
            <div className="metric">{scope1Trend.total}</div>
            <div className="subtitle">{scope1Trend.range}</div>
            {scope1Trend.data.length ? (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={scope1Trend.data}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => `${formatNumber(Number(value), 3)} tCO2e`} />
                    <Line type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty">{scope1Trend.empty}</div>
            )}
          </section>

          <section className="page-card">
            <h2 className="section-title">Regional contribution</h2>
            {scope1Regions.length ? (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={scope1Regions} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                    <XAxis tick={{ fontSize: 12 }} type="number" />
                    <YAxis dataKey="label" type="category" width={140} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value, _name, props) =>
                        `${formatNumber(Number(value), 3)} tCO2e (${props?.payload?.share?.toFixed(0)}%)`
                      }
                    />
                    <Bar dataKey="value" fill="#0f766e" radius={[6, 6, 6, 6]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty">No Scope 1 records found for this period.</div>
            )}
          </section>

          <section className="page-card">
            <h2 className="section-title">Data coverage</h2>
            <div className="metric">{scope1Coverage}</div>
            <div className="subtitle">Coverage based on saved records only</div>
          </section>
        </>
      ) : null}

      {tab === 'scope3' && !scope3Locked ? (
        <>
          <section className="page-card">
            <h2 className="section-title">Category contribution</h2>
            {scope3Categories.length ? (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={scope3Categories} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                    <XAxis tick={{ fontSize: 12 }} type="number" />
                    <YAxis dataKey="label" type="category" width={160} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value, _name, props) =>
                        `${formatNumber(Number(value), 3)} tCO2e (${props?.payload?.share?.toFixed(0)}%)`
                      }
                    />
                    <Bar dataKey="value" fill="#0f766e" radius={[6, 6, 6, 6]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty">No Scope 3 records found for this period.</div>
            )}
          </section>

          <section className="page-card">
            <h2 className="section-title">Regional contribution</h2>
            {scope3Regions.length ? (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={scope3Regions} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                    <XAxis tick={{ fontSize: 12 }} type="number" />
                    <YAxis dataKey="label" type="category" width={160} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value, _name, props) =>
                        `${formatNumber(Number(value), 3)} tCO2e (${props?.payload?.share?.toFixed(0)}%)`
                      }
                    />
                    <Bar dataKey="value" fill="#0f766e" radius={[6, 6, 6, 6]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty">No Scope 3 records found for this period.</div>
            )}
          </section>

          <section className="page-card">
            <h2 className="section-title">Data coverage</h2>
            <div className="metric">{scope3Coverage}</div>
            <div className="subtitle">Coverage based on saved records only</div>
          </section>
        </>
      ) : null}
    </div>
  );
};

export default Insights;

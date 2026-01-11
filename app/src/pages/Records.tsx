import { useEffect, useMemo, useState } from 'react';
import { ensureCompanySites } from '../lib/sites';
import { fetchCompany, requireSession, supabase } from '../lib/supabase';
import { EMISSION_FACTORS, GLOBAL_FALLBACK } from '../data/emission-factors';
import { useCarbonStore, type RecordsFilters } from '../stores/useCarbonStore';

type Scope2Record = {
  id: string;
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
  market_instrument_type: string | null;
  covered_kwh: number | null;
};

type AddRow = {
  id: string;
  period_year: string;
  period_month: string;
  country: string;
  region: string;
  kwh: string;
  market_enabled: boolean;
  market_type: string;
  covered_kwh: string;
  market_year: string;
};

type Reminder = {
  type: 'missing' | 'region';
  text: string;
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MILES_PER_TON = 1 / 0.000404;
const MONTH_OPTIONS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];
const YEAR_START = 2024;

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
  };
};

const formatNumber = (value: number, digits = 3) =>
  Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });

const detectMethod = (record: Scope2Record) =>
  record.market_based_emissions != null ? 'market' : 'location';

const getRegionLabel = (record: Scope2Record) =>
  `${record.calc_country || '—'}${record.calc_region ? ` / ${record.calc_region}` : ''}`;

const Records = () => {
  const [records, setRecords] = useState<Scope2Record[]>([]);
  const { recordsFilters, setRecordsFilters, reportingYear, setReportingYear } = useCarbonStore();
  const filters: RecordsFilters = recordsFilters;
  const [status, setStatus] = useState('Checking access...');
  const [loggedOut, setLoggedOut] = useState(false);
  const [reportingPref, setReportingPref] = useState<string | null>(null);
  const [selected, setSelected] = useState<Scope2Record | null>(null);
  const [editKwh, setEditKwh] = useState('');
  const [editCovered, setEditCovered] = useState('');
  const [editMarketType, setEditMarketType] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [sites, setSites] = useState<Array<{ id: string; country: string | null; region: string | null }>>([]);
  const [addStatus, setAddStatus] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [singleAdd, setSingleAdd] = useState<AddRow>({
    id: 'single',
    period_year: '',
    period_month: '',
    country: '',
    region: '',
    kwh: '',
    market_enabled: false,
    market_type: '',
    covered_kwh: '',
    market_year: '',
  });
  const [bulkRows, setBulkRows] = useState<AddRow[]>([
    {
      id: 'row-1',
      period_year: '',
      period_month: '',
      country: '',
      region: '',
      kwh: '',
      market_enabled: false,
      market_type: '',
      covered_kwh: '',
      market_year: '',
    },
  ]);

  const validMethod = filters.method === 'location' || filters.method === 'market' ? filters.method : '';

  const applyFilters = (items: Scope2Record[]) => {
    const yearMatch = filters.year ? (r: Scope2Record) => String(r.period_year || '') === filters.year : () => true;
    const countryMatch = filters.country
      ? (r: Scope2Record) => (r.calc_country || '—') === filters.country
      : () => true;
    const regionMatch = filters.region
      ? (r: Scope2Record) => (r.calc_region || '') === filters.region
      : () => true;
    const methodMatch = validMethod
      ? (r: Scope2Record) => detectMethod(r) === validMethod
      : () => true;
    return items.filter((record) => yearMatch(record) && countryMatch(record) && regionMatch(record) && methodMatch(record));
  };

  const filteredRecords = useMemo(() => applyFilters(records), [records, filters]);

  const years = useMemo(() => {
    const set = new Set<string>();
    records.forEach((record) => {
      if (record.period_year) set.add(String(record.period_year));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [records]);

  const countries = useMemo(() => {
    const set = new Set<string>();
    records.forEach((record) => set.add(record.calc_country || '—'));
    return Array.from(set).sort();
  }, [records]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    records.forEach((record) => {
      if (record.calc_region) set.add(record.calc_region);
    });
    return Array.from(set).sort();
  }, [records]);

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const options: string[] = [];
    for (let y = currentYear; y >= YEAR_START; y -= 1) options.push(String(y));
    return options;
  }, [currentYear]);

  const siteCountries = useMemo(() => {
    const set = new Set<string>();
    sites.forEach((site) => {
      if (site.country) set.add(site.country);
    });
    return Array.from(set).sort();
  }, [sites]);

  const siteRegionsByCountry = useMemo(() => {
    const map = new Map<string, string[]>();
    sites.forEach((site) => {
      if (!site.country || !site.region) return;
      if (!map.has(site.country)) map.set(site.country, []);
      map.get(site.country)?.push(site.region);
    });
    map.forEach((value, key) => {
      map.set(key, Array.from(new Set(value)).sort());
    });
    return map;
  }, [sites]);

  const summary = useMemo(() => {
    if (!filteredRecords.length) return null;
    let total = 0;
    const regionTotals: Record<string, number> = {};
    const months = new Set<string>();
    filteredRecords.forEach((record) => {
      const val = Number(record.location_based_emissions || 0);
      total += val;
      const regionLabel = getRegionLabel(record);
      regionTotals[regionLabel] = (regionTotals[regionLabel] || 0) + val;
      const monthKey = `${record.period_year || 'NA'}-${String(record.period_month || '').padStart(2, '0')}`;
      months.add(monthKey);
    });
    const topEntry = Object.entries(regionTotals).sort((a, b) => b[1] - a[1])[0];
    return {
      total: total.toFixed(3),
      avg: months.size ? (total / months.size).toFixed(3) : total.toFixed(3),
      topRegion: topEntry ? `${topEntry[0]} (${topEntry[1].toFixed(3)})` : '—',
      count: months.size,
      compare: `${(total * MILES_PER_TON).toFixed(0)} miles`,
    };
  }, [filteredRecords]);

  const reminders = useMemo(() => {
    if (!filteredRecords.length) return [] as Reminder[];
    const reminderList: Reminder[] = [];
    const filterYear = filters.year;
    const filterCountry = filters.country;
    const filterRegion = filters.region;
    const filterRegionLabel = filterCountry && filterRegion ? `${filterCountry} / ${filterRegion}` : '';
    const now = new Date();
    const currentYear = now.getFullYear();
    const targetYear = filterYear
      ? parseInt(filterYear, 10)
      : reportingPref === 'current'
        ? currentYear
        : reportingPref === 'previous'
          ? currentYear - 1
          : null;

    const monthKeys = filteredRecords.map(
      (record) => `${record.period_year}-${String(record.period_month).padStart(2, '0')}`
    );
    const uniqueMonths = Array.from(new Set(monthKeys)).sort();
    const regionsPresent = Array.from(new Set(filteredRecords.map(getRegionLabel))).filter(Boolean);
    const regionsForCountry = filterCountry
      ? regionsPresent.filter((label) => label.startsWith(`${filterCountry} / `))
      : [];

    const formatMissingRanges = (months: number[], year: number, regionLabel: string) => {
      const sorted = Array.from(new Set(months)).sort((a, b) => a - b);
      const ranges: Array<[number, number]> = [];
      let start: number | null = null;
      let prev: number | null = null;
      sorted.forEach((month) => {
        if (start === null) {
          start = month;
          prev = month;
          return;
        }
        if (month === (prev || 0) + 1) {
          prev = month;
          return;
        }
        ranges.push([start, prev || start]);
        start = month;
        prev = month;
      });
      if (start !== null) ranges.push([start, prev || start]);
      ranges.forEach(([startMonth, endMonth]) => {
        const rangeLabel =
          startMonth === endMonth
            ? `${MONTH_NAMES[startMonth - 1]} ${year}`
            : `${MONTH_NAMES[startMonth - 1]}–${MONTH_NAMES[endMonth - 1]} ${year}`;
        reminderList.push({ type: 'missing', text: `Missing ${rangeLabel} (${regionLabel}).` });
      });
    };

    if (targetYear) {
      const regionList = filterRegionLabel
        ? [filterRegionLabel]
        : filterCountry
          ? regionsForCountry
          : regionsPresent;
      regionList.forEach((regionLabel) => {
        let maxSeenMonth = 0;
        const seen = new Set(
          filteredRecords
            .filter((record) => getRegionLabel(record) === regionLabel)
            .filter((record) => String(record.period_year) === String(targetYear))
            .map((record) => {
              const monthVal = Number(record.period_month || 0);
              if (monthVal > maxSeenMonth) maxSeenMonth = monthVal;
              return `${record.period_year}-${String(monthVal).padStart(2, '0')}`;
            })
        );
        const maxMonth = targetYear === currentYear ? Math.max(now.getMonth() + 1, maxSeenMonth) : 12;
        const missing: number[] = [];
        for (let month = 1; month <= maxMonth; month += 1) {
          const key = `${targetYear}-${String(month).padStart(2, '0')}`;
          if (!seen.has(key)) missing.push(month);
        }
        if (missing.length) formatMissingRanges(missing, targetYear, regionLabel);
      });
    } else if (uniqueMonths.length) {
      const regionList = filterRegionLabel
        ? [filterRegionLabel]
        : filterCountry
          ? regionsForCountry
          : regionsPresent;
      regionList.forEach((regionLabel) => {
        const regionMonths = filteredRecords
          .filter((record) => getRegionLabel(record) === regionLabel)
          .map((record) => `${record.period_year}-${String(record.period_month).padStart(2, '0')}`)
          .sort();
        if (!regionMonths.length) return;
        const [startYear, startMonth] = regionMonths[0].split('-').map((val) => parseInt(val, 10));
        const [endYear, endMonth] = regionMonths[regionMonths.length - 1].split('-').map((val) => parseInt(val, 10));
        const missingByYear: Record<number, number[]> = {};
        let y = startYear;
        let m = startMonth;
        const seen = new Set(regionMonths);
        while (y < endYear || (y === endYear && m <= endMonth)) {
          const key = `${y}-${String(m).padStart(2, '0')}`;
          if (!seen.has(key)) {
            if (!missingByYear[y]) missingByYear[y] = [];
            missingByYear[y].push(m);
          }
          m += 1;
          if (m > 12) {
            m = 1;
            y += 1;
          }
        }
        Object.entries(missingByYear).forEach(([yearLabel, months]) => {
          if (months.length) formatMissingRanges(months, Number(yearLabel), regionLabel);
        });
      });
    }

    let total = 0;
    const regionTotals: Record<string, number> = {};
    filteredRecords.forEach((record) => {
      const val = Number(record.location_based_emissions || 0);
      total += val;
      const regionLabel = getRegionLabel(record);
      regionTotals[regionLabel] = (regionTotals[regionLabel] || 0) + val;
    });
    if (total > 0) {
      Object.entries(regionTotals).forEach(([region, value]) => {
        const share = value / total;
        if (share > 0.3) {
          reminderList.push({
            type: 'region',
            text: `${region} contributes ${(share * 100).toFixed(0)}% of your Scope 2 electricity emissions.`,
          });
        }
      });
    }

    return reminderList;
  }, [filteredRecords, filters, reportingPref]);

  const loadRecords = async () => {
    setStatus('Loading records...');
    const { data, error } = await supabase
      .from('scope2_records')
      .select(
        'id,period_year,period_month,kwh,location_based_emissions,market_based_emissions,emission_factor_value,emission_factor_year,emission_factor_source,calc_country,calc_region,market_instrument_type,covered_kwh'
      )
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false });
    if (error) {
      setStatus('Could not load records.');
      return;
    }
    setRecords((data || []) as Scope2Record[]);
    setStatus('');
  };

  useEffect(() => {
    const init = async () => {
      const session = await requireSession();
      if (!session) {
        setLoggedOut(true);
        setStatus('');
        return;
      }
      const company = await fetchCompany(session.user.id);
      setReportingPref(company?.reporting_year_preference || null);
      const siteData = await ensureCompanySites(session.user.id);
      setCompanyId(siteData.companyId);
      setSites(siteData.sites || []);
      await loadRecords();
    };
    init();
  }, []);

  useEffect(() => {
    if (!years.length) return;
    if (!filters.year) {
      if (reportingYear && years.includes(reportingYear)) {
        setRecordsFilters({ year: reportingYear });
        return;
      }
      const now = new Date().getFullYear();
      if (years.includes(String(now))) {
        setRecordsFilters({ year: String(now) });
      }
    }
  }, [years, filters.year, reportingYear, setRecordsFilters]);

  const openRecord = (record: Scope2Record) => {
    setSelected(record);
    setEditKwh(record.kwh ? String(record.kwh) : '');
    setEditCovered(record.covered_kwh != null ? String(record.covered_kwh) : '');
    setEditMarketType(record.market_instrument_type || '');
    setEditStatus('');
  };

  const closePanel = () => {
    setSelected(null);
    setEditStatus('');
  };

  const handleDelete = async () => {
    if (!selected) return;
    const confirmed = window.confirm('Are you sure you want to delete this record?');
    if (!confirmed) return;
    const { error } = await supabase.from('scope2_records').delete().eq('id', selected.id);
    if (error) {
      setEditStatus('Delete failed. Please try again.');
      return;
    }
    await loadRecords();
    closePanel();
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const kwhVal = parseFloat(editKwh || '0');
    const coveredVal = parseFloat(editCovered || '0');
    if (!kwhVal || kwhVal <= 0) {
      setEditStatus('Enter a valid kWh.');
      return;
    }
    const covered = !Number.isNaN(coveredVal) && coveredVal >= 0 ? coveredVal : 0;
    const factorVal = selected.emission_factor_value || 0;
    const locationTons = kwhVal * factorVal;
    const marketTons =
      covered > 0 ? Math.max(kwhVal - covered, 0) * factorVal : locationTons;
    setSaving(true);
    setEditStatus('Saving...');
    const { error } = await supabase
      .from('scope2_records')
      .update({
        kwh: kwhVal,
        location_based_emissions: locationTons,
        market_based_emissions: selected.market_based_emissions != null ? marketTons : null,
        market_instrument_type: editMarketType || null,
        covered_kwh: covered,
      })
      .eq('id', selected.id);
    setSaving(false);
    if (error) {
      setEditStatus('Save failed. Please try again.');
      return;
    }
    setEditStatus('Saved.');
    await loadRecords();
  };

  const ensureAddValid = (row: AddRow) => {
    const errors: string[] = [];
    const yearVal = parseInt(row.period_year || '', 10);
    const monthVal = parseInt(row.period_month || '', 10);
    const kwhVal = parseFloat(row.kwh || '0');
    const marketYearVal = parseInt(row.market_year || row.period_year || '', 10);
    const coveredVal = parseFloat(row.covered_kwh || '0');
    if (!yearVal) errors.push('Select a year.');
    if (!monthVal) errors.push('Select a month.');
    if (!row.country) errors.push('Select a country.');
    if (!row.region) errors.push('Select a region.');
    if (!Number.isFinite(kwhVal) || kwhVal <= 0) errors.push('Enter a valid kWh.');
    if (yearVal && monthVal) {
      if (yearVal > currentYear || (yearVal === currentYear && monthVal > new Date().getMonth() + 1)) {
        errors.push('Future months are not supported.');
      }
    }
    if (row.market_enabled) {
      if (!row.market_type || Number.isNaN(coveredVal) || coveredVal < 0) {
        errors.push('Market-based entries require instrument type and covered kWh.');
      }
      if (coveredVal > kwhVal) errors.push('Covered kWh cannot exceed total kWh.');
      if (marketYearVal > currentYear) errors.push('Market reporting year must be current or past.');
    }
    if (sites.length) {
      const matched = sites.find((site) => site.country === row.country && site.region === row.region);
      if (!matched) errors.push('Select a configured site from Settings.');
    }
    return { errors, yearVal, monthVal, kwhVal, coveredVal, marketYearVal };
  };

  const buildPayload = (row: AddRow) => {
    const { yearVal, monthVal, kwhVal, coveredVal } = ensureAddValid(row);
    const factorData = getEmissionFactor(row.country, row.region, yearVal);
    const factor = factorData.factor;
    const locationEmissions = kwhVal * factor;
    const coveredKwh = row.market_enabled ? Math.min(coveredVal, kwhVal) : 0;
    const marketEmissions = row.market_enabled ? Math.max(kwhVal - coveredKwh, 0) * factor : null;
    const matchedSite = sites.find((site) => site.country === row.country && site.region === row.region);
    return {
      site_id: matchedSite?.id || null,
      period_year: yearVal,
      period_month: monthVal,
      kwh: kwhVal,
      location_based_emissions: locationEmissions,
      market_based_emissions: row.market_enabled ? marketEmissions : null,
      market_instrument_type: row.market_enabled ? row.market_type || null : null,
      covered_kwh: row.market_enabled ? coveredKwh : null,
      emission_factor_value: factor,
      emission_factor_year: factorData.year,
      emission_factor_source: factorData.source,
      calc_country: row.country,
      calc_region: row.region,
    };
  };

  const handleAddRecord = async () => {
    setAddStatus('');
    if (!companyId) {
      setAddStatus('Set up your company in Settings before adding records.');
      return;
    }
    const { errors } = ensureAddValid(singleAdd);
    if (errors.length) {
      setAddStatus(errors.join(' '));
      return;
    }
    setAddSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      setAddStatus('Log in to add records.');
      setAddSaving(false);
      return;
    }
    const payload = {
      user_id: sessionData.session.user.id,
      company_id: companyId,
      ...buildPayload(singleAdd),
    };
    const { data: existing } = await supabase
      .from('scope2_records')
      .select('id')
      .eq('company_id', companyId)
      .eq('period_year', payload.period_year)
      .eq('period_month', payload.period_month)
      .eq('calc_country', payload.calc_country)
      .eq('calc_region', payload.calc_region)
      .limit(1);
    if (existing && existing.length) {
      const confirmReplace = window.confirm('A record for this period already exists. Replace it?');
      if (!confirmReplace) {
        setAddSaving(false);
        return;
      }
    }
    const { error } = await supabase
      .from('scope2_records')
      .upsert([payload], { onConflict: 'user_id,company_id,period_year,period_month,calc_country,calc_region' });
    if (error) {
      setAddStatus('Save failed. Please try again.');
      setAddSaving(false);
      return;
    }
    setAddStatus('Record saved.');
    setAddSaving(false);
    await loadRecords();
  };

  const handleBulkAdd = async () => {
    setBulkStatus('');
    if (!companyId) {
      setBulkStatus('Set up your company in Settings before adding records.');
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      setBulkStatus('Log in to add records.');
      return;
    }
    const payloads = [];
    for (const row of bulkRows) {
      const { errors } = ensureAddValid(row);
      if (errors.length) {
        setBulkStatus(`Row ${row.id}: ${errors.join(' ')}`);
        return;
      }
      payloads.push({
        user_id: sessionData.session.user.id,
        company_id: companyId,
        ...buildPayload(row),
      });
    }
    if (!payloads.length) {
      setBulkStatus('Add at least one complete row.');
      return;
    }
    setBulkSaving(true);
    const { error } = await supabase
      .from('scope2_records')
      .upsert(payloads, { onConflict: 'user_id,company_id,period_year,period_month,calc_country,calc_region' });
    if (error) {
      setBulkStatus('Bulk save failed. Please try again.');
      setBulkSaving(false);
      return;
    }
    setBulkStatus('Records saved.');
    setBulkSaving(false);
    await loadRecords();
  };

  const updateBulkRow = (id: string, field: keyof AddRow, value: string | boolean) => {
    setBulkRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const addBulkRow = () => {
    setBulkRows((prev) => [
      ...prev,
      {
        id: `row-${prev.length + 1}`,
        period_year: '',
        period_month: '',
        country: '',
        region: '',
        kwh: '',
        market_enabled: false,
        market_type: '',
        covered_kwh: '',
        market_year: '',
      },
    ]);
  };

  const removeBulkRow = (id: string) => {
    setBulkRows((prev) => prev.filter((row) => row.id !== id));
  };

  const exportFiltered = () => {
    if (!filteredRecords.length) {
      setStatus('No Scope 2 records match these filters.');
      return;
    }
    const headers = [
      'period',
      'country',
      'kwh',
      'scope2_location_based_tco2e',
      'scope2_market_based_tco2e',
      'emission_factor_value',
      'emission_factor_year',
      'emission_factor_source',
    ];
    const rows = filteredRecords.map((record) => {
      const period = `${record.period_year}-${String(record.period_month).padStart(2, '0')}`;
      return [
        period,
        getRegionLabel(record),
        record.kwh ?? '',
        record.location_based_emissions ?? '',
        record.market_based_emissions ?? '',
        record.emission_factor_value ?? '',
        record.emission_factor_year ?? '',
        record.emission_factor_source ?? '',
      ];
    });
    rows.push(['Disclosure', 'Location-based Scope 2 electricity calculation aligned with the GHG Protocol.']);
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'carbonwise_scope2_filtered.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loggedOut) {
    return (
      <div className="page-card">
        <h1 className="page-title">Scope 2 Records</h1>
        <p className="muted">Log in to view saved records. Calculations work without an account.</p>
      </div>
    );
  }

  return (
    <div>
      <section className="page-card">
        <h1 className="page-title">Scope 2 Records</h1>
        <h2 className="section-title">Scope 2 Carbon Snapshot</h2>
        <p className="muted">Track Scope 2 electricity entries and export filtered results.</p>
        <div className="records-filters">
          <div>
            <label htmlFor="filterYear">Reporting year</label>
            <select
              id="filterYear"
              value={filters.year}
              onChange={(event) => {
                const value = event.target.value;
                setRecordsFilters({ year: value });
                setReportingYear(value);
              }}
            >
              <option value="">All</option>
              {years.map((yearOption) => (
                <option key={yearOption} value={yearOption}>
                  {yearOption}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filterCountry">Country</label>
            <select
              id="filterCountry"
              value={filters.country}
              onChange={(event) =>
                setRecordsFilters({ country: event.target.value, region: '' })
              }
            >
              <option value="">All</option>
              {countries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filterRegion">Region</label>
            <select
              id="filterRegion"
              value={filters.region}
              onChange={(event) => setRecordsFilters({ region: event.target.value })}
            >
              <option value="">All</option>
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filterMethod">Method</label>
            <select
              id="filterMethod"
              value={validMethod}
              onChange={(event) => setRecordsFilters({ method: event.target.value })}
            >
              <option value="">All</option>
              <option value="location">Location-based</option>
              <option value="market">Market-based</option>
            </select>
          </div>
          <button type="button" className="btn secondary" onClick={exportFiltered}>
            Export filtered CSV
          </button>
        </div>
        <div className="status">{status}</div>
        {summary ? (
          <div className="summary-grid">
            <div className="summary-card">
              <div className="label">Total emissions</div>
              <div className="value">{summary.total} <span className="unit">tCO2e</span></div>
            </div>
            <div className="summary-card">
              <div className="label">Avg / month</div>
              <div className="value">{summary.avg} <span className="unit">tCO2e</span></div>
            </div>
            <div className="summary-card">
              <div className="label">Top region</div>
              <div className="value">{summary.topRegion}</div>
            </div>
            <div className="summary-card">
              <div className="label">Coverage (months)</div>
              <div className="value">{summary.count}</div>
            </div>
            <div className="summary-card">
              <div className="label">Real-world comparison</div>
              <div className="value">{summary.compare}</div>
            </div>
          </div>
        ) : (
          <p className="muted">No records available for this view.</p>
        )}
        <h2 className="section-title">Insights & reminders</h2>
        <ul className="reminder-list">
          {reminders.length ? (
            reminders.map((reminder, index) => (
              <li key={`${reminder.type}-${index}`}>{reminder.text}</li>
            ))
          ) : (
            <li className="placeholder">All looks good. No reminders right now.</li>
          )}
        </ul>
      </section>

      <section className="page-card stack">
        <h2 className="section-title">Add a record</h2>
        <div className="two-col">
          <div>
            <label htmlFor="add-year">Billing year</label>
            <select
              id="add-year"
              value={singleAdd.period_year}
              onChange={(event) => setSingleAdd((prev) => ({ ...prev, period_year: event.target.value }))}
            >
              <option value="">Select year</option>
              {yearOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="add-month">Billing month</label>
            <select
              id="add-month"
              value={singleAdd.period_month}
              onChange={(event) => setSingleAdd((prev) => ({ ...prev, period_month: event.target.value }))}
            >
              <option value="">Select month</option>
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="two-col">
          <div>
            <label htmlFor="add-country">Country</label>
            <select
              id="add-country"
              value={singleAdd.country}
              onChange={(event) =>
                setSingleAdd((prev) => ({ ...prev, country: event.target.value, region: '' }))
              }
            >
              <option value="">Select country</option>
              {siteCountries.map((countryOption) => (
                <option key={countryOption} value={countryOption}>{countryOption}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="add-region">Region</label>
            <select
              id="add-region"
              value={singleAdd.region}
              onChange={(event) => setSingleAdd((prev) => ({ ...prev, region: event.target.value }))}
            >
              <option value="">Select region</option>
              {(siteRegionsByCountry.get(singleAdd.country) || []).map((regionOption) => (
                <option key={regionOption} value={regionOption}>{regionOption}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="add-kwh">Electricity used (kWh)</label>
          <input
            id="add-kwh"
            type="number"
            min="1"
            step="any"
            value={singleAdd.kwh}
            onChange={(event) => setSingleAdd((prev) => ({ ...prev, kwh: event.target.value }))}
          />
        </div>
        <div className="notice">
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={singleAdd.market_enabled}
              onChange={(event) =>
                setSingleAdd((prev) => ({ ...prev, market_enabled: event.target.checked }))
              }
            />
            Include market-based Scope 2 (RECs/PPAs)
          </label>
          {singleAdd.market_enabled ? (
            <div className="two-col" style={{ marginTop: '10px' }}>
              <div>
                <label htmlFor="add-market-type">Instrument type</label>
                <select
                  id="add-market-type"
                  value={singleAdd.market_type}
                  onChange={(event) => setSingleAdd((prev) => ({ ...prev, market_type: event.target.value }))}
                >
                  <option value="">Select instrument</option>
                  <option value="REC">REC</option>
                  <option value="PPA">PPA</option>
                  <option value="Green tariff">Green tariff</option>
                </select>
              </div>
              <div>
                <label htmlFor="add-covered">Covered kWh</label>
                <input
                  id="add-covered"
                  type="number"
                  min="0"
                  step="any"
                  value={singleAdd.covered_kwh}
                  onChange={(event) => setSingleAdd((prev) => ({ ...prev, covered_kwh: event.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="add-market-year">Reporting year</label>
                <select
                  id="add-market-year"
                  value={singleAdd.market_year}
                  onChange={(event) => setSingleAdd((prev) => ({ ...prev, market_year: event.target.value }))}
                >
                  <option value="">Select year</option>
                  {yearOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </div>
        <div className="actions">
          <button type="button" className="btn primary" onClick={handleAddRecord} disabled={addSaving}>
            {addSaving ? 'Saving...' : 'Save record'}
          </button>
          <div className="status">{addStatus}</div>
        </div>
      </section>

      <section className="page-card stack">
        <h2 className="section-title">Bulk add</h2>
        <div className="bulk-grid">
          {bulkRows.map((row) => (
            <div className="bulk-row" key={row.id}>
              <div className="bulk-header">
                <strong>{row.id}</strong>
                {bulkRows.length > 1 ? (
                  <button type="button" className="btn secondary" onClick={() => removeBulkRow(row.id)}>
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="bulk-fields">
                <div>
                  <label>Year</label>
                  <select value={row.period_year} onChange={(event) => updateBulkRow(row.id, 'period_year', event.target.value)}>
                    <option value="">Select year</option>
                    {yearOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Month</label>
                  <select value={row.period_month} onChange={(event) => updateBulkRow(row.id, 'period_month', event.target.value)}>
                    <option value="">Select month</option>
                    {MONTH_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Country</label>
                  <select
                    value={row.country}
                    onChange={(event) => updateBulkRow(row.id, 'country', event.target.value)}
                  >
                    <option value="">Select country</option>
                    {siteCountries.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Region</label>
                  <select
                    value={row.region}
                    onChange={(event) => updateBulkRow(row.id, 'region', event.target.value)}
                  >
                    <option value="">Select region</option>
                    {(siteRegionsByCountry.get(row.country) || []).map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>kWh</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={row.kwh}
                    onChange={(event) => updateBulkRow(row.id, 'kwh', event.target.value)}
                  />
                </div>
                <div>
                  <label>Market-based</label>
                  <select
                    value={row.market_enabled ? 'yes' : 'no'}
                    onChange={(event) => updateBulkRow(row.id, 'market_enabled', event.target.value === 'yes')}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
                {row.market_enabled ? (
                  <>
                    <div>
                      <label>Instrument</label>
                      <select
                        value={row.market_type}
                        onChange={(event) => updateBulkRow(row.id, 'market_type', event.target.value)}
                      >
                        <option value="">Select instrument</option>
                        <option value="REC">REC</option>
                        <option value="PPA">PPA</option>
                        <option value="Green tariff">Green tariff</option>
                      </select>
                    </div>
                    <div>
                      <label>Covered kWh</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={row.covered_kwh}
                        onChange={(event) => updateBulkRow(row.id, 'covered_kwh', event.target.value)}
                      />
                    </div>
                    <div>
                      <label>Reporting year</label>
                      <select
                        value={row.market_year}
                        onChange={(event) => updateBulkRow(row.id, 'market_year', event.target.value)}
                      >
                        <option value="">Select year</option>
                        {yearOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <div className="actions">
          <button type="button" className="btn secondary" onClick={addBulkRow}>
            Add row
          </button>
          <button type="button" className="btn primary" onClick={handleBulkAdd} disabled={bulkSaving}>
            {bulkSaving ? 'Saving...' : 'Save all'}
          </button>
          <div className="status">{bulkStatus}</div>
        </div>
      </section>

      <section className="page-card">
        <table className="table">
          <thead>
            <tr>
              <th>Record</th>
              <th>Method</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length ? (
              filteredRecords.map((record) => (
                <tr key={record.id}>
                  <td>
                    <div className="primary">{formatNumber(Number(record.location_based_emissions || 0))} tCO2e</div>
                    <div className="secondary">
                      {MONTH_NAMES[(record.period_month || 1) - 1]} {record.period_year || ''} · {getRegionLabel(record)}
                    </div>
                  </td>
                  <td>{detectMethod(record) === 'market' ? 'Market-based Scope 2 electricity' : 'Location-based Scope 2 electricity'}</td>
                  <td>
                    <button type="button" className="btn secondary" onClick={() => openRecord(record)}>
                      View
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="muted">
                  No Scope 2 electricity records match these filters. Add a record to include it in calculations and exports.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {selected ? (
        <section className="page-card">
          <div className="panel-header">
            <div>
              <div className="panel-title">Record details</div>
              <div className="muted">
                {selected.period_year}-{String(selected.period_month).padStart(2, '0')}
              </div>
            </div>
            <button type="button" className="btn secondary" onClick={closePanel}>Close</button>
          </div>
          <div className="panel-grid">
            <div>
              <div className="label">Country / region</div>
              <div>{getRegionLabel(selected)}</div>
            </div>
            <div>
              <div className="label">Electricity (kWh)</div>
              <div>{selected.kwh ?? '—'}</div>
            </div>
            <div>
              <div className="label">Location-based Scope 2</div>
              <div>{formatNumber(Number(selected.location_based_emissions || 0))} tCO2e</div>
            </div>
            <div>
              <div className="label">Market-based Scope 2</div>
              <div>
                {selected.market_based_emissions != null
                  ? `${formatNumber(Number(selected.market_based_emissions || 0))} tCO2e`
                  : '—'}
              </div>
            </div>
            <div>
              <div className="label">Emission factor</div>
              <div>{selected.emission_factor_source} {selected.emission_factor_year}</div>
            </div>
          </div>

          <form className="panel-form" onSubmit={handleSave}>
            <h3 className="section-title">Edit record</h3>
            <div className="panel-grid">
              <div>
                <label htmlFor="editKwh">kWh</label>
                <input
                  id="editKwh"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editKwh}
                  onChange={(event) => setEditKwh(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="editCovered">Covered kWh</label>
                <input
                  id="editCovered"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editCovered}
                  onChange={(event) => setEditCovered(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="editMarketType">Market instrument</label>
                <input
                  id="editMarketType"
                  type="text"
                  value={editMarketType}
                  onChange={(event) => setEditMarketType(event.target.value)}
                />
              </div>
            </div>
            <div className="actions">
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </button>
              <button type="button" className="btn secondary" onClick={handleDelete}>
                Delete record
              </button>
            </div>
            <div className="status">{editStatus}</div>
          </form>
        </section>
      ) : null}
    </div>
  );
};

export default Records;

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ensureCompanySites } from '../lib/sites';
import { fetchCompany, fetchEntitlements, requireSession, supabase } from '../lib/supabase';
import { SCOPE1_NATURAL_GAS_DEFAULT, SCOPE1_NATURAL_GAS_FACTORS } from '../data/emission-factors';
import { SCOPE3_CATEGORY_LIST, SCOPE3_DISCLOSURE, SCOPE3_FACTOR_SETS } from '../data/scope3-eio';
import { useCarbonStore, type ScopeFilters } from '../stores/useCarbonStore';

type Scope1Row = {
  id: string;
  period_year: number | null;
  period_month: number | null;
  country: string | null;
  region: string | null;
  quantity: number | null;
  unit: string | null;
  emissions: number | null;
  factor_value: number | null;
  factor_year: number | null;
  factor_source: string | null;
  factor_basis: string | null;
  factor_label: string | null;
  notes: string | null;
  site_id: string | null;
};

type Scope3Row = {
  id: string;
  period_year: number | null;
  period_month: number | null;
  spend_country: string | null;
  spend_region: string | null;
  spend_amount: number | null;
  currency: string | null;
  category_id: string | null;
  category_label: string | null;
  vendor_name: string | null;
  notes: string | null;
  eio_sector: string | null;
  emission_factor_value: number | null;
  emission_factor_year: number | null;
  emission_factor_source: string | null;
  emission_factor_model: string | null;
  emission_factor_geo: string | null;
  emission_factor_currency: string | null;
  emissions_source: string | null;
  calculation_method: string | null;
  emissions: number | null;
};

type Reminder = {
  type: 'missing' | 'share';
  text: string;
};

type Scope1AddRow = {
  id: string;
  period_year: string;
  period_month: string;
  country: string;
  region: string;
  quantity: string;
  unit: string;
  notes: string;
};

type Scope3AddRow = {
  id: string;
  period_year: string;
  period_month: string;
  method: 'spend' | 'actuals';
  spend_country: string;
  spend_region: string;
  category_id: string;
  category_label: string;
  spend_amount: string;
  currency: string;
  vendor_name: string;
  emissions: string;
  emissions_source: string;
  notes: string;
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
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

const COUNTRY_OPTIONS = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'AU', label: 'Australia' },
  { value: 'SG', label: 'Singapore' },
  { value: 'NZ', label: 'New Zealand' },
];

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

const SCOPE1_DISCLOSURE =
  'Scope 1 emissions are estimates based on user-provided fuel data. Results may be partial and do not represent full Scope 1 coverage.';

const UNIT_LABELS: Record<string, string> = {
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

const getScope1Factor = (country: string, region: string, unit: string) => {
  const countryData = SCOPE1_NATURAL_GAS_FACTORS[country];
  const regionKey = normalizeKey(region);
  const regional = (countryData as any)?.regions?.[regionKey]?.[unit] || null;
  if (regional) return { ...regional, label: 'Region-specific' };
  const defaultData = countryData?.default?.[unit] || null;
  if (defaultData) return { ...defaultData, label: 'Default' };
  const fallback = SCOPE1_NATURAL_GAS_DEFAULT?.[unit] || null;
  if (fallback) return { ...fallback, label: 'Default' };
  return null;
};

const ScopeView = () => {
  const { scopeId } = useParams();
  const isScope1 = scopeId === 'scope1';
  const isScope3 = scopeId === 'scope3';

  const [scope1Records, setScope1Records] = useState<Scope1Row[]>([]);
  const [scope3Records, setScope3Records] = useState<Scope3Row[]>([]);
  const { scopeFilters, setScopeFilters } = useCarbonStore();
  const filters: ScopeFilters = scopeFilters;
  const country = filters.country;
  const [status, setStatus] = useState('Checking access...');
  const [scope3Locked, setScope3Locked] = useState(false);
  const [selectedScope1, setSelectedScope1] = useState<Scope1Row | null>(null);
  const [selectedScope3, setSelectedScope3] = useState<Scope3Row | null>(null);
  const [reportingPref, setReportingPref] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [sites, setSites] = useState<Array<{ id: string; country: string | null; region: string | null }>>([]);
  const [companyCountry, setCompanyCountry] = useState<string>('');

  const [scope1Add, setScope1Add] = useState<Scope1AddRow>({
    id: 'scope1-single',
    period_year: '',
    period_month: '',
    country: '',
    region: '',
    quantity: '',
    unit: '',
    notes: '',
  });
  const [scope1BulkRows, setScope1BulkRows] = useState<Scope1AddRow[]>([
    {
      id: 'scope1-row-1',
      period_year: '',
      period_month: '',
      country: '',
      region: '',
      quantity: '',
      unit: '',
      notes: '',
    },
  ]);
  const [scope1AddStatus, setScope1AddStatus] = useState('');
  const [scope1BulkStatus, setScope1BulkStatus] = useState('');
  const [scope1Saving, setScope1Saving] = useState(false);
  const [scope1BulkSaving, setScope1BulkSaving] = useState(false);

  const [scope3Add, setScope3Add] = useState<Scope3AddRow>({
    id: 'scope3-single',
    period_year: '',
    period_month: '',
    method: 'spend',
    spend_country: '',
    spend_region: '',
    category_id: '',
    category_label: '',
    spend_amount: '',
    currency: '',
    vendor_name: '',
    emissions: '',
    emissions_source: '',
    notes: '',
  });
  const [scope3BulkRows, setScope3BulkRows] = useState<Scope3AddRow[]>([
    {
      id: 'scope3-row-1',
      period_year: '',
      period_month: '',
      method: 'spend',
      spend_country: '',
      spend_region: '',
      category_id: '',
      category_label: '',
      spend_amount: '',
      currency: '',
      vendor_name: '',
      emissions: '',
      emissions_source: '',
      notes: '',
    },
  ]);
  const [scope3AddStatus, setScope3AddStatus] = useState('');
  const [scope3BulkStatus, setScope3BulkStatus] = useState('');
  const [scope3Saving, setScope3Saving] = useState(false);
  const [scope3BulkSaving, setScope3BulkSaving] = useState(false);
  const [scope1Edit, setScope1Edit] = useState({ quantity: '', notes: '' });
  const [scope1EditStatus, setScope1EditStatus] = useState('');
  const [scope1Editing, setScope1Editing] = useState(false);
  const [scope3Edit, setScope3Edit] = useState({
    period_year: '',
    period_month: '',
    spend_amount: '',
    emissions: '',
    emissions_source: '',
    vendor_name: '',
    notes: '',
  });
  const [scope3EditStatus, setScope3EditStatus] = useState('');
  const [scope3Editing, setScope3Editing] = useState(false);

  const scopeLabel = isScope1 ? 'Scope 1' : 'Scope 3';

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const options: string[] = [];
    for (let y = currentYear; y >= 2024; y -= 1) options.push(String(y));
    return options;
  }, [currentYear]);

  const siteCountries = useMemo(() => {
    const set = new Set<string>();
    sites.forEach((site) => {
      if (site.country) set.add(site.country);
    });
    return Array.from(set).sort();
  }, [sites]);

  const regionsByCountry = useMemo(() => {
    const map = new Map<string, string[]>();
    sites.forEach((site) => {
      if (!site.country || !site.region) return;
      if (!map.has(site.country)) map.set(site.country, []);
      map.get(site.country)?.push(site.region);
    });
    map.forEach((value, key) => map.set(key, Array.from(new Set(value)).sort()));
    return map;
  }, [sites]);

  const defaultCountryOptions = useMemo(() => COUNTRY_OPTIONS.map((option) => option.value), []);

  const regionOptions = useMemo(() => {
    if (sites.length) {
      return regionsByCountry.get(filters.country) || [];
    }
    return REGION_OPTIONS[filters.country] || [];
  }, [filters.country, sites, regionsByCountry]);

  const scope1AddRegionOptions = useMemo(() => {
    if (sites.length) {
      return regionsByCountry.get(scope1Add.country) || [];
    }
    return REGION_OPTIONS[scope1Add.country] || [];
  }, [scope1Add.country, sites, regionsByCountry]);

  const filteredScope1 = useMemo(() => {
    return scope1Records.filter((row) => {
      if (filters.year && String(row.period_year || '') !== filters.year) return false;
      if (filters.country && (row.country || '') !== filters.country) return false;
      if (filters.region && (row.region || '') !== filters.region) return false;
      return true;
    });
  }, [scope1Records, filters]);

  const validScope3Method = filters.method === 'spend' || filters.method === 'actuals' ? filters.method : '';

  const filteredScope3 = useMemo(() => {
    return scope3Records.filter((row) => {
      if (filters.year && String(row.period_year || '') !== filters.year) return false;
      if (filters.category && (row.category_label || '') !== filters.category) return false;
      if (validScope3Method) {
        const entryMethod = row.calculation_method === 'actual' ? 'actuals' : 'spend';
        if (entryMethod !== validScope3Method) return false;
      }
      if (filters.country && (row.spend_country || '') !== filters.country) return false;
      if (filters.region && (row.spend_region || '') !== filters.region) return false;
      return true;
    });
  }, [scope3Records, filters, validScope3Method]);

  const yearFilterOptions = useMemo(() => {
    const years = new Set<number>();
    if (isScope1) scope1Records.forEach((row) => row.period_year && years.add(row.period_year));
    if (isScope3) scope3Records.forEach((row) => row.period_year && years.add(row.period_year));
    return Array.from(years).sort((a, b) => b - a).map(String);
  }, [scope1Records, scope3Records, isScope1, isScope3]);

  const categoryOptions = useMemo(() => {
    if (!isScope3) return [];
    const categories = new Set<string>();
    scope3Records.forEach((row) => categories.add(row.category_label || '—'));
    return Array.from(categories).sort();
  }, [scope3Records, isScope3]);

  const scope3FactorSet = useMemo(() => {
    if (scope3Add.spend_country && SCOPE3_FACTOR_SETS[scope3Add.spend_country]) {
      return SCOPE3_FACTOR_SETS[scope3Add.spend_country];
    }
    if (companyCountry && SCOPE3_FACTOR_SETS[companyCountry]) return SCOPE3_FACTOR_SETS[companyCountry];
    return SCOPE3_FACTOR_SETS.US;
  }, [scope3Add.spend_country, companyCountry]);

  const summary = useMemo(() => {
    if (isScope1) {
      if (!filteredScope1.length) return null;
      let total = 0;
      const regionTotals: Record<string, number> = {};
      const months = new Set<string>();
      filteredScope1.forEach((row) => {
        const value = Number(row.emissions || 0);
        total += value;
        const label = `${row.country || '—'}${row.region ? ` / ${row.region}` : ''}`;
        regionTotals[label] = (regionTotals[label] || 0) + value;
        const monthKey = `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
        months.add(monthKey);
      });
      const topEntry = Object.entries(regionTotals).sort((a, b) => b[1] - a[1])[0];
      return {
        total,
        avg: months.size ? total / months.size : total,
        top: topEntry ? topEntry[0] : '—',
        count: months.size,
      };
    }
    if (!filteredScope3.length) return null;
    let total = 0;
    let actualsTotal = 0;
    let spendTotal = 0;
    const categoryTotals: Record<string, number> = {};
    const months = new Set<string>();
    filteredScope3.forEach((row) => {
      const value = Number(row.emissions || 0);
      total += value;
      if ((row.calculation_method || 'eio') === 'actual') actualsTotal += value;
      else spendTotal += value;
      const label = row.category_label || '—';
      categoryTotals[label] = (categoryTotals[label] || 0) + value;
      const monthKey = `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
      months.add(monthKey);
    });
    const topEntry = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
    return {
      total,
      avg: months.size ? total / months.size : total,
      top: topEntry ? topEntry[0] : '—',
      count: months.size,
      actualsTotal,
      spendTotal,
    };
  }, [filteredScope1, filteredScope3, isScope1, isScope3]);

  const reminders = useMemo(() => {
    const list: Reminder[] = [];
    if (isScope1 && filteredScope1.length) {
      const now = new Date();
      const current = now.getFullYear();
      const targetYear = filters.year
        ? parseInt(filters.year, 10)
        : reportingPref === 'current'
          ? current
          : reportingPref === 'previous'
            ? current - 1
            : null;
      if (targetYear) {
        const regionList = Array.from(
          new Set(filteredScope1.map((row) => `${row.country || '—'}${row.region ? ` / ${row.region}` : ''}`))
        );
        regionList.forEach((label) => {
          let maxSeenMonth = 0;
          const seen = new Set(
            filteredScope1
              .filter((row) => `${row.country || '—'}${row.region ? ` / ${row.region}` : ''}` === label)
              .filter((row) => String(row.period_year) === String(targetYear))
              .map((row) => {
                const monthVal = Number(row.period_month || 0);
                if (monthVal > maxSeenMonth) maxSeenMonth = monthVal;
                return `${row.period_year}-${String(monthVal).padStart(2, '0')}`;
              })
          );
          const maxMonth = targetYear === current ? Math.max(now.getMonth() + 1, maxSeenMonth) : 12;
          const missing: number[] = [];
          for (let monthVal = 1; monthVal <= maxMonth; monthVal += 1) {
            const key = `${targetYear}-${String(monthVal).padStart(2, '0')}`;
            if (!seen.has(key)) missing.push(monthVal);
          }
          if (missing.length) {
            missing.forEach((monthVal) => {
              list.push({ type: 'missing', text: `Missing ${MONTH_NAMES[monthVal - 1]} ${targetYear} (${label}).` });
            });
          }
        });
      }
    }
    if (isScope3 && filteredScope3.length) {
      let total = 0;
      const categoryTotals: Record<string, number> = {};
      filteredScope3.forEach((row) => {
        const value = Number(row.emissions || 0);
        total += value;
        const label = row.category_label || '—';
        categoryTotals[label] = (categoryTotals[label] || 0) + value;
      });
      if (total > 0) {
        Object.entries(categoryTotals).forEach(([label, value]) => {
          const share = value / total;
          if (share > 0.3) {
            list.push({
              type: 'share',
              text: `${label} contributes ${(share * 100).toFixed(0)}% of Scope 3 emissions.`,
            });
          }
        });
      }
    }
    return list;
  }, [filteredScope1, filteredScope3, isScope1, isScope3, reportingPref, filters.year]);

  const loadScope1 = async () => {
    const { data, error } = await supabase
      .from('scope1_records')
      .select('id,period_year,period_month,country,region,quantity,unit,notes,emissions,factor_value,factor_year,factor_source,factor_basis,factor_label,site_id')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false });
    if (error) throw error;
    setScope1Records((data || []) as Scope1Row[]);
  };

  const loadScope3 = async () => {
    const { data, error } = await supabase
      .from('scope3_records')
      .select(
        'id,period_year,period_month,spend_country,spend_region,spend_amount,currency,category_id,category_label,vendor_name,notes,eio_sector,emission_factor_value,emission_factor_year,emission_factor_source,emission_factor_model,emission_factor_geo,emission_factor_currency,emissions_source,calculation_method,emissions'
      )
      .order('period_year', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    setScope3Records((data || []) as Scope3Row[]);
  };

  useEffect(() => {
    const init = async () => {
      setStatus('Checking access...');
      const session = await requireSession();
      if (!session) return;
      const company = await fetchCompany(session.user.id);
      setReportingPref(company?.reporting_year_preference || null);
      setCompanyCountry(company?.country || '');
      if (company?.id) {
        setCompanyId(company.id);
        const entitlements = await fetchEntitlements(company.id);
        setScope3Locked(!entitlements?.allow_scope3);
      }
      const siteData = await ensureCompanySites(session.user.id);
      setCompanyId(siteData.companyId);
      setSites(siteData.sites || []);
      if (isScope1) await loadScope1();
      if (isScope3) await loadScope3();
      setStatus('');
    };
    init().catch((error) => setStatus(`Unable to load records: ${String(error)}`));
  }, [isScope1, isScope3]);

  useEffect(() => {
    if (yearFilterOptions.length && !filters.year) {
      const now = new Date().getFullYear();
      if (yearFilterOptions.includes(String(now))) {
        setScopeFilters({ year: String(now) });
      }
    }
  }, [yearFilterOptions, filters.year, setScopeFilters]);

  useEffect(() => {
    if (!selectedScope1) {
      setScope1Edit({ quantity: '', notes: '' });
      setScope1EditStatus('');
      return;
    }
    setScope1Edit({
      quantity: selectedScope1.quantity != null ? String(selectedScope1.quantity) : '',
      notes: selectedScope1.notes || '',
    });
    setScope1EditStatus('');
  }, [selectedScope1]);

  useEffect(() => {
    if (!selectedScope3) {
      setScope3Edit({
        period_year: '',
        period_month: '',
        spend_amount: '',
        emissions: '',
        emissions_source: '',
        vendor_name: '',
        notes: '',
      });
      setScope3EditStatus('');
      return;
    }
    setScope3Edit({
      period_year: selectedScope3.period_year ? String(selectedScope3.period_year) : '',
      period_month: selectedScope3.period_month ? String(selectedScope3.period_month) : '',
      spend_amount: selectedScope3.spend_amount != null ? String(selectedScope3.spend_amount) : '',
      emissions: selectedScope3.emissions != null ? String(selectedScope3.emissions) : '',
      emissions_source: selectedScope3.emissions_source || '',
      vendor_name: selectedScope3.vendor_name || '',
      notes: selectedScope3.notes || '',
    });
    setScope3EditStatus('');
  }, [selectedScope3]);

  const exportScope1 = () => {
    if (!filteredScope1.length) {
      setStatus('No records match these filters.');
      return;
    }
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
    const data = filteredScope1.map((row) => {
      const period = `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
      return [
        'Scope 1',
        'Stationary combustion',
        'Natural gas',
        period,
        row.quantity ?? '',
        UNIT_LABELS[row.unit || ''] || row.unit || '',
        row.emissions ?? '',
        row.factor_value ?? '',
        row.factor_year ?? '',
        row.factor_source ?? '',
        SCOPE1_DISCLOSURE,
      ];
    });
    const csv = [headers, ...data].map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const namePart = filters.year ? `${filters.year}` : 'filtered';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `carbonwise_scope1_${namePart}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatus('Exported with current filters.');
  };

  const exportScope3 = () => {
    if (scope3Locked) {
      setStatus('Upgrade to CarbonWise Complete to export Scope 3 data.');
      return;
    }
    if (!filteredScope3.length) {
      setStatus('No records match these filters.');
      return;
    }
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
    const data = filteredScope3.map((row) => [
      'Scope 3',
      row.calculation_method === 'actual' ? 'Actuals' : 'Spend-based',
      row.period_month
        ? `${row.period_year}-${String(row.period_month).padStart(2, '0')}`
        : `${row.period_year || ''}`,
      row.category_label || '',
      row.spend_amount ?? '',
      row.currency || '',
      row.eio_sector || '',
      row.emission_factor_value ?? '',
      row.emission_factor_year ?? '',
      row.emission_factor_source ?? '',
      row.emissions_source ?? '',
      row.emissions ?? '',
      SCOPE3_DISCLOSURE,
    ]);
    const csv = [headers, ...data].map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const namePart = filters.year ? `${filters.year}` : 'filtered';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `carbonwise_scope3_${namePart}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatus('Exported with current filters.');
  };

  const removeScope1 = async (record: Scope1Row) => {
    const confirmed = window.confirm('Are you sure you want to delete this record?');
    if (!confirmed) return;
    const { error } = await supabase.from('scope1_records').delete().eq('id', record.id);
    if (error) {
      setStatus('Delete failed. Please try again.');
      return;
    }
    await loadScope1();
    setSelectedScope1(null);
  };

  const removeScope3 = async (record: Scope3Row) => {
    if (scope3Locked) return;
    const confirmed = window.confirm('Are you sure you want to delete this record?');
    if (!confirmed) return;
    const { error } = await supabase.from('scope3_records').delete().eq('id', record.id);
    if (error) {
      setStatus('Delete failed. Please try again.');
      return;
    }
    await loadScope3();
    setSelectedScope3(null);
  };

  const validateScope1Row = (row: Scope1AddRow) => {
    const errors: string[] = [];
    const yearVal = parseInt(row.period_year || '', 10);
    const monthVal = parseInt(row.period_month || '', 10);
    const quantityVal = Number(row.quantity || '');
    if (!yearVal) errors.push('Select a year.');
    if (!monthVal) errors.push('Select a month.');
    if (!row.country) errors.push('Select a country.');
    if (!row.region) errors.push('Select a region.');
    if (!row.unit) errors.push('Select a unit.');
    if (!Number.isFinite(quantityVal) || quantityVal < 0) errors.push('Enter a non-negative quantity.');
    if (yearVal && monthVal) {
      const isFuture = yearVal > currentYear || (yearVal === currentYear && monthVal > new Date().getMonth() + 1);
      if (isFuture) errors.push('Scope 1 entries must be for past or current months.');
    }
    if (sites.length) {
      const matched = sites.find((site) => site.country === row.country && site.region === row.region);
      if (!matched) errors.push('Select a configured site from Settings.');
    }
    return { errors, yearVal, monthVal, quantityVal };
  };

  const buildScope1Payload = (row: Scope1AddRow) => {
    const { yearVal, monthVal, quantityVal } = validateScope1Row(row);
    const factorData = getScope1Factor(row.country, row.region, row.unit);
    if (!factorData) {
      throw new Error('No emission factor is available for this selection.');
    }
    const emissions = quantityVal * factorData.factor;
    const matchedSite = sites.find((site) => site.country === row.country && site.region === row.region);
    return {
      site_id: matchedSite?.id || null,
      period_year: yearVal,
      period_month: monthVal,
      country: row.country,
      region: row.region,
      quantity: quantityVal,
      unit: row.unit,
      notes: row.notes || null,
      emissions,
      factor_value: factorData.factor,
      factor_year: factorData.year,
      factor_source: factorData.source,
      factor_basis: factorData.basis,
      factor_label: factorData.label,
    };
  };

  const handleScope1Add = async () => {
    setScope1AddStatus('');
    if (!companyId) {
      setScope1AddStatus('Set up your company in Settings before adding records.');
      return;
    }
    const { errors } = validateScope1Row(scope1Add);
    if (errors.length) {
      setScope1AddStatus(errors.join(' '));
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data?.session) {
      setScope1AddStatus('Log in to add records.');
      return;
    }
    setScope1Saving(true);
    let payload;
    try {
      payload = buildScope1Payload(scope1Add);
    } catch (error) {
      setScope1AddStatus(String(error));
      setScope1Saving(false);
      return;
    }
    const { error } = await supabase
      .from('scope1_records')
      .upsert([
        {
          user_id: data.session.user.id,
          company_id: companyId,
          ...payload,
        },
      ], { onConflict: 'user_id,company_id,period_year,period_month,country,region' });
    if (error) {
      setScope1AddStatus('Save failed. Please try again.');
      setScope1Saving(false);
      return;
    }
    setScope1AddStatus('Record saved.');
    setScope1Saving(false);
    await loadScope1();
  };

  const handleScope1BulkAdd = async () => {
    setScope1BulkStatus('');
    if (!companyId) {
      setScope1BulkStatus('Set up your company in Settings before adding records.');
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data?.session) {
      setScope1BulkStatus('Log in to add records.');
      return;
    }
    const payloads = [];
    for (const row of scope1BulkRows) {
      const { errors } = validateScope1Row(row);
      if (errors.length) {
        setScope1BulkStatus(`Row ${row.id}: ${errors.join(' ')}`);
        return;
      }
      try {
        payloads.push({
          user_id: data.session.user.id,
          company_id: companyId,
          ...buildScope1Payload(row),
        });
      } catch (error) {
        setScope1BulkStatus(`Row ${row.id}: ${String(error)}`);
        return;
      }
    }
    if (!payloads.length) {
      setScope1BulkStatus('Add at least one complete row.');
      return;
    }
    setScope1BulkSaving(true);
    const { error } = await supabase
      .from('scope1_records')
      .upsert(payloads, { onConflict: 'user_id,company_id,period_year,period_month,country,region' });
    if (error) {
      setScope1BulkStatus('Bulk save failed. Please try again.');
      setScope1BulkSaving(false);
      return;
    }
    setScope1BulkStatus('Records saved.');
    setScope1BulkSaving(false);
    await loadScope1();
  };

  const updateScope1BulkRow = (id: string, field: keyof Scope1AddRow, value: string) => {
    setScope1BulkRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const addScope1BulkRow = () => {
    setScope1BulkRows((prev) => [
      ...prev,
      {
        id: `scope1-row-${prev.length + 1}`,
        period_year: '',
        period_month: '',
        country: '',
        region: '',
        quantity: '',
        unit: '',
        notes: '',
      },
    ]);
  };

  const removeScope1BulkRow = (id: string) => {
    setScope1BulkRows((prev) => prev.filter((row) => row.id !== id));
  };

  const validateScope3Row = (row: Scope3AddRow) => {
    const errors: string[] = [];
    const yearVal = parseInt(row.period_year || '', 10);
    const monthVal = parseInt(row.period_month || '', 10);
    if (!yearVal) errors.push('Select a year.');
    if (!monthVal) errors.push('Select a month.');
    if (!row.category_label) errors.push('Select a category.');
    if (row.method === 'spend') {
      const spend = Number(row.spend_amount || '');
      if (!row.spend_country) errors.push('Select a country.');
      if (!row.spend_region) errors.push('Select a region.');
      if (!Number.isFinite(spend) || spend <= 0) errors.push('Enter a spend amount.');
    } else {
      const emissions = Number(row.emissions || '');
      if (!Number.isFinite(emissions) || emissions <= 0) errors.push('Enter emissions for actuals.');
    }
    if (yearVal && monthVal) {
      const isFuture = yearVal > currentYear || (yearVal === currentYear && monthVal > new Date().getMonth() + 1);
      if (isFuture) errors.push('Scope 3 entries must be for past or current months.');
    }
    return { errors, yearVal, monthVal };
  };

  const buildScope3Payload = (row: Scope3AddRow) => {
    const { yearVal, monthVal } = validateScope3Row(row);
    if (row.method === 'spend') {
      const spendAmount = Number(row.spend_amount || '');
      const factorSet = SCOPE3_FACTOR_SETS[row.spend_country] || scope3FactorSet;
      const category = factorSet.categories.find((item) => item.id === row.category_id) || factorSet.categories[0];
      const emissions = spendAmount * category.factor;
      return {
        period_year: yearVal,
        period_month: monthVal,
        spend_country: row.spend_country,
        spend_region: row.spend_region,
        spend_amount: spendAmount,
        currency: row.currency || factorSet.currency,
        category_id: category.id,
        category_label: category.label,
        vendor_name: row.vendor_name || null,
        notes: row.notes || null,
        eio_sector: category.eio_sector,
        emission_factor_value: category.factor,
        emission_factor_year: factorSet.year,
        emission_factor_source: factorSet.source,
        emission_factor_model: factorSet.model,
        emission_factor_geo: factorSet.geo,
        emission_factor_currency: factorSet.currency,
        emissions_source: row.emissions_source || null,
        calculation_method: 'eio',
        emissions,
      };
    }
    return {
      period_year: yearVal,
      period_month: monthVal,
      spend_country: row.spend_country || null,
      spend_region: row.spend_region || null,
      spend_amount: null,
      currency: row.currency || null,
      category_id: row.category_id || null,
      category_label: row.category_label,
      vendor_name: row.vendor_name || null,
      notes: row.notes || null,
      eio_sector: null,
      emission_factor_value: null,
      emission_factor_year: null,
      emission_factor_source: null,
      emission_factor_model: null,
      emission_factor_geo: null,
      emission_factor_currency: null,
      emissions_source: row.emissions_source || null,
      calculation_method: 'actual',
      emissions: Number(row.emissions || 0),
    };
  };

  const handleScope3Add = async () => {
    setScope3AddStatus('');
    if (scope3Locked) {
      setScope3AddStatus('Upgrade to CarbonWise Complete to add Scope 3 records.');
      return;
    }
    if (!companyId) {
      setScope3AddStatus('Set up your company in Settings before adding records.');
      return;
    }
    const { errors } = validateScope3Row(scope3Add);
    if (errors.length) {
      setScope3AddStatus(errors.join(' '));
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data?.session) {
      setScope3AddStatus('Log in to add records.');
      return;
    }
    setScope3Saving(true);
    let payload;
    try {
      payload = buildScope3Payload(scope3Add);
    } catch (error) {
      setScope3AddStatus(String(error));
      setScope3Saving(false);
      return;
    }
    const { error } = await supabase
      .from('scope3_records')
      .insert([{ user_id: data.session.user.id, company_id: companyId, ...payload }]);
    if (error) {
      setScope3AddStatus('Save failed. Please try again.');
      setScope3Saving(false);
      return;
    }
    setScope3AddStatus('Record saved.');
    setScope3Saving(false);
    await loadScope3();
  };

  const handleScope3BulkAdd = async () => {
    setScope3BulkStatus('');
    if (scope3Locked) {
      setScope3BulkStatus('Upgrade to CarbonWise Complete to add Scope 3 records.');
      return;
    }
    if (!companyId) {
      setScope3BulkStatus('Set up your company in Settings before adding records.');
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data?.session) {
      setScope3BulkStatus('Log in to add records.');
      return;
    }
    const payloads = [];
    for (const row of scope3BulkRows) {
      const { errors } = validateScope3Row(row);
      if (errors.length) {
        setScope3BulkStatus(`Row ${row.id}: ${errors.join(' ')}`);
        return;
      }
      try {
        payloads.push({ user_id: data.session.user.id, company_id: companyId, ...buildScope3Payload(row) });
      } catch (error) {
        setScope3BulkStatus(`Row ${row.id}: ${String(error)}`);
        return;
      }
    }
    if (!payloads.length) {
      setScope3BulkStatus('Add at least one complete row.');
      return;
    }
    setScope3BulkSaving(true);
    const { error } = await supabase.from('scope3_records').insert(payloads);
    if (error) {
      setScope3BulkStatus('Bulk save failed. Please try again.');
      setScope3BulkSaving(false);
      return;
    }
    setScope3BulkStatus('Records saved.');
    setScope3BulkSaving(false);
    await loadScope3();
  };

  const updateScope3BulkRow = (id: string, field: keyof Scope3AddRow, value: string) => {
    setScope3BulkRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const addScope3BulkRow = () => {
    setScope3BulkRows((prev) => [
      ...prev,
      {
        id: `scope3-row-${prev.length + 1}`,
        period_year: '',
        period_month: '',
        method: 'spend',
        spend_country: '',
        spend_region: '',
        category_id: '',
        category_label: '',
        spend_amount: '',
        currency: '',
        vendor_name: '',
        emissions: '',
        emissions_source: '',
        notes: '',
      },
    ]);
  };

  const removeScope3BulkRow = (id: string) => {
    setScope3BulkRows((prev) => prev.filter((row) => row.id !== id));
  };

  const updateScope1Record = async (record: Scope1Row, quantity: string, notes: string) => {
    const quantityVal = Number(quantity || '');
    if (!Number.isFinite(quantityVal) || quantityVal < 0) {
      setScope1EditStatus('Enter a non-negative quantity.');
      return;
    }
    const factorData = getScope1Factor(record.country || '', record.region || '', record.unit || '');
    if (!factorData) {
      setScope1EditStatus('No emission factor is available for this selection.');
      return;
    }
    const emissions = quantityVal * factorData.factor;
    setScope1Editing(true);
    const { error } = await supabase
      .from('scope1_records')
      .update({
        quantity: quantityVal,
        notes: notes || null,
        emissions,
        factor_value: factorData.factor,
        factor_year: factorData.year,
        factor_source: factorData.source,
        factor_basis: factorData.basis,
        factor_label: factorData.label,
      })
      .eq('id', record.id);
    if (error) {
      setScope1EditStatus('Save failed. Please try again.');
      setScope1Editing(false);
      return;
    }
    await loadScope1();
    setScope1Editing(false);
    setSelectedScope1(null);
  };

  const updateScope3Record = async (record: Scope3Row, updates: Partial<Scope3Row>) => {
    if (scope3Locked) return;
    setScope3Editing(true);
    const { error } = await supabase
      .from('scope3_records')
      .update(updates)
      .eq('id', record.id);
    if (error) {
      setScope3EditStatus('Save failed. Please try again.');
      setScope3Editing(false);
      return;
    }
    await loadScope3();
    setScope3Editing(false);
    setSelectedScope3(null);
  };

  return (
    <div>
      <section className="page-card">
        <h1 className="page-title">{scopeLabel} Records</h1>
        <h2 className="section-title">{scopeLabel} Carbon Snapshot</h2>
        <p className="muted">
          {isScope1
            ? 'Track Scope 1 natural gas entries and export filtered results.'
            : 'Track Scope 3 screening and actuals entries with category filters.'}
        </p>
        <div className="records-filters">
          <div>
            <label htmlFor="scopeFilterYear">Reporting year</label>
            <select
              id="scopeFilterYear"
              value={filters.year}
              onChange={(event) => setScopeFilters({ year: event.target.value })}
            >
              <option value="">All</option>
              {yearFilterOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="scopeFilterCountry">Country</label>
            <select
              id="scopeFilterCountry"
              value={filters.country}
              onChange={(event) => {
                setScopeFilters({ country: event.target.value, region: '' });
              }}
            >
              <option value="">All</option>
              {(sites.length && isScope1 ? siteCountries : defaultCountryOptions).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="scopeFilterRegion">Region</label>
            <select
              id="scopeFilterRegion"
              value={filters.region}
              onChange={(event) => setScopeFilters({ region: event.target.value })}
            >
              <option value="">All</option>
              {(sites.length && isScope1 ? (regionsByCountry.get(filters.country) || []) : (REGION_OPTIONS[filters.country] || [])).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          {isScope3 ? (
            <>
              <div>
                <label htmlFor="scopeFilterCategory">Category</label>
                <select
                  id="scopeFilterCategory"
                  value={filters.category}
                  onChange={(event) => setScopeFilters({ category: event.target.value })}
                >
                  <option value="">All</option>
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="scopeFilterMethod">Method</label>
                <select
                  id="scopeFilterMethod"
                  value={validScope3Method}
                  onChange={(event) => setScopeFilters({ method: event.target.value })}
                >
                  <option value="">All</option>
                  <option value="spend">Spend-based</option>
                  <option value="actuals">Actuals</option>
                </select>
              </div>
            </>
          ) : null}
          <button
            type="button"
            className="btn secondary"
            onClick={isScope1 ? exportScope1 : exportScope3}
            disabled={isScope3 && scope3Locked}
          >
            Export filtered CSV
          </button>
        </div>
        {summary ? (
          <div className="summary-grid">
            <div className="summary-card">
              <div className="label">Total emissions</div>
              <div className="value">{formatNumber(summary.total, 2)} <span className="unit">tCO2e</span></div>
            </div>
            <div className="summary-card">
              <div className="label">Avg / month</div>
              <div className="value">{formatNumber(summary.avg, 2)} <span className="unit">tCO2e</span></div>
            </div>
            <div className="summary-card">
              <div className="label">Top {isScope1 ? 'region' : 'category'}</div>
              <div className="value">{summary.top}</div>
            </div>
            <div className="summary-card">
              <div className="label">Coverage (months)</div>
              <div className="value">{summary.count}</div>
            </div>
            {!isScope1 ? (
              <>
                <div className="summary-card">
                  <div className="label">Actuals total</div>
                  <div className="value">{formatNumber(summary.actualsTotal || 0, 2)} <span className="unit">tCO2e</span></div>
                </div>
                <div className="summary-card">
                  <div className="label">Screening total</div>
                  <div className="value">{formatNumber(summary.spendTotal || 0, 2)} <span className="unit">tCO2e</span></div>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <p className="muted">No records available for this view.</p>
        )}
        <h2 className="section-title">Reminders</h2>
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

      {isScope3 && scope3Locked ? (
        <section className="page-card">
          <div className="lock-banner">Upgrade to CarbonWise Complete to unlock Scope 3 records.</div>
        </section>
      ) : null}

      {isScope1 ? (
        <section className="page-card stack">
          <h2 className="section-title">Add a record</h2>
          <div className="two-col">
            <div>
              <label>Year</label>
              <select
                value={scope1Add.period_year}
                onChange={(event) => setScope1Add((prev) => ({ ...prev, period_year: event.target.value }))}
              >
                <option value="">Select year</option>
                {yearOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Month</label>
              <select
                value={scope1Add.period_month}
                onChange={(event) => setScope1Add((prev) => ({ ...prev, period_month: event.target.value }))}
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
              <label>Country</label>
              <select
                value={scope1Add.country}
                onChange={(event) => setScope1Add((prev) => ({ ...prev, country: event.target.value, region: '' }))}
              >
                <option value="">Select country</option>
                {(sites.length ? siteCountries : defaultCountryOptions).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Region</label>
              <select
                value={scope1Add.region}
                onChange={(event) => setScope1Add((prev) => ({ ...prev, region: event.target.value }))}
              >
                <option value="">Select region</option>
                {scope1AddRegionOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="two-col">
            <div>
              <label>Quantity</label>
              <input
                type="number"
                min="0"
                step="any"
                value={scope1Add.quantity}
                onChange={(event) => setScope1Add((prev) => ({ ...prev, quantity: event.target.value }))}
              />
            </div>
            <div>
              <label>Unit</label>
              <select
                value={scope1Add.unit}
                onChange={(event) => setScope1Add((prev) => ({ ...prev, unit: event.target.value }))}
              >
                <option value="">Select unit</option>
                {Object.entries(UNIT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label>Notes</label>
            <input
              type="text"
              value={scope1Add.notes}
              onChange={(event) => setScope1Add((prev) => ({ ...prev, notes: event.target.value.slice(0, 240) }))}
            />
          </div>
          <div className="actions">
            <button type="button" className="btn primary" onClick={handleScope1Add} disabled={scope1Saving}>
              {scope1Saving ? 'Saving...' : 'Save record'}
            </button>
            <div className="status">{scope1AddStatus}</div>
          </div>
        </section>
      ) : null}

      {isScope1 ? (
        <section className="page-card stack">
          <h2 className="section-title">Bulk add</h2>
          <div className="bulk-grid">
            {scope1BulkRows.map((row) => (
              <div className="bulk-row" key={row.id}>
                <div className="bulk-header">
                  <strong>{row.id}</strong>
                  {scope1BulkRows.length > 1 ? (
                    <button type="button" className="btn secondary" onClick={() => removeScope1BulkRow(row.id)}>
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="bulk-fields">
                  <div>
                    <label>Year</label>
                    <select value={row.period_year} onChange={(event) => updateScope1BulkRow(row.id, 'period_year', event.target.value)}>
                      <option value="">Select year</option>
                      {yearOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Month</label>
                    <select value={row.period_month} onChange={(event) => updateScope1BulkRow(row.id, 'period_month', event.target.value)}>
                      <option value="">Select month</option>
                      {MONTH_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Country</label>
                    <select value={row.country} onChange={(event) => updateScope1BulkRow(row.id, 'country', event.target.value)}>
                      <option value="">Select country</option>
                      {(sites.length ? siteCountries : defaultCountryOptions).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Region</label>
                    <select value={row.region} onChange={(event) => updateScope1BulkRow(row.id, 'region', event.target.value)}>
                      <option value="">Select region</option>
                      {(sites.length ? (regionsByCountry.get(row.country) || []) : (REGION_OPTIONS[row.country] || [])).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Quantity</label>
                    <input type="number" min="0" step="any" value={row.quantity} onChange={(event) => updateScope1BulkRow(row.id, 'quantity', event.target.value)} />
                  </div>
                  <div>
                    <label>Unit</label>
                    <select value={row.unit} onChange={(event) => updateScope1BulkRow(row.id, 'unit', event.target.value)}>
                      <option value="">Select unit</option>
                      {Object.entries(UNIT_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Notes</label>
                    <input type="text" value={row.notes} onChange={(event) => updateScope1BulkRow(row.id, 'notes', event.target.value.slice(0, 240))} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="actions">
            <button type="button" className="btn secondary" onClick={addScope1BulkRow}>Add row</button>
            <button type="button" className="btn primary" onClick={handleScope1BulkAdd} disabled={scope1BulkSaving}>
              {scope1BulkSaving ? 'Saving...' : 'Save all'}
            </button>
            <div className="status">{scope1BulkStatus}</div>
          </div>
        </section>
      ) : null}

      {isScope3 ? (
        <section className="page-card stack">
          <h2 className="section-title">Add a record</h2>
          <div className="two-col">
            <div>
              <label>Year</label>
              <select
                value={scope3Add.period_year}
                onChange={(event) => setScope3Add((prev) => ({ ...prev, period_year: event.target.value }))}
              >
                <option value="">Select year</option>
                {yearOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Month</label>
              <select
                value={scope3Add.period_month}
                onChange={(event) => setScope3Add((prev) => ({ ...prev, period_month: event.target.value }))}
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
              <label>Method</label>
              <select
                value={scope3Add.method}
                onChange={(event) => setScope3Add((prev) => ({
                  ...prev,
                  method: event.target.value as 'spend' | 'actuals',
                }))}
              >
                <option value="spend">Spend-based</option>
                <option value="actuals">Actuals</option>
              </select>
            </div>
            <div>
              <label>Category</label>
              <select
                value={scope3Add.category_id}
                onChange={(event) => {
                  const selected = SCOPE3_CATEGORY_LIST.find((item) => item.id === event.target.value);
                  setScope3Add((prev) => ({
                    ...prev,
                    category_id: event.target.value,
                    category_label: selected?.label || '',
                  }));
                }}
              >
                <option value="">Select category</option>
                {SCOPE3_CATEGORY_LIST.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="two-col">
            <div>
              <label>Country</label>
              <select
                value={scope3Add.spend_country}
                onChange={(event) => setScope3Add((prev) => ({ ...prev, spend_country: event.target.value }))}
              >
                <option value="">Select country</option>
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Region</label>
              <select
                value={scope3Add.spend_region}
                onChange={(event) => setScope3Add((prev) => ({ ...prev, spend_region: event.target.value }))}
              >
                <option value="">Select region</option>
                {(REGION_OPTIONS[scope3Add.spend_country] || []).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
          {scope3Add.method === 'spend' ? (
            <div className="two-col">
              <div>
                <label>Spend amount</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={scope3Add.spend_amount}
                  onChange={(event) => setScope3Add((prev) => ({ ...prev, spend_amount: event.target.value }))}
                />
              </div>
              <div>
                <label>Currency</label>
                <select
                  value={scope3Add.currency}
                  onChange={(event) => setScope3Add((prev) => ({ ...prev, currency: event.target.value }))}
                >
                  <option value="">Select currency</option>
                  <option value={scope3FactorSet.currency}>{scope3FactorSet.currency}</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="two-col">
              <div>
                <label>Emissions (tCO2e)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={scope3Add.emissions}
                  onChange={(event) => setScope3Add((prev) => ({ ...prev, emissions: event.target.value }))}
                />
              </div>
              <div>
                <label>Emissions source</label>
                <input
                  type="text"
                  value={scope3Add.emissions_source}
                  onChange={(event) => setScope3Add((prev) => ({ ...prev, emissions_source: event.target.value }))}
                />
              </div>
            </div>
          )}
          <div>
            <label>Vendor (optional)</label>
            <input
              type="text"
              value={scope3Add.vendor_name}
              onChange={(event) => setScope3Add((prev) => ({ ...prev, vendor_name: event.target.value }))}
            />
          </div>
          <div>
            <label>Notes</label>
            <input
              type="text"
              value={scope3Add.notes}
              onChange={(event) => setScope3Add((prev) => ({ ...prev, notes: event.target.value.slice(0, 240) }))}
            />
          </div>
          <div className="actions">
            <button type="button" className="btn primary" onClick={handleScope3Add} disabled={scope3Saving || scope3Locked}>
              {scope3Saving ? 'Saving...' : 'Save record'}
            </button>
            <div className="status">{scope3AddStatus}</div>
          </div>
        </section>
      ) : null}

      {isScope3 ? (
        <section className="page-card stack">
          <h2 className="section-title">Bulk add</h2>
          <div className="bulk-grid">
            {scope3BulkRows.map((row) => (
              <div className="bulk-row" key={row.id}>
                <div className="bulk-header">
                  <strong>{row.id}</strong>
                  {scope3BulkRows.length > 1 ? (
                    <button type="button" className="btn secondary" onClick={() => removeScope3BulkRow(row.id)}>
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="bulk-fields">
                  <div>
                    <label>Year</label>
                    <select value={row.period_year} onChange={(event) => updateScope3BulkRow(row.id, 'period_year', event.target.value)}>
                      <option value="">Select year</option>
                      {yearOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Month</label>
                    <select value={row.period_month} onChange={(event) => updateScope3BulkRow(row.id, 'period_month', event.target.value)}>
                      <option value="">Select month</option>
                      {MONTH_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Method</label>
                    <select value={row.method} onChange={(event) => updateScope3BulkRow(row.id, 'method', event.target.value)}>
                      <option value="spend">Spend-based</option>
                      <option value="actuals">Actuals</option>
                    </select>
                  </div>
                  <div>
                    <label>Category</label>
                    <select value={row.category_id} onChange={(event) => {
                      const selected = SCOPE3_CATEGORY_LIST.find((item) => item.id === event.target.value);
                      updateScope3BulkRow(row.id, 'category_id', event.target.value);
                      updateScope3BulkRow(row.id, 'category_label', selected?.label || '');
                    }}>
                      <option value="">Select category</option>
                      {SCOPE3_CATEGORY_LIST.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Country</label>
                    <select value={row.spend_country} onChange={(event) => updateScope3BulkRow(row.id, 'spend_country', event.target.value)}>
                      <option value="">Select country</option>
                      {COUNTRY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Region</label>
                    <select value={row.spend_region} onChange={(event) => updateScope3BulkRow(row.id, 'spend_region', event.target.value)}>
                      <option value="">Select region</option>
                      {(REGION_OPTIONS[row.spend_country] || []).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  {row.method === 'spend' ? (
                    <>
                      <div>
                        <label>Spend amount</label>
                        <input type="number" min="0" step="any" value={row.spend_amount} onChange={(event) => updateScope3BulkRow(row.id, 'spend_amount', event.target.value)} />
                      </div>
                      <div>
                        <label>Currency</label>
                        <select value={row.currency} onChange={(event) => updateScope3BulkRow(row.id, 'currency', event.target.value)}>
                          <option value="">Select currency</option>
                          <option value={scope3FactorSet.currency}>{scope3FactorSet.currency}</option>
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label>Emissions (tCO2e)</label>
                        <input type="number" min="0" step="any" value={row.emissions} onChange={(event) => updateScope3BulkRow(row.id, 'emissions', event.target.value)} />
                      </div>
                      <div>
                        <label>Emissions source</label>
                        <input type="text" value={row.emissions_source} onChange={(event) => updateScope3BulkRow(row.id, 'emissions_source', event.target.value)} />
                      </div>
                    </>
                  )}
                  <div>
                    <label>Vendor</label>
                    <input type="text" value={row.vendor_name} onChange={(event) => updateScope3BulkRow(row.id, 'vendor_name', event.target.value)} />
                  </div>
                  <div>
                    <label>Notes</label>
                    <input type="text" value={row.notes} onChange={(event) => updateScope3BulkRow(row.id, 'notes', event.target.value.slice(0, 240))} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="actions">
            <button type="button" className="btn secondary" onClick={addScope3BulkRow}>Add row</button>
            <button type="button" className="btn primary" onClick={handleScope3BulkAdd} disabled={scope3BulkSaving || scope3Locked}>
              {scope3BulkSaving ? 'Saving...' : 'Save all'}
            </button>
            <div className="status">{scope3BulkStatus}</div>
          </div>
        </section>
      ) : null}

      <section className="page-card">
        <div className="status">{status}</div>
        {isScope1 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Quantity</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredScope1.length ? (
                filteredScope1.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="primary">{formatNumber(Number(row.emissions || 0), 3)} tCO2e</div>
                      <div className="secondary">
                        {MONTH_NAMES[(row.period_month || 1) - 1]} {row.period_year || ''} ·{' '}
                        {row.country || '—'}{row.region ? ` / ${row.region}` : ''}
                      </div>
                    </td>
                    <td>{formatNumber(Number(row.quantity || 0), 2)} {UNIT_LABELS[row.unit || ''] || row.unit || ''}</td>
                    <td>
                      <button type="button" className="btn secondary" onClick={() => setSelectedScope1(row)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="muted">
                    No Scope 1 records match these filters. Add a record to include it in calculations and exports.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Method</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredScope3.length ? (
                filteredScope3.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="primary">{formatNumber(Number(row.emissions || 0), 3)} tCO2e</div>
                      <div className="secondary">
                        {row.period_month
                          ? `${MONTH_NAMES[(row.period_month || 1) - 1]} ${row.period_year || ''}`
                          : row.period_year || ''}{' '}
                        · {row.category_label || '—'}
                      </div>
                    </td>
                    <td>{row.calculation_method === 'actual' ? 'Actuals' : 'Spend-based'}</td>
                    <td>
                      <button type="button" className="btn secondary" onClick={() => setSelectedScope3(row)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="muted">
                    No Scope 3 records match these filters. Add a record to include it in calculations and exports.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      {selectedScope1 ? (
        <section className="page-card">
          <div className="panel-header">
            <div>
              <div className="panel-title">Scope 1 record</div>
              <div className="muted">
                {selectedScope1.period_year}-{String(selectedScope1.period_month).padStart(2, '0')}
              </div>
            </div>
            <button type="button" className="btn secondary" onClick={() => setSelectedScope1(null)}>
              Close
            </button>
          </div>
          <div className="panel-grid">
            <div>
              <div className="label">Location</div>
              <div>
                {selectedScope1.country || '—'}{selectedScope1.region ? ` / ${selectedScope1.region}` : ''}
              </div>
            </div>
          </div>
          <form
            className="panel-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedScope1) return;
              setScope1EditStatus('');
              updateScope1Record(selectedScope1, scope1Edit.quantity, scope1Edit.notes);
            }}
          >
            <div className="row">
              <div>
                <label>Quantity</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={scope1Edit.quantity}
                  onChange={(event) => setScope1Edit((prev) => ({ ...prev, quantity: event.target.value }))}
                />
              </div>
              <div>
                <label>Unit</label>
                <select value={selectedScope1.unit || ''} disabled>
                  <option value={selectedScope1.unit || ''}>
                    {UNIT_LABELS[selectedScope1.unit || ''] || selectedScope1.unit || '—'}
                  </option>
                </select>
              </div>
            </div>
            <div>
              <label>Notes</label>
              <input
                type="text"
                value={scope1Edit.notes}
                onChange={(event) => setScope1Edit((prev) => ({ ...prev, notes: event.target.value.slice(0, 240) }))}
              />
            </div>
            <div className="actions">
              <button type="submit" className="btn primary" disabled={scope1Editing}>
                {scope1Editing ? 'Saving...' : 'Save changes'}
              </button>
              <div className="status">{scope1EditStatus}</div>
            </div>
          </form>
          <div className="actions">
            <button type="button" className="btn secondary" onClick={() => removeScope1(selectedScope1)}>
              Delete record
            </button>
          </div>
          <p className="note">{SCOPE1_DISCLOSURE}</p>
        </section>
      ) : null}

      {selectedScope3 ? (
        <section className="page-card">
          <div className="panel-header">
            <div>
              <div className="panel-title">Scope 3 record</div>
              <div className="muted">
                {selectedScope3.period_year}-{String(selectedScope3.period_month || '').padStart(2, '0')}
              </div>
            </div>
            <button type="button" className="btn secondary" onClick={() => setSelectedScope3(null)}>
              Close
            </button>
          </div>
          <div className="panel-grid">
            <div>
              <div className="label">Category</div>
              <div>{selectedScope3.category_label || '—'}</div>
            </div>
            <div>
              <div className="label">Method</div>
              <div>{selectedScope3.calculation_method === 'actual' ? 'Actuals' : 'Spend-based'}</div>
            </div>
          </div>
          <form
            className="panel-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedScope3) return;
              if (scope3Locked) {
                setScope3EditStatus('Upgrade to CarbonWise Complete to edit Scope 3 records.');
                return;
              }
              setScope3EditStatus('');
              const yearVal = parseInt(scope3Edit.period_year || '', 10);
              const monthVal = parseInt(scope3Edit.period_month || '', 10);
              if (!yearVal || !monthVal) {
                setScope3EditStatus('Select a valid year and month.');
                return;
              }
              if (yearVal > currentYear || (yearVal === currentYear && monthVal > new Date().getMonth() + 1)) {
                setScope3EditStatus('Future months are not allowed.');
                return;
              }
              const vendor = scope3Edit.vendor_name.trim().slice(0, 120) || null;
              const notes = scope3Edit.notes.trim().slice(0, 240) || null;
              if (selectedScope3.calculation_method === 'actual') {
                const emissionsVal = Number(scope3Edit.emissions || '');
                if (!Number.isFinite(emissionsVal) || emissionsVal < 0) {
                  setScope3EditStatus('Enter a valid emissions value.');
                  return;
                }
                const emissionsSource = scope3Edit.emissions_source.trim().slice(0, 160) || null;
                updateScope3Record(selectedScope3, {
                  period_year: yearVal,
                  period_month: monthVal,
                  emissions: emissionsVal,
                  emissions_source: emissionsSource,
                  vendor_name: vendor,
                  notes,
                });
              } else {
                const spendVal = Number(scope3Edit.spend_amount || '');
                if (!Number.isFinite(spendVal) || spendVal < 0) {
                  setScope3EditStatus('Enter a valid spend amount.');
                  return;
                }
                const factorValue = Number(selectedScope3.emission_factor_value || 0);
                const emissions = factorValue ? spendVal * factorValue : spendVal;
                updateScope3Record(selectedScope3, {
                  period_year: yearVal,
                  period_month: monthVal,
                  spend_amount: spendVal,
                  emissions,
                  vendor_name: vendor,
                  notes,
                });
              }
            }}
          >
            <div className="two-col">
              <div>
                <label>Year</label>
                <select
                  value={scope3Edit.period_year}
                  onChange={(event) => setScope3Edit((prev) => ({ ...prev, period_year: event.target.value }))}
                >
                  <option value="">Select year</option>
                  {yearOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Month</label>
                <select
                  value={scope3Edit.period_month}
                  onChange={(event) => setScope3Edit((prev) => ({ ...prev, period_month: event.target.value }))}
                >
                  <option value="">Select month</option>
                  {MONTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {selectedScope3.calculation_method === 'actual' ? (
              <div className="two-col">
                <div>
                  <label>Emissions (tCO2e)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={scope3Edit.emissions}
                    onChange={(event) => setScope3Edit((prev) => ({ ...prev, emissions: event.target.value }))}
                  />
                </div>
                <div>
                  <label>Emissions source</label>
                  <input
                    type="text"
                    value={scope3Edit.emissions_source}
                    onChange={(event) => setScope3Edit((prev) => ({ ...prev, emissions_source: event.target.value }))}
                  />
                </div>
              </div>
            ) : (
              <div className="two-col">
                <div>
                  <label>Spend amount</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={scope3Edit.spend_amount}
                    onChange={(event) => setScope3Edit((prev) => ({ ...prev, spend_amount: event.target.value }))}
                  />
                </div>
                <div>
                  <label>Currency</label>
                  <select value={selectedScope3.currency || ''} disabled>
                    <option value={selectedScope3.currency || ''}>{selectedScope3.currency || '—'}</option>
                  </select>
                </div>
              </div>
            )}
            <div>
              <label>Vendor</label>
              <input
                type="text"
                value={scope3Edit.vendor_name}
                onChange={(event) => setScope3Edit((prev) => ({ ...prev, vendor_name: event.target.value }))}
              />
            </div>
            <div>
              <label>Notes</label>
              <input
                type="text"
                value={scope3Edit.notes}
                onChange={(event) => setScope3Edit((prev) => ({ ...prev, notes: event.target.value.slice(0, 240) }))}
              />
            </div>
            <div className="actions">
              <button type="submit" className="btn primary" disabled={scope3Editing || scope3Locked}>
                {scope3Editing ? 'Saving...' : 'Save changes'}
              </button>
              <div className="status">{scope3EditStatus}</div>
            </div>
          </form>
          <div className="actions">
            <button type="button" className="btn secondary" onClick={() => removeScope3(selectedScope3)}>
              Delete record
            </button>
          </div>
          <p className="note">{SCOPE3_DISCLOSURE}</p>
        </section>
      ) : null}
    </div>
  );
};

export default ScopeView;

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = window.SUPABASE_URL || 'https://yyzyyjxmoggrmqsgrlxc.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5enl5anhtb2dncm1xc2dybHhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxMTQ4MzMsImV4cCI6MjA4MTY5MDgzM30.BhnHmz9ADB52B_VcMdzvdyFiPvZFj_Q-jfjRqeAoQM4';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SCOPE1_DISCLOSURE = 'Scope 1 emissions are estimates based on user-provided fuel data. Results may be partial and do not represent full Scope 1 coverage.';
const SCOPE1_UNIT_LABELS = {
  therms: 'Therms (US)',
  m3: 'Cubic meters (m3)',
  'kwh-eq': 'kWh-equivalent'
};

const companyNameEl = document.getElementById('companyName');
const yearSelect = document.getElementById('exportYear');
const exportCsvBtn = document.getElementById('exportCsv');
const exportPdfBtn = document.getElementById('exportPdf');
const statusEl = document.getElementById('exportStatus');
const signoutBtn = document.getElementById('nav-signout');
const scope1YearSelect = document.getElementById('scope1ExportYear');
const scope1ExportBtn = document.getElementById('exportScope1Csv');
const scope1StatusEl = document.getElementById('scope1ExportStatus');

const CURRENT_YEAR = new Date().getFullYear();

const clearChildren = (el) => {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
};

const createOption = (value, label) => {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
};

const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };
const setScope1Status = (msg) => { if (scope1StatusEl) scope1StatusEl.textContent = msg; };

const setLoading = (isLoading) => {
  if (exportCsvBtn) exportCsvBtn.disabled = isLoading;
  if (exportPdfBtn) exportPdfBtn.disabled = true; // PDF not implemented yet
};

const setScope1Loading = (isLoading) => {
  if (scope1ExportBtn) scope1ExportBtn.disabled = isLoading;
};

const requireAuth = async () => {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    window.location.href = 'index.html';
    return null;
  }
  return data.session;
};

const fetchCompany = async () => {
  const { data, error } = await supabase.from('companies').select('company_name,country,region,reporting_year_preference').limit(1).single();
  if (error) return null;
  return data;
};

const fetchRecords = async (year = '') => {
  let query = supabase
    .from('scope2_records')
    .select('period_year,period_month,kwh,location_based_emissions,market_based_emissions,emission_factor_value,emission_factor_year,emission_factor_source,calc_country,calc_region,companies(company_name,country,region)')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });
  if (year) {
    query = query.eq('period_year', year);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

const populateYears = (records) => {
  if (!yearSelect) return;
  const years = Array.from(new Set((records || []).map((r) => r.period_year))).filter(Boolean);
  if (!years.includes(CURRENT_YEAR)) years.push(CURRENT_YEAR);
  years.sort((a, b) => b - a);
  const current = yearSelect.value;
  clearChildren(yearSelect);
  yearSelect.appendChild(createOption('', 'All years'));
  years.forEach((year) => {
    yearSelect.appendChild(createOption(String(year), String(year)));
  });
  yearSelect.value = current;
  if (!yearSelect.value) {
    const hasCurrent = Array.from(yearSelect.options).some((opt) => opt.value === String(CURRENT_YEAR));
    if (hasCurrent) yearSelect.value = String(CURRENT_YEAR);
  }
};

const applyReportingPreference = (company, years) => {
  if (!yearSelect) return;
  const pref = company?.reporting_year_preference || 'all';
  const now = new Date().getFullYear();
  const targetYear = pref === 'current' ? now : pref === 'previous' ? now - 1 : null;
  if (!targetYear) return;
  if (years.includes(targetYear)) {
    yearSelect.value = String(targetYear);
  }
};

const fetchScope1Records = async (year = '') => {
  let query = supabase
    .from('scope1_records')
    .select('period_year,period_month,quantity,unit,emissions,factor_value,factor_year,factor_source')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });
  if (year) {
    query = query.eq('period_year', year);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

const populateScope1Years = (records) => {
  if (!scope1YearSelect) return;
  const years = Array.from(new Set((records || []).map((r) => r.period_year))).filter(Boolean);
  if (!years.includes(CURRENT_YEAR)) years.push(CURRENT_YEAR);
  years.sort((a, b) => b - a);
  const current = scope1YearSelect.value;
  clearChildren(scope1YearSelect);
  scope1YearSelect.appendChild(createOption('', 'All years'));
  years.forEach((year) => {
    scope1YearSelect.appendChild(createOption(String(year), String(year)));
  });
  scope1YearSelect.value = current || (years.includes(CURRENT_YEAR) ? String(CURRENT_YEAR) : '');
};

const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const toCsv = (records, company) => {
  const disclosure = 'Location-based Scope 2 electricity calculation aligned with the GHG Protocol.';
  const headers = [
    'company_name','period','country','kwh','scope2_location_based_tco2e','scope2_market_based_tco2e','emission_factor_value','emission_factor_year','emission_factor_source'
  ];
  const rows = records.map((r) => {
    const period = `${r.period_year}-${String(r.period_month).padStart(2, '0')}`;
    const country = `${r.calc_country || ''}${r.calc_region ? ' / ' + r.calc_region : ''}`;
    return [
      r.companies?.company_name || company?.company_name || '',
      period,
      country,
      r.kwh ?? '',
      r.location_based_emissions ?? '',
      r.market_based_emissions ?? '',
      r.emission_factor_value ?? '',
      r.emission_factor_year ?? '',
      r.emission_factor_source ?? ''
    ];
  });
  rows.push(['Disclosure', disclosure]);
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
};

const toScope1Csv = (entries) => {
  const headers = [
    'Scope',
    'Category',
    'Fuel type',
    'Period',
    'Quantity',
    'Unit',
    'Emissions (tCO₂e)',
    'Emission factor value',
    'Factor year',
    'Factor source',
    'Disclosure text'
  ];
  const rows = entries.map((entry) => {
    const period = `${entry.period_year}-${String(entry.period_month).padStart(2, '0')}`;
    return [
      'Scope 1',
      'Stationary combustion',
      'Natural gas',
      period,
      entry.quantity ?? '',
      SCOPE1_UNIT_LABELS[entry.unit] || entry.unit || '',
      entry.emissions ?? '',
      entry.factor_value ?? '',
      entry.factor_year ?? '',
      entry.factor_source ?? '',
      SCOPE1_DISCLOSURE
    ];
  });
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
};

const downloadCsv = (csv, filename) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const setActiveNav = () => {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-item').forEach((link) => {
    const href = link.getAttribute('href');
    if (href && path.includes(href)) {
      link.classList.add('active');
    }
  });
  document.querySelectorAll('.nav-item.disabled').forEach((link) => {
    link.addEventListener('click', (e) => e.preventDefault());
  });
};

const initTabs = () => {
  const buttons = Array.from(document.querySelectorAll('[data-tab-target]'));
  const panels = Array.from(document.querySelectorAll('.tab-panel'));
  if (!buttons.length || !panels.length) return;
  const setActive = (tab) => {
    buttons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tabTarget === tab));
    panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.tab === tab));
  };
  const syncWithHash = () => {
    const hash = window.location.hash;
    if (hash === '#scope1') {
      setActive('scope1');
      return;
    }
    setActive('scope2');
  };
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tabTarget;
      setActive(tab);
    });
  });
  syncWithHash();
  window.addEventListener('hashchange', syncWithHash);
};

const init = async () => {
  setActiveNav();
  initTabs();
  setStatus('Checking access…');
  const session = await requireAuth();
  if (!session) return;
  const [company, records] = await Promise.all([fetchCompany(), fetchRecords('')]);
  if (companyNameEl) {
    if (company) companyNameEl.textContent = `${company.company_name} (${company.country || ''}${company.region ? ' / ' + company.region : ''})`;
    else companyNameEl.textContent = 'Company not set';
  }
  populateYears(records);
  const years = Array.from(new Set((records || []).map((r) => r.period_year))).filter(Boolean);
  applyReportingPreference(company, years);
  setStatus('');

  try {
    const scope1Records = await fetchScope1Records('');
    populateScope1Years(scope1Records);
  } catch (err) {
    console.warn('Scope 1 records load failed', err);
    populateScope1Years([]);
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', async () => {
      setLoading(true);
      setStatus('Generating CSV…');
      try {
        const year = yearSelect?.value || '';
        const data = await fetchRecords(year);
        if (!data.length) {
          setStatus('No Scope 2 electricity records found for this period. Add a record to include it in calculations and exports.');
          setLoading(false);
          return;
        }
        const csv = toCsv(data, company);
        const namePart = year ? `${year}` : 'all-years';
        downloadCsv(csv, `carbonwise_scope2_${namePart}.csv`);
        setStatus('CSV generated.');
      } catch (err) {
        console.warn('CSV export error', err);
        setStatus('Could not generate CSV right now. Please try again.');
      } finally {
        setLoading(false);
      }
    });
  }

  if (scope1ExportBtn) {
    scope1ExportBtn.addEventListener('click', async () => {
      setScope1Loading(true);
      setScope1Status('Generating Scope 1 CSV…');
      try {
        const year = scope1YearSelect?.value || '';
        const entries = await fetchScope1Records(year);
        if (!entries.length) {
          setScope1Status('No Scope 1 entries found for this period. Add a record to include it in exports.');
          setScope1Loading(false);
          return;
        }
        const csv = toScope1Csv(entries);
        const namePart = year ? `${year}` : 'all-years';
        downloadCsv(csv, `carbonwise_scope1_${namePart}.csv`);
        setScope1Status('Scope 1 CSV generated.');
      } catch (err) {
        console.warn('Scope 1 CSV export error', err);
        setScope1Status('Could not generate Scope 1 CSV right now. Please try again.');
      } finally {
        setScope1Loading(false);
      }
    });
  }
};

init();

if (signoutBtn) {
  signoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  });
}

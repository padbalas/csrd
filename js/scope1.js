import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SCOPE1_NATURAL_GAS_FACTORS, SCOPE1_NATURAL_GAS_DEFAULT } from '../data/emission-factors.js';
import { ensureCompanySites } from './sites.js';

const SUPABASE_URL = window.SUPABASE_URL || 'https://yyzyyjxmoggrmqsgrlxc.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5enl5anhtb2dncm1xc2dybHhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxMTQ4MzMsImV4cCI6MjA4MTY5MDgzM30.BhnHmz9ADB52B_VcMdzvdyFiPvZFj_Q-jfjRqeAoQM4';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SCOPE1_DISCLOSURE = 'Scope 1 emissions are estimates based on user-provided fuel data. Results may be partial and do not represent full Scope 1 coverage.';
const UNIT_LABELS = {
  therms: 'Therms (US)',
  m3: 'Cubic meters (m3)',
  'kwh-eq': 'kWh-equivalent'
};

const TODAY = new Date();
const CURRENT_YEAR = TODAY.getFullYear();
const CURRENT_MONTH = TODAY.getMonth() + 1;
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const COUNTRY_OPTIONS = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'AU', label: 'Australia' },
  { value: 'SG', label: 'Singapore' },
  { value: 'NZ', label: 'New Zealand' }
];

const REGION_OPTIONS = {
  US: [
    "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","District of Columbia",
    "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine",
    "Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
    "New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma",
    "Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
    "Virginia","Washington","West Virginia","Wisconsin","Wyoming"
  ],
  CA: [
    "Alberta","British Columbia","Manitoba","New Brunswick","Newfoundland and Labrador","Northwest Territories",
    "Nova Scotia","Nunavut","Ontario","Prince Edward Island","Quebec","Saskatchewan","Yukon"
  ],
  UK: [
    "England","Northern Ireland","Scotland","Wales"
  ],
  AU: [
    "New South Wales","Victoria","Queensland","Western Australia","South Australia",
    "Tasmania","Australian Capital Territory","Northern Territory"
  ],
  SG: [
    "Singapore"
  ],
  NZ: [
    "Auckland","Bay of Plenty","Canterbury","Gisborne","Hawke's Bay","Manawatu-Whanganui","Marlborough",
    "Nelson","Northland","Otago","Southland","Taranaki","Tasman","Waikato","Wellington","West Coast"
  ]
};

const scope1Table = document.getElementById('scope1Table');
const exportBtn = document.getElementById('scope1-export-csv');
const exportStatus = document.getElementById('scope1-export-status');
const addBtn = document.getElementById('scope1-add');
const bulkBtn = document.getElementById('scope1-bulk');
const panel = document.getElementById('scope1Panel');
const signoutBtn = document.getElementById('nav-signout');

const filterYear = document.getElementById('filterYear');
const filterCountry = document.getElementById('filterCountry');
const filterRegion = document.getElementById('filterRegion');

const totalEl = document.getElementById('scope1Total');
const avgEl = document.getElementById('scope1Avg');
const topEl = document.getElementById('scope1TopRegion');
const countEl = document.getElementById('scope1Count');

let records = [];
let companyDefaults = { country: '', region: '', reportingYear: 'all' };
let sites = [];

const applySiteRestrictions = () => {
  const hasSites = sites.length > 0;
  if (addBtn) addBtn.disabled = !hasSites;
  if (bulkBtn) bulkBtn.disabled = !hasSites;
};

const formatNumber = (n, digits = 2) => Number(n).toLocaleString(undefined, {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits
});

const normalizeKey = (str) => (str || '').trim().toUpperCase();

const requireAuth = async () => {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    window.location.href = 'index.html';
    return null;
  }
  return data.session;
};

const getCompanyId = async (session) => {
  if (!session) return null;
  const { data, error } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) return null;
  return data?.[0]?.id || null;
};

const loadCompanyDefaults = async (session) => {
  const { data, error } = await supabase
    .from('companies')
    .select('reporting_year_preference')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error || !data || !data.length) return;
  const company = data[0] || {};
  const siteData = await ensureCompanySites(supabase, session);
  sites = siteData.sites || [];
  companyDefaults = {
    country: siteData.hqSite?.country || '',
    region: siteData.hqSite?.region || '',
    reportingYear: company.reporting_year_preference || 'all'
  };
};

const fetchRecords = async () => {
  const { data, error } = await supabase
    .from('scope1_records')
    .select('id,site_id,period_year,period_month,country,region,quantity,unit,notes,emissions,factor_value,factor_year,factor_source,factor_basis,factor_label,created_at')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

const populateFilters = (rows) => {
  const years = new Set();
  const countries = new Set();
  const regions = new Set();

  rows.forEach((r) => {
    if (r.period_year) years.add(String(r.period_year));
    if (r.country) countries.add(r.country);
    if (r.region) regions.add(r.region);
  });

  years.add(String(CURRENT_YEAR));

  if (filterYear) {
    const current = filterYear.value;
    filterYear.innerHTML = '<option value="">All</option>';
    Array.from(years).sort((a, b) => b.localeCompare(a)).forEach((y) => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      filterYear.appendChild(opt);
    });
    filterYear.value = current;
  }

  if (filterCountry) {
    const current = filterCountry.value;
    filterCountry.innerHTML = '<option value="">All</option>';
    Array.from(countries).sort().forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      filterCountry.appendChild(opt);
    });
    filterCountry.value = current;
  }

  if (filterRegion) {
    const current = filterRegion.value;
    filterRegion.innerHTML = '<option value="">All</option>';
    Array.from(regions).sort().forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      filterRegion.appendChild(opt);
    });
    filterRegion.value = current;
  }
};

const applyDefaultFilters = () => {
  return;
};

const applyFilters = (rows) => {
  const yearVal = filterYear?.value || '';
  const countryVal = (filterCountry?.value || '').toLowerCase();
  const regionVal = (filterRegion?.value || '').toLowerCase();

  return rows.filter((r) => {
    const yearMatch = yearVal ? String(r.period_year) === yearVal : true;
    const countryMatch = countryVal ? (r.country || '').toLowerCase() === countryVal : true;
    const regionMatch = regionVal ? (r.region || '').toLowerCase() === regionVal : true;
    return yearMatch && countryMatch && regionMatch;
  });
};

const renderSummary = (rows) => {
  if (!totalEl || !avgEl || !topEl || !countEl) return;
  if (!rows.length) {
    totalEl.textContent = '—';
    avgEl.textContent = '—';
    topEl.textContent = '—';
    countEl.textContent = '—';
    return;
  }

  let total = 0;
  const regions = {};
  const months = new Set();

  rows.forEach((r) => {
    const val = Number(r.emissions || 0);
    total += val;
    const regionLabel = `${r.country || '—'}${r.region ? ' / ' + r.region : ''}`;
    regions[regionLabel] = (regions[regionLabel] || 0) + val;
    months.add(`${r.period_year}-${String(r.period_month).padStart(2, '0')}`);
  });

  const topEntry = Object.entries(regions).sort((a, b) => b[1] - a[1])[0];
  totalEl.textContent = total.toFixed(3);
  avgEl.textContent = months.size ? (total / months.size).toFixed(3) : total.toFixed(3);
  topEl.textContent = topEntry ? `${topEntry[0]} (${topEntry[1].toFixed(3)})` : '—';
  countEl.textContent = months.size;
};

const computeReminders = (rows) => {
  const list = [];
  if (!rows.length) return list;

  const filterYearVal = filterYear?.value || '';
  const filterCountryVal = filterCountry?.value || '';
  const filterRegionVal = filterRegion?.value || '';
  const filterRegionLabel = filterCountryVal && filterRegionVal
    ? `${filterCountryVal} / ${filterRegionVal}`
    : '';
  const pref = companyDefaults?.reportingYear || 'all';
  const targetYear = filterYearVal
    ? parseInt(filterYearVal, 10)
    : pref === 'current'
      ? CURRENT_YEAR
      : pref === 'previous'
        ? CURRENT_YEAR - 1
        : null;

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const formatMissingRanges = (months, year, regionLabel) => {
    const sorted = Array.from(new Set(months)).sort((a, b) => a - b);
    let start = null;
    let prev = null;
    const ranges = [];
    sorted.forEach((m) => {
      if (start === null) {
        start = m;
        prev = m;
        return;
      }
      if (m === prev + 1) {
        prev = m;
        return;
      }
      ranges.push([start, prev]);
      start = m;
      prev = m;
    });
    if (start !== null) ranges.push([start, prev]);
    ranges.forEach(([s, e]) => {
      const rangeLabel = s === e ? `${monthNames[s - 1]} ${year}` : `${monthNames[s - 1]}–${monthNames[e - 1]} ${year}`;
      list.push({ type: 'missing', text: `Missing ${rangeLabel} (${regionLabel}).` });
    });
  };

  if (targetYear) {
    const regionsPresent = Array.from(
      new Set(rows.map((r) => `${r.country || '—'}${r.region ? ' / ' + r.region : ''}`))
    ).filter(Boolean);
    const regionsForCountry = filterCountryVal
      ? regionsPresent.filter((label) => label.startsWith(`${filterCountryVal} / `))
      : [];
    const regionList = filterRegionLabel
      ? [filterRegionLabel]
      : filterCountryVal
        ? regionsForCountry
        : regionsPresent;
    const now = new Date();
    regionList.forEach((regionLabel) => {
      const seen = new Set(
        rows
          .filter((r) => `${r.country || '—'}${r.region ? ' / ' + r.region : ''}` === regionLabel)
          .filter((r) => String(r.period_year) === String(targetYear))
          .map((r) => `${r.period_year}-${String(r.period_month).padStart(2, '0')}`)
      );
      const maxMonth = targetYear === CURRENT_YEAR ? now.getMonth() + 1 : 12;
      const missing = [];
      for (let m = 1; m <= maxMonth; m += 1) {
        const key = `${targetYear}-${String(m).padStart(2, '0')}`;
        if (!seen.has(key)) missing.push(m);
      }
      if (missing.length) formatMissingRanges(missing, targetYear, regionLabel);
    });
  }

  let total = 0;
  const regions = {};
  rows.forEach((r) => {
    const val = Number(r.emissions || 0);
    total += val;
    const regionLabel = `${r.country || '—'}${r.region ? ' / ' + r.region : ''}`;
    regions[regionLabel] = (regions[regionLabel] || 0) + val;
  });
  if (total > 0) {
    Object.entries(regions).forEach(([region, val]) => {
      const share = val / total;
      if (share > 0.3) {
        list.push({ type: 'region', text: `${region} contributes ${ (share * 100).toFixed(0) }% of your Scope 1 emissions.` });
      }
    });
  }

  return list;
};

const renderReminders = (rows) => {
  const listEl = document.getElementById('scope1ReminderList');
  if (!listEl) return;
  const reminders = computeReminders(rows);
  listEl.innerHTML = '';
  if (!reminders.length) {
    const li = document.createElement('li');
    li.className = 'placeholder';
    li.textContent = 'All looks good. No reminders right now.';
    listEl.appendChild(li);
    return;
  }
  reminders.forEach((r) => {
    const li = document.createElement('li');
    li.textContent = r.text;
    listEl.appendChild(li);
  });
};

const renderTable = (rows) => {
  if (!scope1Table) return;
  scope1Table.innerHTML = '';
  if (!rows.length) {
    scope1Table.innerHTML = '<tr><td colspan="3" style="color:#4b5563;">No Scope 1 records match these filters. Add a record to include it in calculations and exports.</td></tr>';
    return;
  }
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const monthName = MONTHS[(row.period_month || 1) - 1] || '';
    const location = `${row.country || '—'}${row.region ? ' / ' + row.region : ''}`;
    const unitLabel = UNIT_LABELS[row.unit] || row.unit || '';
    tr.innerHTML = `
      <td>
        <div class="primary">${formatNumber(row.emissions || 0, 3)} tCO2e</div>
        <div class="secondary">${monthName} ${row.period_year || ''} · ${location}</div>
      </td>
      <td>${formatNumber(row.quantity || 0, 2)} ${unitLabel}</td>
      <td class="actions">
        <button class="btn secondary" data-action="view" data-id="${row.id}">View</button>
      </td>
    `;
    scope1Table.appendChild(tr);
  });
};

const refreshView = () => {
  populateFilters(records);
  applyDefaultFilters();
  const filtered = applyFilters(records);
  renderTable(filtered);
  renderSummary(filtered);
  renderReminders(filtered);
};

const setExportStatus = (msg) => { if (exportStatus) exportStatus.textContent = msg; };

const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const toCsv = (rows) => {
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
    'Disclosure text'
  ];
  const data = rows.map((r) => {
    const period = `${r.period_year}-${String(r.period_month).padStart(2, '0')}`;
    return [
      'Scope 1',
      'Stationary combustion',
      'Natural gas',
      period,
      r.quantity ?? '',
      UNIT_LABELS[r.unit] || r.unit || '',
      r.emissions ?? '',
      r.factor_value ?? '',
      r.factor_year ?? '',
      r.factor_source ?? '',
      SCOPE1_DISCLOSURE
    ];
  });
  return [headers, ...data].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
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

const exportFiltered = () => {
  if (!exportBtn) return;
  exportBtn.disabled = true;
  setExportStatus('Preparing export...');
  try {
    const filtered = applyFilters(records);
    if (!filtered.length) {
      setExportStatus('No records match these filters.');
      return;
    }
    const yearVal = filterYear?.value || '';
    const namePart = yearVal ? `${yearVal}` : 'filtered';
    downloadCsv(toCsv(filtered), `carbonwise_scope1_${namePart}.csv`);
    setExportStatus('Exported with current filters.');
  } catch (err) {
    console.warn('Scope 1 export failed', err);
    setExportStatus('Could not export right now.');
  } finally {
    exportBtn.disabled = false;
  }
};

const getSiteCountries = () => {
  const unique = Array.from(new Set(sites.map((site) => site.country)));
  return unique.map((country) => {
    const label = (COUNTRY_OPTIONS.find((c) => c.value === country) || {}).label || country;
    return { value: country, label };
  });
};

const setDisabledOptions = (el, enabledValues) => {
  if (!el) return;
  Array.from(el.options).forEach((opt) => {
    if (!opt.value) return;
    opt.disabled = !enabledValues.has(opt.value);
  });
};

const selectFirstEnabled = (el) => {
  if (!el) return;
  const enabled = Array.from(el.options).find((opt) => opt.value && !opt.disabled);
  if (enabled) el.value = enabled.value;
};

const setRegionOptions = (country, regionEl) => {
  const opts = REGION_OPTIONS[country] || [];
  regionEl.innerHTML = '<option value="">Select region</option>';
  opts.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    regionEl.appendChild(opt);
  });
  if (sites.length) {
    const enabled = new Set(
      sites.filter((site) => site.country === country).map((site) => site.region)
    );
    setDisabledOptions(regionEl, enabled);
    if (regionEl.value && !enabled.has(regionEl.value)) selectFirstEnabled(regionEl);
  } else if (sites.length === 0) {
    setDisabledOptions(regionEl, new Set());
  }
};

const populateCountries = (el) => {
  const options = COUNTRY_OPTIONS;
  el.innerHTML = '<option value="">Select country</option>';
  options.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.value;
    opt.textContent = c.label;
    el.appendChild(opt);
  });
  if (sites.length) {
    const enabled = new Set(getSiteCountries().map((c) => c.value));
    setDisabledOptions(el, enabled);
    if (el.value && !enabled.has(el.value)) selectFirstEnabled(el);
  } else if (sites.length === 0) {
    setDisabledOptions(el, new Set());
  }
};

const populateMonths = (el) => {
  el.innerHTML = '<option value="">Select month</option>';
  MONTHS.forEach((m, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx + 1);
    opt.textContent = m;
    el.appendChild(opt);
  });
};

const populateYears = (el, withPlaceholder = true) => {
  el.innerHTML = withPlaceholder ? '<option value="">Select year</option>' : '';
  for (let y = CURRENT_YEAR; y >= 2024; y -= 1) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    el.appendChild(opt);
  }
};

const isFuturePeriod = (year, month) => (
  year > CURRENT_YEAR || (year === CURRENT_YEAR && month > CURRENT_MONTH)
);

const getScope1Factor = (country, region, unit) => {
  const countryData = SCOPE1_NATURAL_GAS_FACTORS[country];
  const regionKey = normalizeKey(region);
  let factorData = null;
  let label = 'Default';
  if (countryData?.regions && regionKey && countryData.regions[regionKey]?.[unit]) {
    factorData = countryData.regions[regionKey][unit];
    label = 'Region-specific';
  }
  if (!factorData && countryData?.default?.[unit]) {
    factorData = countryData.default[unit];
  }
  if (!factorData && SCOPE1_NATURAL_GAS_DEFAULT?.[unit]) {
    factorData = SCOPE1_NATURAL_GAS_DEFAULT[unit];
    label = 'Default';
  }
  if (!factorData) return null;
  return { ...factorData, label };
};

const openPanel = (html) => {
  if (!panel) return;
  panel.innerHTML = html;
  panel.classList.remove('hidden');
  panel.classList.add('active');
  const closeBtn = panel.querySelector('[data-close-panel]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      panel.classList.remove('active');
      panel.classList.add('hidden');
      panel.innerHTML = '';
    }, { once: true });
  }
};

const closePanel = () => {
  if (!panel) return;
  panel.classList.remove('active');
  panel.classList.add('hidden');
  panel.innerHTML = '';
};

const buildRecordDetails = (record) => {
  const period = `${record.period_year}-${String(record.period_month).padStart(2, '0')}`;
  const location = `${record.country || '—'}${record.region ? ' / ' + record.region : ''}`;
  const unitLabel = UNIT_LABELS[record.unit] || record.unit || '';
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;">
      <div>
        <div style="font-weight:700;font-size:1.05rem;">Record details</div>
        <div style="color:#4b5563;font-size:0.95rem;">${period} • ${location}</div>
      </div>
      <button type="button" class="btn secondary" data-close-panel style="padding:8px 10px;">×</button>
    </div>
    <div style="display:grid;gap:10px;">
      <div><strong>Quantity</strong><br>${formatNumber(record.quantity || 0, 2)} ${unitLabel}</div>
      <div><strong>Emissions</strong><br>${formatNumber(record.emissions || 0, 3)} tCO2e</div>
      <div><strong>Factor</strong><br>${formatNumber(record.factor_value || 0, 6)} ${record.factor_basis || ''} • ${record.factor_year || ''} • ${record.factor_source || ''}</div>
      <div><strong>Notes</strong><br>${record.notes || '—'}</div>
      <p style="color:#4b5563;font-size:0.95rem;margin:8px 0 0;">Calculated using stationary combustion factors. <a href="methodology.html#scope-1">See Methodology</a>.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">
        <button class="btn secondary" data-panel-edit="${record.id}" style="padding:10px 12px;">Edit</button>
        <button class="btn secondary" data-panel-delete="${record.id}" style="padding:10px 12px;">Delete</button>
      </div>
    </div>
  `;
};

const buildEditPanel = (record) => {
  const period = `${record.period_year}-${String(record.period_month).padStart(2, '0')}`;
  const location = `${record.country || '—'}${record.region ? ' / ' + record.region : ''}`;
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;">
      <div>
        <div style="font-weight:700;font-size:1.05rem;">Edit Scope 1 record</div>
        <div style="color:#4b5563;font-size:0.95rem;">${period} • ${location}</div>
      </div>
      <button type="button" class="btn secondary" data-close-panel style="padding:8px 10px;">×</button>
    </div>
    <form id="edit-scope1-form" class="panel-form">
      <div class="panel-row">
        <label>
          Quantity
          <input type="number" id="edit-quantity" min="0" step="any" value="${record.quantity ?? ''}" required />
        </label>
        <label>
          Unit
          <select id="edit-unit" disabled>
            <option value="${record.unit || ''}">${UNIT_LABELS[record.unit] || record.unit || '—'}</option>
          </select>
        </label>
      </div>
      <div class="panel-row single">
        <label>
          Notes (optional)
          <input type="text" id="edit-notes" maxlength="240" value="${record.notes || ''}" />
        </label>
      </div>
      <div class="panel-actions">
        <button type="submit" class="btn primary">Save changes</button>
      </div>
      <p class="panel-status" id="edit-status"></p>
    </form>
  `;
};

const openRecordPanel = (recordId) => {
  const record = records.find((r) => String(r.id) === String(recordId));
  if (!record) return;
  openPanel(buildRecordDetails(record));
  const editBtn = panel?.querySelector('[data-panel-edit]');
  const deleteBtn = panel?.querySelector('[data-panel-delete]');
  if (editBtn) {
    editBtn.addEventListener('click', () => handleEditRecord(record));
  }
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => handleDeleteRecord(record));
  }
};

const handleEditRecord = async (record) => {
  openPanel(buildEditPanel(record));
  const form = panel?.querySelector('#edit-scope1-form');
  const quantityEl = panel?.querySelector('#edit-quantity');
  const notesEl = panel?.querySelector('#edit-notes');
  const statusEl = panel?.querySelector('#edit-status');
  if (!form || !quantityEl) return;

  const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('');
    const quantity = Number(quantityEl.value);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setStatus('Enter a valid quantity.');
      return;
    }
    const notes = String(notesEl?.value || '').trim().slice(0, 240) || null;
    const factorValue = Number(record.factor_value || 0);
    const emissions = quantity * factorValue;
    const { error } = await supabase
      .from('scope1_records')
      .update({
        quantity,
        notes,
        emissions
      })
      .eq('id', record.id);
    if (error) {
      setStatus('Save failed. Please try again.');
      return;
    }
    await loadData();
    closePanel();
  });
};

const handleDeleteRecord = async (record) => {
  const confirmDelete = confirm('Delete this record?');
  if (!confirmDelete) return;
  const { error } = await supabase.from('scope1_records').delete().eq('id', record.id);
  if (error) {
    alert('Delete failed. Please try again.');
    return;
  }
  await loadData();
  closePanel();
};

const buildAddPanel = () => `
  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;">
    <div>
      <div style="font-weight:700;font-size:1.05rem;">Add Scope 1 record</div>
      <div style="color:#4b5563;font-size:0.95rem;">Create a single natural gas entry.</div>
    </div>
    <button type="button" class="btn secondary" data-close-panel style="padding:8px 10px;">×</button>
  </div>
  <form id="add-scope1-form" class="panel-form">
    <div class="panel-row">
      <label>
        Country / region
        <select id="add-country" required></select>
      </label>
      <label>
        Region
        <select id="add-region" required></select>
      </label>
    </div>
    <div class="panel-hint">Locations not in Settings are disabled.</div>
    <div class="panel-row">
      <label>
        Billing month
        <select id="add-month" required></select>
      </label>
      <label>
        Billing year
        <select id="add-year" required></select>
      </label>
    </div>
    <div class="panel-row">
      <label>
        Quantity
        <input type="number" id="add-quantity" min="0" step="any" placeholder="e.g., 250" required />
      </label>
      <label>
        Unit
        <select id="add-unit" required>
          <option value="">Select unit</option>
          <option value="therms">Therms (US)</option>
          <option value="m3">Cubic meters (m3)</option>
          <option value="kwh-eq">kWh-equivalent</option>
        </select>
      </label>
    </div>
    <div class="panel-row single">
      <label>
        Notes (optional)
        <input type="text" id="add-notes" maxlength="240" placeholder="Optional context for this entry" />
      </label>
    </div>
    <div class="panel-actions">
      <button type="submit" class="btn primary">Save record</button>
    </div>
    <p class="panel-status" id="add-status"></p>
  </form>
`;

const openAddPanel = () => {
  openPanel(buildAddPanel());
  const form = panel?.querySelector('#add-scope1-form');
  const countryEl = panel?.querySelector('#add-country');
  const regionEl = panel?.querySelector('#add-region');
  const monthEl = panel?.querySelector('#add-month');
  const yearEl = panel?.querySelector('#add-year');
  const quantityEl = panel?.querySelector('#add-quantity');
  const unitEl = panel?.querySelector('#add-unit');
  const notesEl = panel?.querySelector('#add-notes');
  const statusEl = panel?.querySelector('#add-status');

  if (!form || !countryEl || !regionEl || !monthEl || !yearEl || !quantityEl || !unitEl) return;

  if (!sites.length) {
    if (statusEl) statusEl.textContent = 'Add at least one site in Settings before creating records.';
    form.querySelector('button[type="submit"]').disabled = true;
  }

  populateCountries(countryEl);
  populateMonths(monthEl);
  populateYears(yearEl);
  setRegionOptions(countryEl.value, regionEl);

  countryEl.addEventListener('change', () => setRegionOptions(countryEl.value, regionEl));

  const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('');
    const country = countryEl.value;
    const region = regionEl.value;
    const month = parseInt(monthEl.value, 10);
    const year = parseInt(yearEl.value, 10);
    const quantity = parseFloat(quantityEl.value);
    const unit = unitEl.value;
    const notes = String(notesEl?.value || '').trim().slice(0, 240);

    if (!country || !region || !month || !year || !Number.isFinite(quantity) || quantity < 0 || !unit) {
      setStatus('Please complete all required fields.');
      return;
    }
    const site = sites.find((entry) => entry.country === country && entry.region === region);
    if (!site) {
      setStatus('Select a configured site.');
      return;
    }
    if (isFuturePeriod(year, month)) {
      setStatus('Future billing periods are not allowed.');
      return;
    }

    const factorData = getScope1Factor(country, region, unit);
    if (!factorData) {
      setStatus('No emission factor available for this selection.');
      return;
    }

    const session = await requireAuth();
    if (!session) return;
    const companyId = await getCompanyId(session);
    if (!companyId) {
      setStatus('Company profile missing. Add it from the main page.');
      return;
    }

    const emissions = quantity * factorData.factor;

    const payload = {
      user_id: session.user.id,
      company_id: companyId,
      site_id: site.id,
      period_year: year,
      period_month: month,
      country,
      region,
      quantity,
      unit,
      notes: notes || null,
      emissions,
      factor_value: factorData.factor,
      factor_year: factorData.year,
      factor_source: factorData.source,
      factor_basis: factorData.basis,
      factor_label: factorData.label
    };

    const { error } = await supabase
      .from('scope1_records')
      .upsert([payload], { onConflict: 'user_id,company_id,period_year,period_month,country,region' });
    if (error) {
      console.warn('Scope 1 save failed', error);
      setStatus('Save failed. Please try again.');
      return;
    }
    await loadData();
    closePanel();
  });
};

const buildBulkPanel = () => `
  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;">
    <div>
      <div style="font-weight:700;font-size:1.05rem;">Bulk add Scope 1 records</div>
      <div style="color:#4b5563;font-size:0.95rem;">Add multiple months at once.</div>
    </div>
    <button type="button" class="btn secondary" data-close-panel style="padding:8px 10px;">×</button>
  </div>
  <div class="panel-hint">Locations not in Settings are disabled.</div>
  <form id="bulk-form" class="panel-form">
    <div id="bulk-rows"></div>
    <div class="panel-actions">
      <button type="button" class="btn secondary" id="bulk-add-row">Add row</button>
      <button type="submit" class="btn primary">Save rows</button>
    </div>
    <p class="panel-status" id="bulk-status"></p>
  </form>
`;

const createBulkRow = () => {
  const row = document.createElement('div');
  row.className = 'bulk-row';
  row.innerHTML = `
    <div class="panel-row">
      <label>
        Country / region
        <select data-field="country"></select>
      </label>
      <label>
        Region
        <select data-field="region"></select>
      </label>
    </div>
    <div class="panel-row">
      <label>
        Billing month
        <select data-field="month"></select>
      </label>
      <label>
        Billing year
        <select data-field="year"></select>
      </label>
    </div>
    <div class="panel-row">
      <label>
        Quantity
        <input type="number" data-field="quantity" min="0" step="any" placeholder="e.g., 250" />
      </label>
      <label>
        Unit
        <select data-field="unit">
          <option value="">Select unit</option>
          <option value="therms">Therms (US)</option>
          <option value="m3">Cubic meters (m3)</option>
          <option value="kwh-eq">kWh-equivalent</option>
        </select>
      </label>
    </div>
    <div class="panel-row single">
      <label>
        Notes (optional)
        <input type="text" data-field="notes" maxlength="240" placeholder="Optional context" />
      </label>
    </div>
    <div class="bulk-row-actions">
      <button type="button" class="btn secondary" data-remove-row>Remove row</button>
    </div>
  `;
  const countryEl = row.querySelector('[data-field="country"]');
  const regionEl = row.querySelector('[data-field="region"]');
  const monthEl = row.querySelector('[data-field="month"]');
  const yearEl = row.querySelector('[data-field="year"]');
  if (countryEl && regionEl && monthEl && yearEl) {
    populateCountries(countryEl);
    populateMonths(monthEl);
    populateYears(yearEl);
    setRegionOptions(countryEl.value, regionEl);
    countryEl.addEventListener('change', () => setRegionOptions(countryEl.value, regionEl));
  }
  const removeBtn = row.querySelector('[data-remove-row]');
  if (removeBtn) removeBtn.addEventListener('click', () => row.remove());
  return row;
};

const openBulkPanel = () => {
  openPanel(buildBulkPanel());
  const rowsEl = panel?.querySelector('#bulk-rows');
  const addRowBtn = panel?.querySelector('#bulk-add-row');
  const form = panel?.querySelector('#bulk-form');
  const statusEl = panel?.querySelector('#bulk-status');
  if (!rowsEl || !addRowBtn || !form) return;

  if (!sites.length) {
    if (statusEl) statusEl.textContent = 'Add at least one site in Settings before creating records.';
    form.querySelector('button[type="submit"]').disabled = true;
  }

  for (let i = 0; i < 3; i += 1) {
    rowsEl.appendChild(createBulkRow());
  }

  addRowBtn.addEventListener('click', () => {
    rowsEl.appendChild(createBulkRow());
  });

  const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('');

    const rows = Array.from(rowsEl.querySelectorAll('.bulk-row'));
    if (!rows.length) {
      setStatus('Add at least one row.');
      return;
    }

    const session = await requireAuth();
    if (!session) return;
    const companyId = await getCompanyId(session);
    if (!companyId) {
      setStatus('Company profile missing. Add it from the main page.');
      return;
    }

    const payloads = [];
    const errors = [];

    rows.forEach((row, idx) => {
      const country = row.querySelector('[data-field="country"]')?.value || '';
      const region = row.querySelector('[data-field="region"]')?.value || '';
      const month = parseInt(row.querySelector('[data-field="month"]')?.value || '0', 10);
      const year = parseInt(row.querySelector('[data-field="year"]')?.value || '0', 10);
      const quantity = parseFloat(row.querySelector('[data-field="quantity"]')?.value || '');
      const unit = row.querySelector('[data-field="unit"]')?.value || '';
      const notes = String(row.querySelector('[data-field="notes"]')?.value || '').trim().slice(0, 240);

      const hasAny = [country, region, month, year, quantity, unit, notes].some((v) => v);
      if (!hasAny) return;

      if (!country || !region || !month || !year || !Number.isFinite(quantity) || quantity < 0 || !unit) {
        errors.push(`Row ${idx + 1}: complete country, region, month, year, quantity, and unit.`);
        return;
      }
      const site = sites.find((entry) => entry.country === country && entry.region === region);
      if (!site) {
        errors.push(`Row ${idx + 1}: select a configured site.`);
        return;
      }
      if (isFuturePeriod(year, month)) {
        errors.push(`Row ${idx + 1}: future billing periods are not allowed.`);
        return;
      }

      const factorData = getScope1Factor(country, region, unit);
      if (!factorData) {
        errors.push(`Row ${idx + 1}: no emission factor for this selection.`);
        return;
      }

      const emissions = quantity * factorData.factor;

      payloads.push({
        user_id: session.user.id,
        company_id: companyId,
        site_id: site.id,
        period_year: year,
        period_month: month,
        country,
        region,
        quantity,
        unit,
        notes: notes || null,
        emissions,
        factor_value: factorData.factor,
        factor_year: factorData.year,
        factor_source: factorData.source,
        factor_basis: factorData.basis,
        factor_label: factorData.label
      });
    });

    if (errors.length) {
      setStatus(errors[0]);
      return;
    }
    if (!payloads.length) {
      setStatus('Add at least one complete row.');
      return;
    }

    const { error } = await supabase
      .from('scope1_records')
      .upsert(payloads, { onConflict: 'user_id,company_id,period_year,period_month,country,region' });
    if (error) {
      console.warn('Scope 1 bulk add failed', error);
      setStatus('Save failed. Please try again.');
      return;
    }
    await loadData();
    closePanel();
  });
};

const attachHandlers = () => {
  if (scope1Table) {
    scope1Table.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      if (btn.getAttribute('data-action') === 'view') {
        openRecordPanel(id);
      }
    });
  }
  if (exportBtn) exportBtn.addEventListener('click', exportFiltered);
  if (addBtn) addBtn.addEventListener('click', openAddPanel);
  if (bulkBtn) bulkBtn.addEventListener('click', openBulkPanel);

  [filterYear, filterCountry, filterRegion].forEach((el) => {
    if (!el) return;
    el.addEventListener('change', () => {
      el.dataset.userSet = 'true';
      refreshView();
    });
  });

  if (signoutBtn) {
    signoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await supabase.auth.signOut();
      window.location.href = 'index.html';
    });
  }
};

const loadData = async () => {
  try {
    records = await fetchRecords();
  } catch (err) {
    console.warn('Scope 1 load failed', err);
    records = [];
  }
  refreshView();
};

(async () => {
  attachHandlers();
  const session = await requireAuth();
  if (!session) return;
  await loadCompanyDefaults(session);
  applySiteRestrictions();
  await loadData();
  supabase.auth.onAuthStateChange((_event) => {
    if (_event === 'SIGNED_OUT') {
      window.location.href = 'index.html';
    }
  });
})();

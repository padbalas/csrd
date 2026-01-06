import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SCOPE3_FACTOR_SETS, SCOPE3_CATEGORY_LIST, SCOPE3_DISCLOSURE } from '../data/scope3-eio.js';

const SUPABASE_URL = window.SUPABASE_URL || 'https://yyzyyjxmoggrmqsgrlxc.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5enl5anhtb2dncm1xc2dybHhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxMTQ4MzMsImV4cCI6MjA4MTY5MDgzM30.BhnHmz9ADB52B_VcMdzvdyFiPvZFj_Q-jfjRqeAoQM4';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

const scope3Table = document.getElementById('scope3Table');
const exportBtn = document.getElementById('scope3-export-csv');
const exportStatus = document.getElementById('scope3-export-status');
const addBtn = document.getElementById('scope3-add');
const bulkBtn = document.getElementById('scope3-bulk');
const panel = document.getElementById('scope3Panel');
const signoutBtn = document.getElementById('nav-signout');
const lockBanner = document.getElementById('scope3-lock-banner');
const scope3NavLink = document.querySelector('.nav-item[data-nav="scope3"]');
const navBrand = document.querySelector('.nav-brand');
const mobileBrand = document.querySelector('.mobile-brand');
const filterYear = document.getElementById('filterYear');
const filterCategory = document.getElementById('filterCategory');
const filterMethod = document.getElementById('filterMethod');
const filterCountry = document.getElementById('filterCountry');
const filterRegion = document.getElementById('filterRegion');
const totalEl = document.getElementById('scope3Total');
const actualsTotalEl = document.getElementById('scope3ActualsTotal');
const spendTotalEl = document.getElementById('scope3SpendTotal');
const avgEl = document.getElementById('scope3Avg');
const topEl = document.getElementById('scope3TopCategory');
const countEl = document.getElementById('scope3Count');

let records = [];
let reportingYearPreference = 'all';
let factorSet = null;
let companyCountry = '';
let companyRegion = '';
let entitlements = null;
let scope3Locked = false;

const getFactorSet = (countryCode) => SCOPE3_FACTOR_SETS[countryCode] || null;

const formatNumber = (n, digits = 2) => Number(n).toLocaleString(undefined, {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits
});

const formatTierLabel = (tier) => {
  if (!tier) return '';
  const label = tier === 'core' ? 'Core' : tier === 'complete' ? 'Complete' : 'Free';
  return label;
};

const setBrandLabel = (companyName, tier) => {
  const badge = tier ? formatTierLabel(tier) : '';
  const apply = (el) => {
    if (!el) return;
    el.textContent = '';
    if (companyName) {
      const nameEl = document.createElement('span');
      nameEl.className = 'brand-name';
      nameEl.textContent = companyName;
      el.appendChild(nameEl);
    }
    if (badge) {
      const badgeEl = document.createElement('span');
      badgeEl.className = 'brand-badge';
      badgeEl.textContent = badge;
      el.appendChild(badgeEl);
    }
  };
  apply(navBrand);
  apply(mobileBrand);
};

const updateNavBrand = (companyName, tier) => {
  setBrandLabel(companyName || '', tier);
};

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

const loadEntitlements = async (session) => {
  const companyId = await getCompanyId(session);
  if (!companyId) return null;
  const { data, error } = await supabase
    .from('entitlements')
    .select('tier,allow_scope3')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) return null;
  return data || null;
};

const updateScope3Nav = () => {
  if (!scope3NavLink) return;
  if (entitlements?.allow_scope3) {
    scope3NavLink.classList.remove('disabled');
    scope3NavLink.removeAttribute('aria-disabled');
    scope3NavLink.title = '';
  } else {
    scope3NavLink.classList.add('disabled');
    scope3NavLink.setAttribute('aria-disabled', 'true');
    scope3NavLink.title = 'Upgrade to CarbonWise Complete to unlock Scope 3.';
  }
};

const applyScope3Gate = () => {
  scope3Locked = !entitlements?.allow_scope3;
  if (lockBanner) {
    lockBanner.hidden = !scope3Locked;
  }
  if (addBtn) addBtn.disabled = scope3Locked;
  if (bulkBtn) bulkBtn.disabled = scope3Locked;
  if (exportBtn) exportBtn.disabled = scope3Locked;
  if (scope3Locked && exportStatus) {
    exportStatus.textContent = 'Upgrade to CarbonWise Complete to export Scope 3 data.';
  } else if (exportStatus) {
    exportStatus.textContent = '';
  }
};

const loadCompanyPreference = async () => {
  const { data, error } = await supabase
    .from('companies')
    .select('company_name,reporting_year_preference,country,region')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error || !data || !data.length) return;
  reportingYearPreference = data[0].reporting_year_preference || 'all';
  companyCountry = data[0].country || '';
  companyRegion = data[0].region || '';
  factorSet = SCOPE3_FACTOR_SETS[companyCountry] || null;
  updateNavBrand(data[0].company_name || '', entitlements?.tier);
};

const fetchRecords = async () => {
  const { data, error } = await supabase
    .from('scope3_records')
    .select('id,period_year,period_month,spend_country,spend_region,spend_amount,currency,category_id,category_label,vendor_name,notes,eio_sector,emission_factor_value,emission_factor_year,emission_factor_source,emission_factor_model,emission_factor_geo,emission_factor_currency,emissions,emissions_source,calculation_method,created_at')
    .order('period_year', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

const populateFilters = (rows) => {
  const years = new Set();
  const categories = new Set();
  const countries = new Set();
  const regions = new Set();
  rows.forEach((r) => {
    if (r.period_year) years.add(String(r.period_year));
    if (r.category_label) categories.add(r.category_label);
    if (r.spend_country) countries.add(r.spend_country);
    if (r.spend_region) regions.add(r.spend_region);
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

  if (filterCategory) {
    const current = filterCategory.value;
    filterCategory.innerHTML = '<option value="">All</option>';
    const source = categories.size
      ? Array.from(categories)
      : (factorSet?.categories || []).map((cat) => cat.label);
    source.sort().forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      filterCategory.appendChild(opt);
    });
    filterCategory.value = current;
  }

  if (filterCountry) {
    const current = filterCountry.value;
    filterCountry.innerHTML = '<option value="">All</option>';
    Array.from(countries).sort().forEach((country) => {
      const opt = document.createElement('option');
      opt.value = country;
      opt.textContent = country;
      filterCountry.appendChild(opt);
    });
    filterCountry.value = current;
  }

  if (filterRegion) {
    const current = filterRegion.value;
    filterRegion.innerHTML = '<option value="">All</option>';
    Array.from(regions).sort().forEach((region) => {
      const opt = document.createElement('option');
      opt.value = region;
      opt.textContent = region;
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
  const categoryVal = filterCategory?.value || '';
  const countryVal = filterCountry?.value || '';
  const regionVal = filterRegion?.value || '';
  const methodVal = filterMethod?.value || '';
  return rows.filter((r) => {
    const method = r.calculation_method || 'eio';
    const yearMatch = yearVal ? String(r.period_year) === yearVal : true;
    const categoryMatch = categoryVal ? r.category_label === categoryVal : true;
    const methodMatch = methodVal ? method === methodVal : true;
    const countryMatch = countryVal ? r.spend_country === countryVal : true;
    const regionMatch = regionVal ? r.spend_region === regionVal : true;
    return yearMatch && categoryMatch && methodMatch && countryMatch && regionMatch;
  });
};

const renderSummary = (rows) => {
  if (!totalEl || !avgEl || !topEl || !countEl || !actualsTotalEl || !spendTotalEl) return;
  if (!rows.length) {
    totalEl.textContent = '—';
    actualsTotalEl.textContent = '—';
    spendTotalEl.textContent = '—';
    avgEl.textContent = '—';
    topEl.textContent = '—';
    countEl.textContent = '—';
    return;
  }

  let total = 0;
  let actualsTotal = 0;
  let spendTotal = 0;
  const categories = {};
  const months = new Set();
  let missingMonthCount = 0;

  rows.forEach((r) => {
    const val = Number(r.emissions || 0);
    total += val;
    if ((r.calculation_method || 'eio') === 'actual') {
      actualsTotal += val;
    } else {
      spendTotal += val;
    }
    const label = r.category_label || '—';
    categories[label] = (categories[label] || 0) + val;
    if (r.period_month) {
      months.add(`${r.period_year}-${String(r.period_month).padStart(2, '0')}`);
    } else {
      missingMonthCount += 1;
    }
  });

  const topEntry = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  totalEl.textContent = total.toFixed(3);
  actualsTotalEl.textContent = actualsTotal.toFixed(3);
  spendTotalEl.textContent = spendTotal.toFixed(3);
  avgEl.textContent = months.size ? (total / months.size).toFixed(3) : total.toFixed(3);
  topEl.textContent = topEntry ? `${topEntry[0]} (${topEntry[1].toFixed(3)})` : '—';
  countEl.textContent = months.size + missingMonthCount;
};

const renderReminders = (rows) => {
  const listEl = document.getElementById('scope3ReminderList');
  if (!listEl) return;
  const reminders = [];

  if (!rows.length) {
    listEl.innerHTML = '<li class="placeholder">All looks good. No reminders right now.</li>';
    return;
  }

  const filterYearVal = filterYear?.value || '';
  const filterCountryVal = filterCountry?.value || '';
  const filterRegionVal = filterRegion?.value || '';
  const filterRegionLabel = filterCountryVal && filterRegionVal
    ? `${filterCountryVal} / ${filterRegionVal}`
    : '';
  const targetYear = filterYearVal
    ? parseInt(filterYearVal, 10)
    : reportingYearPreference === 'current'
      ? CURRENT_YEAR
      : reportingYearPreference === 'previous'
        ? CURRENT_YEAR - 1
        : null;

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const missingMonthCount = rows.filter((r) => !r.period_month).length;
  if (missingMonthCount) {
    reminders.push({ type: 'missing', text: `${missingMonthCount} Scope 3 records are missing a reporting month. Add a month for more accurate coverage.` });
  }
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
      reminders.push({ type: 'missing', text: `Missing ${rangeLabel} (${regionLabel}).` });
    });
  };

  if (targetYear) {
    const regionsPresent = Array.from(
      new Set(rows.map((r) => `${r.spend_country || '—'}${r.spend_region ? ' / ' + r.spend_region : ''}`))
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
          .filter((r) => `${r.spend_country || '—'}${r.spend_region ? ' / ' + r.spend_region : ''}` === regionLabel)
          .filter((r) => String(r.period_year) === String(targetYear))
          .filter((r) => r.period_month)
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
  const categories = {};
  rows.forEach((r) => {
    const val = Number(r.emissions || 0);
    total += val;
    const categoryLabel = r.category_label || '—';
    categories[categoryLabel] = (categories[categoryLabel] || 0) + val;
  });
  if (total > 0 && Object.keys(categories).length > 1) {
    Object.entries(categories).forEach(([category, val]) => {
      const share = val / total;
      if (share > 0.3) {
        reminders.push({ type: 'category', text: `${category} contributes ${ (share * 100).toFixed(0) }% of your Scope 3 screening emissions.` });
      }
    });
  }

  listEl.innerHTML = '';
  if (!reminders.length) {
    listEl.innerHTML = '<li class="placeholder">All looks good. No reminders right now.</li>';
    return;
  }
  reminders.forEach((r) => {
    const li = document.createElement('li');
    li.textContent = r.text;
    listEl.appendChild(li);
  });
};

const showMessage = (msg) => {
  if (!scope3Table) return;
  scope3Table.innerHTML = `<tr><td colspan="3" style="color:#4b5563;">${msg}</td></tr>`;
};

const renderTable = (rows) => {
  if (!scope3Table) return;
  scope3Table.innerHTML = '';
  if (!rows.length) {
    showMessage('No Scope 3 records match these filters. Add a record to include it in exports.');
    return;
  }
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const spend = `${formatNumber(row.spend_amount || 0, 2)} ${row.currency || ''}`;
    const vendor = row.vendor_name ? ` · ${row.vendor_name}` : '';
    const region = row.spend_region ? ` / ${row.spend_region}` : '';
    const methodLabel = row.calculation_method === 'actual' ? 'Actuals' : 'Spend-based';
    const monthLabel = row.period_month ? MONTHS[row.period_month - 1].slice(0, 3) : '—';
    tr.innerHTML = `
      <td>
        <div class="primary">${formatNumber(row.emissions || 0, 3)} tCO₂e</div>
        <div class="secondary">${monthLabel} ${row.period_year || ''} · ${row.spend_country || '—'}${region}</div>
      </td>
      <td>
        <div class="primary">${row.category_label || '—'}</div>
        <div class="secondary">${spend}${vendor}</div>
      </td>
      <td>${methodLabel}</td>
      <td class="actions">
        <button class="btn secondary" data-action="view" data-id="${row.id}">View</button>
      </td>
    `;
    scope3Table.appendChild(tr);
  });
};

const refreshView = () => {
  populateFilters(records);
  applyDefaultFilters();
  const filtered = applyFilters(records);
  renderSummary(filtered);
  renderReminders(filtered);
  renderTable(filtered);
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

const buildRecordDetails = (record) => {
  const methodLabel = record.calculation_method === 'actual' ? 'Actuals (vendor-reported)' : 'Spend-based (EIO)';
  const monthLabel = record.period_month ? MONTHS[record.period_month - 1] : '—';
  const spend = record.spend_amount != null ? `${formatNumber(record.spend_amount || 0, 2)} ${record.currency || ''}` : '—';
  const emissionsSource = record.emissions_source || '—';
  const actionRow = scope3Locked
    ? '<p class="note" style="margin:8px 0 0;">Read-only on your current plan. Upgrade to CarbonWise Complete to edit or delete.</p>'
    : `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">
        <button class="btn secondary" data-panel-edit="${record.id}" style="padding:10px 12px;">Edit</button>
        <button class="btn secondary" data-panel-delete="${record.id}" style="padding:10px 12px;">Delete</button>
      </div>
    `;
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;">
      <div>
        <div style="font-weight:700;font-size:1.05rem;">Record details</div>
        <div style="color:#4b5563;font-size:0.95rem;">${monthLabel} ${record.period_year || ''} • ${record.category_label || '—'}</div>
      </div>
      <button type="button" class="btn secondary" data-close-panel style="padding:8px 10px;">×</button>
    </div>
    <div style="display:grid;gap:10px;">
      <div><strong>Method</strong><br>${methodLabel}</div>
      <div><strong>Spend</strong><br>${spend}</div>
      <div><strong>Spend country / region</strong><br>${record.spend_country || '—'}${record.spend_region ? ' / ' + record.spend_region : ''}</div>
      <div><strong>Vendor (optional)</strong><br>${record.vendor_name || '—'}</div>
      <div><strong>Notes</strong><br>${record.notes || '—'}</div>
      <div><strong>Emissions</strong><br>${formatNumber(record.emissions || 0, 3)} tCO₂e</div>
      <div><strong>Emissions source</strong><br>${emissionsSource}</div>
      <div><strong>EIO sector</strong><br>${record.eio_sector || '—'}</div>
      <div><strong>Emission factor</strong><br>${record.emission_factor_value ? `${formatNumber(record.emission_factor_value, 6)} tCO₂e/${record.emission_factor_currency || ''}` : '—'}</div>
      <div><strong>Factor source</strong><br>${record.emission_factor_source ? `${record.emission_factor_source} • ${record.emission_factor_year}` : '—'}</div>
      <div><strong>Model / geography</strong><br>${record.emission_factor_model ? `${record.emission_factor_model} • ${record.emission_factor_geo}` : '—'}</div>
      <p style="color:#4b5563;font-size:0.95rem;margin:8px 0 0;">${SCOPE3_DISCLOSURE}</p>
      ${actionRow}
    </div>
  `;
};

const buildEditPanel = (record) => {
  const methodLabel = record.calculation_method === 'actual' ? 'Vendor-reported actuals' : 'Spend-based (EIO)';
  const monthLabel = record.period_month ? MONTHS[record.period_month - 1] : '';
  const currencyLabel = record.currency || '';
  const spendRow = record.calculation_method === 'actual'
    ? ''
    : `
      <div class="panel-row">
        <label>
          Spend amount
          <input type="number" id="edit-spend" min="0" step="any" value="${record.spend_amount ?? ''}" />
        </label>
        <label>
          Currency
          <select id="edit-currency" disabled>
            <option value="${currencyLabel}">${currencyLabel || '—'}</option>
          </select>
        </label>
      </div>
    `;
  const actualRow = record.calculation_method === 'actual'
    ? `
      <div class="panel-row">
        <label>
          Emissions (tCO2e)
          <input type="number" id="edit-emissions" min="0" step="any" value="${record.emissions ?? ''}" />
        </label>
        <label>
          Emissions source (optional)
          <input type="text" id="edit-emissions-source" maxlength="160" value="${record.emissions_source || ''}" />
        </label>
      </div>
    `
    : '';

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;">
      <div>
        <div style="font-weight:700;font-size:1.05rem;">Edit Scope 3 record</div>
        <div style="color:#4b5563;font-size:0.95rem;">${methodLabel} · ${record.category_label || '—'}</div>
      </div>
      <button type="button" class="btn secondary" data-close-panel style="padding:8px 10px;">×</button>
    </div>
    <form id="edit-scope3-form" class="panel-form">
      <div class="panel-row">
        <label>
          Reporting year
          <select id="edit-year" required></select>
        </label>
        <label>
          Reporting month
          <select id="edit-month" required></select>
        </label>
      </div>
      ${spendRow}
      ${actualRow}
      <div class="panel-row single">
        <label>
          Vendor name (optional)
          <input type="text" id="edit-vendor" maxlength="120" value="${record.vendor_name || ''}" />
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
  if (scope3Locked) return;
  openPanel(buildEditPanel(record));
  const form = panel?.querySelector('#edit-scope3-form');
  const yearEl = panel?.querySelector('#edit-year');
  const monthEl = panel?.querySelector('#edit-month');
  const spendEl = panel?.querySelector('#edit-spend');
  const emissionsEl = panel?.querySelector('#edit-emissions');
  const emissionsSourceEl = panel?.querySelector('#edit-emissions-source');
  const vendorEl = panel?.querySelector('#edit-vendor');
  const notesEl = panel?.querySelector('#edit-notes');
  const statusEl = panel?.querySelector('#edit-status');

  if (!form || !yearEl || !monthEl) return;
  populateYears(yearEl);
  populateMonths(monthEl);
  yearEl.value = String(record.period_year || '');
  monthEl.value = record.period_month ? String(record.period_month) : '';

  const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('');
    const year = parseInt(yearEl.value, 10);
    const month = parseInt(monthEl.value, 10);
    if (!year || !month) {
      setStatus('Select a valid year and month.');
      return;
    }
    if (year > CURRENT_YEAR || (year === CURRENT_YEAR && month > CURRENT_MONTH)) {
      setStatus('Future months are not allowed.');
      return;
    }

    const vendor = String(vendorEl?.value || '').trim().slice(0, 120) || null;
    const notes = String(notesEl?.value || '').trim().slice(0, 240) || null;

    if (record.calculation_method === 'actual') {
      const emissions = Number(emissionsEl?.value || '');
      if (!Number.isFinite(emissions) || emissions < 0) {
        setStatus('Enter a valid emissions value (tCO2e >= 0).');
        return;
      }
      const emissionsSource = String(emissionsSourceEl?.value || '').trim().slice(0, 160) || null;
      const { error } = await supabase
        .from('scope3_records')
        .update({
          period_year: year,
          period_month: month,
          emissions,
          emissions_source: emissionsSource,
          vendor_name: vendor,
          notes
        })
        .eq('id', record.id);
      if (error) {
        setStatus('Save failed. Please try again.');
        return;
      }
    } else {
      const spend = Number(spendEl?.value || '');
      if (!Number.isFinite(spend) || spend < 0) {
        setStatus('Enter a valid spend amount (>= 0).');
        return;
      }
      const factorValue = Number(record.emission_factor_value || 0);
      const emissions = factorValue ? spend * factorValue : spend;
      const { error } = await supabase
        .from('scope3_records')
        .update({
          period_year: year,
          period_month: month,
          spend_amount: spend,
          emissions,
          vendor_name: vendor,
          notes
        })
        .eq('id', record.id);
      if (error) {
        setStatus('Save failed. Please try again.');
        return;
      }
    }

    await loadData();
    panel?.classList.remove('active');
    panel?.classList.add('hidden');
    if (panel) panel.innerHTML = '';
  });
};

const handleDeleteRecord = async (record) => {
  if (scope3Locked) return;
  const confirmDelete = confirm('Delete this record?');
  if (!confirmDelete) return;
  const { error } = await supabase.from('scope3_records').delete().eq('id', record.id);
  if (error) {
    alert('Delete failed. Please try again.');
    return;
  }
  await loadData();
  panel?.classList.remove('active');
  panel?.classList.add('hidden');
  if (panel) panel.innerHTML = '';
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

const populateCategories = (el) => {
  el.innerHTML = '<option value="">Select category</option>';
  const categories = factorSet?.categories || SCOPE3_CATEGORY_LIST;
  categories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.label;
    el.appendChild(opt);
  });
};

const populateCurrencies = (el) => {
  el.innerHTML = '<option value="">Select currency</option>';
  const currency = factorSet?.currency ? [factorSet.currency] : [];
  currency.forEach((code) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = code;
    el.appendChild(opt);
  });
};

const populateCountries = (el) => {
  el.innerHTML = '<option value="">Select country</option>';
  COUNTRY_OPTIONS.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.value;
    opt.textContent = c.label;
    el.appendChild(opt);
  });
};

const populateMonths = (el) => {
  if (!el) return;
  el.innerHTML = '<option value="">Select month</option>';
  MONTHS.forEach((m, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx + 1);
    opt.textContent = m;
    el.appendChild(opt);
  });
};

const setRegionOptions = (country, regionEl) => {
  if (!regionEl) return;
  const opts = REGION_OPTIONS[country] || [];
  regionEl.innerHTML = '<option value="">Select region</option>';
  opts.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    regionEl.appendChild(opt);
  });
};

const buildAddPanel = () => `
  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;">
    <div>
      <div style="font-weight:700;font-size:1.05rem;">Add Scope 3 record</div>
      <div style="color:#4b5563;font-size:0.95rem;">Choose spend-based screening or vendor-reported actuals.</div>
    </div>
    <button type="button" class="btn secondary" data-close-panel style="padding:8px 10px;">×</button>
  </div>
  <form id="add-scope3-form" class="panel-form">
    <div class="panel-row">
      <label>
        Reporting year
        <select id="add-year" required></select>
      </label>
      <label>
        Reporting month
        <select id="add-month" required></select>
      </label>
    </div>
    <div class="panel-row">
      <label>
        Category
        <select id="add-category" required></select>
      </label>
      <label>
        Method
        <select id="add-method" required>
          <option value="eio">Spend-based (EIO)</option>
          <option value="actual">Vendor-reported actuals</option>
        </select>
      </label>
    </div>
    <div class="panel-row single">
      <label>
        Vendor name (optional)
        <input type="text" id="add-vendor" maxlength="120" placeholder="Optional vendor reference" />
      </label>
    </div>
    <div class="panel-row">
      <label>
        Spend country
        <select id="add-country" required></select>
      </label>
      <label>
        Spend region
        <select id="add-region" required></select>
      </label>
    </div>
    <div class="panel-row" data-method="eio">
      <label>
        Spend amount
        <input type="number" id="add-spend" min="0" step="any" placeholder="e.g., 12000" required />
      </label>
      <label>
        Currency
        <select id="add-currency" required></select>
      </label>
    </div>
    <div class="panel-row" data-method="actual">
      <label>
        Emissions (tCO2e)
        <input type="number" id="add-emissions" min="0" step="any" placeholder="e.g., 4.25" />
      </label>
      <label>
        Emissions source (optional)
        <input type="text" id="add-emissions-source" maxlength="160" placeholder="e.g., AWS customer carbon report" />
      </label>
    </div>
    <div class="panel-row single">
      <label>
        Notes (optional)
        <input type="text" id="add-notes" maxlength="240" placeholder="Optional context for this entry" />
      </label>
    </div>
    <div class="panel-hint" data-method="eio">Spend-based EIO factors are screening-level only; no supplier-specific data is used.</div>
    <div class="panel-hint" data-method="eio">Factor set: ${companyCountry || '—'} · ${factorSet?.model || '—'} · ${factorSet?.currency || '—'}.</div>
    <div class="panel-hint" data-method="actual">Actuals should match the vendor-reported emissions for the selected period and category.</div>
    <div class="panel-actions">
      <button type="submit" class="btn primary">Save record</button>
    </div>
    <p class="panel-status" id="add-status"></p>
  </form>
`;

const openAddPanel = () => {
  if (scope3Locked) {
    if (exportStatus) exportStatus.textContent = 'Upgrade to CarbonWise Complete to add Scope 3 records.';
    return;
  }
  openPanel(buildAddPanel());
  const form = panel?.querySelector('#add-scope3-form');
  const yearEl = panel?.querySelector('#add-year');
  const monthEl = panel?.querySelector('#add-month');
  const categoryEl = panel?.querySelector('#add-category');
  const methodEl = panel?.querySelector('#add-method');
  const countryEl = panel?.querySelector('#add-country');
  const regionEl = panel?.querySelector('#add-region');
  const spendEl = panel?.querySelector('#add-spend');
  const currencyEl = panel?.querySelector('#add-currency');
  const vendorEl = panel?.querySelector('#add-vendor');
  const notesEl = panel?.querySelector('#add-notes');
  const emissionsEl = panel?.querySelector('#add-emissions');
  const emissionsSourceEl = panel?.querySelector('#add-emissions-source');
  const statusEl = panel?.querySelector('#add-status');
  if (!form || !yearEl || !monthEl || !categoryEl || !methodEl || !countryEl || !regionEl) return;

  populateYears(yearEl);
  populateMonths(monthEl);
  populateCategories(categoryEl);
  populateCountries(countryEl);
  if (companyCountry) countryEl.value = companyCountry;
  setRegionOptions(countryEl.value, regionEl);
  factorSet = getFactorSet(countryEl.value);
  if (currencyEl) {
    populateCurrencies(currencyEl);
    if (currencyEl.options.length === 1) {
      currencyEl.value = currencyEl.options[0].value;
    }
  }
  countryEl.addEventListener('change', () => {
    factorSet = getFactorSet(countryEl.value);
    if (currencyEl) populateCurrencies(currencyEl);
    setRegionOptions(countryEl.value, regionEl);
    if (currencyEl && currencyEl.options.length === 1) {
      currencyEl.value = currencyEl.options[0].value;
    }
  });

  const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };
  const toggleMethodFields = () => {
    const method = methodEl?.value || 'eio';
    panel?.querySelectorAll('[data-method]').forEach((el) => {
      const show = el.getAttribute('data-method') === method;
      el.style.display = show ? '' : 'none';
    });
    if (spendEl) spendEl.required = method === 'eio';
    if (currencyEl) currencyEl.required = method === 'eio';
    if (emissionsEl) emissionsEl.required = method === 'actual';
  };
  toggleMethodFields();
  methodEl.addEventListener('change', toggleMethodFields);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('');
    const year = parseInt(yearEl.value, 10);
    const month = parseInt(monthEl.value, 10);
    const categoryId = categoryEl.value;
    const method = methodEl.value || 'eio';
    const spendCountry = countryEl.value;
    const spendRegion = regionEl.value;
    const spend = parseFloat(spendEl?.value || '');
    const currency = currencyEl?.value || '';
    const vendor = String(vendorEl?.value || '').trim().slice(0, 120);
    const notes = String(notesEl?.value || '').trim().slice(0, 240);
    const emissions = parseFloat(emissionsEl?.value || '');
    const emissionsSource = String(emissionsSourceEl?.value || '').trim().slice(0, 160);

    if (!year || !month || !categoryId || !spendCountry || !spendRegion) {
      setStatus('Complete year, month, category, country, and region.');
      return;
    }
    if (year > CURRENT_YEAR) {
      setStatus('Future reporting years are not allowed.');
      return;
    }
    if (year === CURRENT_YEAR && month > CURRENT_MONTH) {
      setStatus('Future months are not allowed.');
      return;
    }
    factorSet = getFactorSet(spendCountry);
    const category = factorSet?.categories.find((c) => c.id === categoryId);
    if (!category) {
      setStatus('Select a valid category.');
      return;
    }
    if (method === 'eio') {
      if (!currency || !Number.isFinite(spend) || spend < 0) {
        setStatus('Complete spend and currency (spend must be >= 0).');
        return;
      }
      if (!factorSet) {
        setStatus('No factor set available for the selected spend country.');
        return;
      }
      if (factorSet.currency !== currency) {
        setStatus(`This category uses ${factorSet.currency} factors only.`);
        return;
      }
    } else {
      if (!Number.isFinite(emissions) || emissions < 0) {
        setStatus('Enter a valid emissions value (tCO2e >= 0).');
        return;
      }
    }

    const session = await requireAuth();
    if (!session) return;
    const companyId = await getCompanyId(session);
    if (!companyId) {
      setStatus('Company profile missing. Add it from the main page.');
      return;
    }

    const emissionsValue = method === 'eio' ? spend * category.factor : emissions;
    const payload = {
      user_id: session.user.id,
      company_id: companyId,
      period_year: year,
      period_month: month,
      spend_country: spendCountry,
      spend_region: spendRegion,
      spend_amount: method === 'eio' ? spend : null,
      currency: method === 'eio' ? currency : null,
      category_id: category.id,
      category_label: category.label,
      vendor_name: vendor || null,
      notes: notes || null,
      eio_sector: method === 'eio' ? category.eio_sector : null,
      emission_factor_value: method === 'eio' ? category.factor : null,
      emission_factor_year: method === 'eio' ? factorSet?.year : null,
      emission_factor_source: method === 'eio' ? factorSet?.source : null,
      emission_factor_model: method === 'eio' ? factorSet?.model : null,
      emission_factor_geo: method === 'eio' ? factorSet?.geo : null,
      emission_factor_currency: method === 'eio' ? factorSet?.currency : null,
      emissions_source: method === 'actual' ? (emissionsSource || null) : null,
      calculation_method: method,
      emissions: emissionsValue
    };

    const { error } = await supabase.from('scope3_records').insert(payload);
    if (error) {
      console.warn('Scope 3 save failed', error);
      setStatus('Save failed. Please try again.');
      return;
    }
    await loadData();
    panel?.classList.remove('active');
    panel?.classList.add('hidden');
    if (panel) panel.innerHTML = '';
  });
};

const buildBulkPanel = () => `
  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;">
    <div>
      <div style="font-weight:700;font-size:1.05rem;">Bulk add Scope 3 records</div>
      <div style="color:#4b5563;font-size:0.95rem;">Add multiple spend or actuals entries at once.</div>
    </div>
    <button type="button" class="btn secondary" data-close-panel style="padding:8px 10px;">×</button>
  </div>
  <div class="panel-hint">Choose spend-based (EIO) or vendor-reported actuals per row.</div>
  <form id="bulk-form" class="panel-form">
    <div id="bulk-rows"></div>
    <div class="panel-actions">
      <button type="button" class="btn secondary" id="bulk-add-row">Add row</button>
      <button type="submit" class="btn primary">Save rows</button>
    </div>
    <p class="panel-status" id="bulk-status"></p>
  </form>
`;

const toggleBulkMethod = (row, method) => {
  row.querySelectorAll('[data-method]').forEach((el) => {
    const show = el.getAttribute('data-method') === method;
    el.style.display = show ? '' : 'none';
  });
};

const createBulkRow = () => {
  const row = document.createElement('div');
  row.className = 'bulk-row';
  row.innerHTML = `
    <div class="panel-row">
      <label>
        Reporting year
        <select data-field="year"></select>
      </label>
      <label>
        Reporting month
        <select data-field="month"></select>
      </label>
    </div>
    <div class="panel-row">
      <label>
        Category
        <select data-field="category"></select>
      </label>
      <label>
        Method
        <select data-field="method">
          <option value="eio">Spend-based (EIO)</option>
          <option value="actual">Vendor-reported actuals</option>
        </select>
      </label>
    </div>
    <div class="panel-row single">
      <label>
        Vendor name (optional)
        <input type="text" data-field="vendor" maxlength="120" placeholder="Optional vendor reference" />
      </label>
    </div>
    <div class="panel-row">
      <label>
        Spend country
        <select data-field="country"></select>
      </label>
      <label>
        Spend region
        <select data-field="region"></select>
      </label>
    </div>
    <div class="panel-row" data-method="eio">
      <label>
        Spend amount
        <input type="number" data-field="spend" min="0" step="any" placeholder="e.g., 12000" />
      </label>
      <label>
        Currency
        <select data-field="currency"></select>
      </label>
    </div>
    <div class="panel-row" data-method="actual">
      <label>
        Emissions (tCO2e)
        <input type="number" data-field="emissions" min="0" step="any" placeholder="e.g., 4.25" />
      </label>
      <label>
        Emissions source (optional)
        <input type="text" data-field="emissionsSource" maxlength="160" placeholder="e.g., AWS carbon report" />
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

  const yearEl = row.querySelector('[data-field="year"]');
  const monthEl = row.querySelector('[data-field="month"]');
  const categoryEl = row.querySelector('[data-field="category"]');
  const methodEl = row.querySelector('[data-field="method"]');
  const countryEl = row.querySelector('[data-field="country"]');
  const regionEl = row.querySelector('[data-field="region"]');
  const currencyEl = row.querySelector('[data-field="currency"]');
  if (yearEl && monthEl && categoryEl && methodEl && countryEl && regionEl && currencyEl) {
    populateYears(yearEl);
    populateMonths(monthEl);
    populateCategories(categoryEl);
    populateCountries(countryEl);
    if (companyCountry) countryEl.value = companyCountry;
    setRegionOptions(countryEl.value, regionEl);
    const rowFactorSet = getFactorSet(countryEl.value);
    currencyEl.innerHTML = '<option value="">Select currency</option>';
    if (rowFactorSet?.currency) {
      const opt = document.createElement('option');
      opt.value = rowFactorSet.currency;
      opt.textContent = rowFactorSet.currency;
      currencyEl.appendChild(opt);
      currencyEl.value = rowFactorSet.currency;
    }
    countryEl.addEventListener('change', () => {
      const selectedSet = getFactorSet(countryEl.value);
      currencyEl.innerHTML = '<option value="">Select currency</option>';
      setRegionOptions(countryEl.value, regionEl);
      if (selectedSet?.currency) {
        const opt = document.createElement('option');
        opt.value = selectedSet.currency;
        opt.textContent = selectedSet.currency;
        currencyEl.appendChild(opt);
        currencyEl.value = selectedSet.currency;
      }
    });
    toggleBulkMethod(row, methodEl.value || 'eio');
    methodEl.addEventListener('change', () => toggleBulkMethod(row, methodEl.value || 'eio'));
  }
  const removeBtn = row.querySelector('[data-remove-row]');
  if (removeBtn) removeBtn.addEventListener('click', () => row.remove());
  return row;
};

const openBulkPanel = () => {
  if (scope3Locked) {
    if (exportStatus) exportStatus.textContent = 'Upgrade to CarbonWise Complete to add Scope 3 records.';
    return;
  }
  openPanel(buildBulkPanel());
  const rowsEl = panel?.querySelector('#bulk-rows');
  const addRowBtn = panel?.querySelector('#bulk-add-row');
  const form = panel?.querySelector('#bulk-form');
  const statusEl = panel?.querySelector('#bulk-status');
  if (!rowsEl || !addRowBtn || !form) return;

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
    if (!factorSet) {
      setStatus('No factor set available for your company country.');
      return;
    }

    const payloads = [];
    const errors = [];

    rows.forEach((row, idx) => {
      const year = parseInt(row.querySelector('[data-field="year"]')?.value || '0', 10);
      const month = parseInt(row.querySelector('[data-field="month"]')?.value || '0', 10);
      const categoryId = row.querySelector('[data-field="category"]')?.value || '';
      const spendCountry = row.querySelector('[data-field="country"]')?.value || '';
      const spendRegion = row.querySelector('[data-field="region"]')?.value || '';
      const method = row.querySelector('[data-field="method"]')?.value || 'eio';
      const spend = parseFloat(row.querySelector('[data-field="spend"]')?.value || '');
      const currency = row.querySelector('[data-field="currency"]')?.value || '';
      const vendor = String(row.querySelector('[data-field="vendor"]')?.value || '').trim().slice(0, 120);
      const notes = String(row.querySelector('[data-field="notes"]')?.value || '').trim().slice(0, 240);
      const emissions = parseFloat(row.querySelector('[data-field="emissions"]')?.value || '');
      const emissionsSource = String(row.querySelector('[data-field="emissionsSource"]')?.value || '').trim().slice(0, 160);

      const hasAny = [year, month, categoryId, spendCountry, spendRegion, spend, currency, vendor, notes, emissions, emissionsSource].some((v) => v);
      if (!hasAny) return;

      if (!year || !month || !categoryId || !spendCountry || !spendRegion) {
        errors.push(`Row ${idx + 1}: complete year, month, category, country, and region.`);
        return;
      }
      if (year > CURRENT_YEAR) {
        errors.push(`Row ${idx + 1}: future reporting years are not allowed.`);
        return;
      }
      if (year === CURRENT_YEAR && month > CURRENT_MONTH) {
        errors.push(`Row ${idx + 1}: future months are not allowed.`);
        return;
      }
      const rowFactorSet = getFactorSet(spendCountry);
      const category = rowFactorSet.categories.find((c) => c.id === categoryId);
      if (!category) {
        errors.push(`Row ${idx + 1}: select a valid category.`);
        return;
      }
      if (method === 'eio') {
        if (!rowFactorSet) {
          errors.push(`Row ${idx + 1}: no factor set for ${spendCountry}.`);
          return;
        }
        if (!currency || !Number.isFinite(spend) || spend < 0) {
          errors.push(`Row ${idx + 1}: complete spend and currency (spend >= 0).`);
          return;
        }
        if (rowFactorSet.currency !== currency) {
          errors.push(`Row ${idx + 1}: use ${rowFactorSet.currency} for this category.`);
          return;
        }
      } else {
        if (!Number.isFinite(emissions) || emissions < 0) {
          errors.push(`Row ${idx + 1}: enter emissions (tCO2e >= 0).`);
          return;
        }
      }

      const emissionsValue = method === 'eio' ? spend * category.factor : emissions;
      payloads.push({
        user_id: session.user.id,
        company_id: companyId,
        period_year: year,
        period_month: month,
        spend_country: spendCountry,
        spend_region: spendRegion,
        spend_amount: method === 'eio' ? spend : null,
        currency: method === 'eio' ? currency : null,
        category_id: category.id,
        category_label: category.label,
        vendor_name: vendor || null,
        notes: notes || null,
        eio_sector: method === 'eio' ? category.eio_sector : null,
        emission_factor_value: method === 'eio' ? category.factor : null,
        emission_factor_year: method === 'eio' ? rowFactorSet?.year : null,
        emission_factor_source: method === 'eio' ? rowFactorSet?.source : null,
        emission_factor_model: method === 'eio' ? rowFactorSet?.model : null,
        emission_factor_geo: method === 'eio' ? rowFactorSet?.geo : null,
        emission_factor_currency: method === 'eio' ? rowFactorSet?.currency : null,
        emissions_source: method === 'actual' ? (emissionsSource || null) : null,
        calculation_method: method,
        emissions: emissionsValue
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

    const { error } = await supabase.from('scope3_records').insert(payloads);
    if (error) {
      console.warn('Scope 3 bulk add failed', error);
      setStatus('Save failed. Please try again.');
      return;
    }
    await loadData();
    panel?.classList.remove('active');
    panel?.classList.add('hidden');
    if (panel) panel.innerHTML = '';
  });
};

const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const toCsv = (rows) => {
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
    'Disclosure text'
  ];
  const data = rows.map((r) => ([
    'Scope 3',
    r.calculation_method === 'actual' ? 'Actuals' : 'Spend-based',
    r.period_month ? `${r.period_year}-${String(r.period_month).padStart(2, '0')}` : `${r.period_year || ''}`,
    r.category_label || '',
    r.spend_amount ?? '',
    r.currency || '',
    r.eio_sector || '',
    r.emission_factor_value ?? '',
    r.emission_factor_year ?? '',
    r.emission_factor_source ?? '',
    r.emissions_source ?? '',
    r.emissions ?? '',
    SCOPE3_DISCLOSURE
  ]));
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
  if (scope3Locked) {
    if (exportStatus) exportStatus.textContent = 'Upgrade to CarbonWise Complete to export Scope 3 data.';
    return;
  }
  exportBtn.disabled = true;
  if (exportStatus) exportStatus.textContent = 'Preparing export...';
  try {
    const filtered = applyFilters(records);
    if (!filtered.length) {
      if (exportStatus) exportStatus.textContent = 'No records match these filters.';
      return;
    }
    const yearVal = filterYear?.value || '';
    const namePart = yearVal ? `${yearVal}` : 'filtered';
    downloadCsv(toCsv(filtered), `carbonwise_scope3_${namePart}.csv`);
    if (exportStatus) exportStatus.textContent = 'Exported with current filters.';
  } catch (err) {
    console.warn('Scope 3 export failed', err);
    if (exportStatus) exportStatus.textContent = 'Could not export right now.';
  } finally {
    exportBtn.disabled = false;
  }
};

const attachHandlers = () => {
  if (scope3Table) {
    scope3Table.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      if (btn.getAttribute('data-action') === 'view') {
        openRecordPanel(btn.getAttribute('data-id'));
      }
    });
  }
  if (exportBtn) exportBtn.addEventListener('click', exportFiltered);
  if (addBtn) addBtn.addEventListener('click', openAddPanel);
  if (bulkBtn) bulkBtn.addEventListener('click', openBulkPanel);
  [filterYear, filterCategory, filterCountry, filterRegion].forEach((el) => {
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
    console.warn('Scope 3 load failed', err);
    records = [];
  }
  refreshView();
};

(async () => {
  attachHandlers();
  const session = await requireAuth();
  if (!session) return;
  entitlements = await loadEntitlements(session);
  updateScope3Nav();
  applyScope3Gate();
  updateNavBrand('', entitlements?.tier);
  await loadCompanyPreference();
  await loadData();
  supabase.auth.onAuthStateChange((_event) => {
    if (_event === 'SIGNED_OUT') {
      window.location.href = 'index.html';
    }
  });
})();

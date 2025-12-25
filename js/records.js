const STORAGE_KEY = 'cw_records';

const formatNumber = (n, digits = 2) =>
  Number(n).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });

const loadRecords = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveRecords = (records = []) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    /* ignore write errors (e.g., private mode) */
  }
  return records;
};

const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const detectMethod = (row) => (row.market_based_emissions != null ? 'market' : 'location');

const applyFilters = (records) => {
  const yearEl = document.getElementById('filterYear');
  const countryEl = document.getElementById('filterCountry');
  const regionEl = document.getElementById('filterRegion');
  const methodEl = document.getElementById('filterMethod');
  const yearFilter = yearEl?.value || '';
  const countryFilter = (countryEl?.value || '').toLowerCase();
  const regionFilter = (regionEl?.value || '').toLowerCase();
  const methodFilter = methodEl?.value || '';
  return records.filter((r) => {
    const yearMatch = yearFilter ? String(r.period_year || r.year) === yearFilter : true;
    const countryLabel = (r.calc_country || '—').toLowerCase();
    const regionLabel = (r.calc_region || '').toLowerCase();
    const countryMatch = countryFilter ? countryLabel === countryFilter : true;
    const regionMatch = regionFilter ? regionLabel === regionFilter : true;
    const method = detectMethod(r);
    const methodMatch = methodFilter ? method === methodFilter : true;
    return yearMatch && countryMatch && regionMatch && methodMatch;
  });
};

const getFilteredRecords = () => applyFilters(loadRecords());
const getAllYears = (records) => {
  const years = new Set();
  records.forEach((r) => {
    if (r.period_year || r.year) years.add(String(r.period_year || r.year));
  });
  return Array.from(years).sort((a, b) => b.localeCompare(a));
};

const populateFilters = (records) => {
  const years = new Set();
  const countries = new Set();
  const regions = new Set();
  records.forEach((r) => {
    if (r.period_year || r.year) years.add(String(r.period_year || r.year));
    countries.add(r.calc_country || '—');
    if (r.calc_region) regions.add(r.calc_region);
  });
  const yearEl = document.getElementById('filterYear');
  const countryEl = document.getElementById('filterCountry');
  const regionEl = document.getElementById('filterRegion');
  if (yearEl) {
    const current = yearEl.value;
    yearEl.innerHTML = '<option value=\"\">All</option>';
    Array.from(years).sort((a, b) => b.localeCompare(a)).forEach((y) => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      yearEl.appendChild(opt);
    });
    yearEl.value = current;
  }
  if (countryEl) {
    const currentC = countryEl.value;
    countryEl.innerHTML = '<option value=\"\">All</option>';
    Array.from(countries).sort().forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      countryEl.appendChild(opt);
    });
    countryEl.value = currentC;
  }
  if (regionEl) {
    const currentR = regionEl.value;
    regionEl.innerHTML = '<option value=\"\">All</option>';
    Array.from(regions).sort().forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      regionEl.appendChild(opt);
    });
    regionEl.value = currentR;
  }
};

const renderRecords = (containerId) => {
  const container = document.getElementById(containerId);
  if (!container) return;
  const records = getFilteredRecords();
  populateFilters(records);
  const rows = applyFilters(records);
  container.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="3" style="color:#4b5563;">No records match these filters.</td>`;
    container.appendChild(tr);
    return;
  }
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const monthName = monthNames[(row.period_month || row.month || 1) - 1] || '';
    const region = `${row.calc_country || '—'}${row.calc_region ? ' / ' + row.calc_region : ''}`;
    const method = detectMethod(row) === 'market' ? 'Market-based' : 'Location-based';
    tr.innerHTML = `
      <td>
        <div class="primary">${formatNumber(row.location_based_emissions || row.emissions || 0, 3)} t CO₂e</div>
        <div class="secondary">${monthName} ${row.period_year || row.year || ''} · ${region}</div>
      </td>
      <td class="method">${method}</td>
      <td class="actions">
        <button class="btn secondary" onclick="window.openRecordPanel ? window.openRecordPanel('${row.id}') : (window.openRecord && window.openRecord('${row.id}'));">View</button>
      </td>
    `;
    container.appendChild(tr);
  });
};

const openRecord = (recordId) => {
  const rows = loadRecords();
  return rows.find((r) => String(r.id) === String(recordId)) || null;
};

const buildRecordDetails = (record) => {
  if (!record) return '';
  const formatNumber = (n, digits = 2) =>
    Number(n).toLocaleString(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits
    });
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;">
      <div>
        <div style="font-weight:700;font-size:1.05rem;">Record details</div>
        <div style="color:#4b5563;font-size:0.95rem;">${record.period_year}-${String(record.period_month).padStart(2, '0')} • ${record.companies?.company_name || '—'}</div>
      </div>
      <button type="button" class="btn secondary" data-close-panel style="padding:8px 10px;">×</button>
    </div>
    <div style="display:grid;gap:10px;">
      <div><strong>Country / region</strong><br>${record.calc_country || '—'}${record.calc_region ? ' / ' + record.calc_region : ''}</div>
      <div><strong>Electricity (kWh)</strong><br>${formatNumber(record.kwh, 0)}</div>
      <div><strong>Location-based</strong><br>${formatNumber(record.location_based_emissions, 3)} t CO₂e</div>
      <div><strong>Market-based</strong><br>${record.market_based_emissions != null ? formatNumber(record.market_based_emissions, 3) + ' t CO₂e' : '—'}</div>
      <div><strong>Emission factor</strong><br>${formatNumber(record.emission_factor_value, 6)} t CO₂e/kWh</div>
      <div><strong>Factor source</strong><br>${record.emission_factor_source} ${record.emission_factor_year}</div>
      <p style="color:#4b5563;font-size:0.95rem;margin:8px 0 0;">Location-based Scope 2 calculation aligned with the GHG Protocol.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">
        <button class="btn secondary" data-panel-edit="${record.id}" style="padding:10px 12px;">Edit</button>
        <button class="btn secondary" data-panel-delete="${record.id}" style="padding:10px 12px;">Delete</button>
      </div>
    </div>
  `;
};

const openRecordPanel = (recordId, panelId = 'recordPanel') => {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const record = openRecord(recordId);
  if (!record) return;
  panel.innerHTML = buildRecordDetails(record);
  panel.classList.remove('hidden');
  panel.classList.add('active');
  const closeBtn = panel.querySelector('[data-close-panel]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      panel.classList.remove('active');
      panel.classList.add('hidden');
    }, { once: true });
  }
  const editBtn = panel.querySelector('[data-panel-edit]');
  const deleteBtn = panel.querySelector('[data-panel-delete]');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      if (typeof window.onRecordEdit === 'function') {
        window.onRecordEdit(recordId);
      }
    });
  }
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (typeof window.onRecordDelete === 'function') {
        window.onRecordDelete(recordId);
      }
    });
  }
};

const computeCarbonSummary = (records = loadRecords()) => {
  if (!records.length) return null;

  let total = 0;
  const regions = {};
  const months = new Set();

  records.forEach((r) => {
    const val = Number(r.location_based_emissions || r.emissions || 0);
    total += val;
    const regionLabel = `${r.calc_country || '—'}${r.calc_region ? ' / ' + r.calc_region : ''}`;
    regions[regionLabel] = (regions[regionLabel] || 0) + val;
    const monthKey = `${r.period_year || r.year || 'NA'}-${String(r.period_month || r.month || '').padStart(2, '0')}`;
    months.add(monthKey);
  });

  const topEntry = Object.entries(regions).sort((a, b) => b[1] - a[1])[0];
  const topRegion = topEntry ? `${topEntry[0]} (${topEntry[1].toFixed(3)})` : '—';
  const milesPerTon = 1 / 0.000404;

  return {
    total: total.toFixed(3),
    avg: months.size ? (total / months.size).toFixed(3) : total.toFixed(3),
    topRegion,
    count: months.size,
    compare: `${(total * milesPerTon).toFixed(0)} miles`
  };
};

const renderCarbonSummary = () => {
  // Tie summary to current filters so totals mirror what the user is viewing
  const summary = computeCarbonSummary(getFilteredRecords());
  if (!summary) return;
  const totalEl = document.getElementById('totalEmissions');
  const avgEl = document.getElementById('avgEmissions');
  const topEl = document.getElementById('topRegion');
  const countEl = document.getElementById('recordCount');
  const compareEl = document.getElementById('summaryCompare');
  if (totalEl) totalEl.textContent = summary.total;
  if (avgEl) avgEl.textContent = summary.avg;
  if (topEl) topEl.textContent = summary.topRegion;
  if (countEl) countEl.textContent = summary.count;
  if (compareEl) compareEl.textContent = summary.compare;
};

const computeCarbonReminders = (records = getFilteredRecords()) => {
  if (!records.length) return [];

  const reminders = [];
  const monthKeys = records.map((r) => `${r.period_year || r.year}-${String(r.period_month || r.month).padStart(2, '0')}`);
  const uniqueMonths = Array.from(new Set(monthKeys)).sort();

  // Detect missing months in sequence
  if (uniqueMonths.length) {
    const [startYear, startMonth] = uniqueMonths[0].split('-').map((v) => parseInt(v, 10));
    const [endYear, endMonth] = uniqueMonths[uniqueMonths.length - 1].split('-').map((v) => parseInt(v, 10));
    const missing = [];
    let y = startYear;
    let m = startMonth;
    const seen = new Set(uniqueMonths);
    while (y < endYear || (y === endYear && m <= endMonth)) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (!seen.has(key)) missing.push(key);
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    missing.forEach((k) => {
      const [yr, mo] = k.split('-');
      reminders.push({ type: 'missing', text: `You haven’t added electricity data for ${mo}/${yr}.` });
    });
  }

  // Region contribution
  let total = 0;
  const regions = {};
  records.forEach((r) => {
    const val = Number(r.location_based_emissions || r.emissions || 0);
    total += val;
    const regionLabel = `${r.calc_country || '—'}${r.calc_region ? ' / ' + r.calc_region : ''}`;
    regions[regionLabel] = (regions[regionLabel] || 0) + val;
  });
  if (total > 0) {
    Object.entries(regions).forEach(([region, val]) => {
      const share = val / total;
      if (share > 0.3) {
        reminders.push({ type: 'region', text: `${region} contributes ${ (share * 100).toFixed(0) }% of your Scope 2 emissions.` });
      }
    });
  }

  return reminders;
};

const renderCarbonReminders = () => {
  const list = document.getElementById('reminderList');
  if (!list) return;
  const reminders = computeCarbonReminders();
  list.innerHTML = '';
  if (!reminders.length) {
    const li = document.createElement('li');
    li.className = 'placeholder';
    li.textContent = 'All looks good. No reminders right now.';
    list.appendChild(li);
    return;
  }
  reminders.forEach((r) => {
    const li = document.createElement('li');
    li.textContent = r.text;
    list.appendChild(li);
  });
};

// Expose globally for non-module usage
if (typeof window !== 'undefined') {
  window.loadRecords = loadRecords;
  window.saveRecords = saveRecords;
  window.renderRecords = renderRecords;
  window.openRecord = openRecord;
  window.openRecordPanel = openRecordPanel;
  window.computeCarbonSummary = computeCarbonSummary;
  window.renderCarbonSummary = renderCarbonSummary;
  window.computeCarbonReminders = computeCarbonReminders;
  window.renderCarbonReminders = renderCarbonReminders;
}

export { loadRecords, saveRecords, renderRecords, openRecord, openRecordPanel, computeCarbonSummary, renderCarbonSummary, computeCarbonReminders, renderCarbonReminders };

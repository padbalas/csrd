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

const renderRecords = (containerId) => {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rows = loadRecords();
  container.innerHTML = '';
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const period = `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
    const company = row.companies?.company_name || '—';
    const region = `${row.calc_country || '—'}${row.calc_region ? ' / ' + row.calc_region : ''}`;
    const marketVal = row.market_based_emissions != null ? `${formatNumber(row.market_based_emissions, 3)}` : '—';
    tr.innerHTML = `
      <td>${period}</td>
      <td>${company}</td>
      <td>${region}</td>
      <td>${formatNumber(row.kwh, 0)}</td>
      <td>${formatNumber(row.location_based_emissions, 3)}</td>
      <td>${marketVal}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn secondary" data-action="view" data-id="${row.id}">View</button>
        <button class="btn secondary" data-action="edit" data-id="${row.id}">Edit</button>
        <button class="btn secondary" data-action="delete" data-id="${row.id}">Delete</button>
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
};

// Expose globally for non-module usage
if (typeof window !== 'undefined') {
  window.loadRecords = loadRecords;
  window.saveRecords = saveRecords;
  window.renderRecords = renderRecords;
  window.openRecord = openRecord;
  window.openRecordPanel = openRecordPanel;
}

export { loadRecords, saveRecords, renderRecords, openRecord, openRecordPanel };

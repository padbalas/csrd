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

export { loadRecords, saveRecords, renderRecords, openRecord };

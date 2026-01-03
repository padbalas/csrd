import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ensureCompanySites, buildSiteLabel } from './sites.js';

const SUPABASE_URL = window.SUPABASE_URL || 'https://yyzyyjxmoggrmqsgrlxc.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5enl5anhtb2dncm1xc2dybHhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxMTQ4MzMsImV4cCI6MjA4MTY5MDgzM30.BhnHmz9ADB52B_VcMdzvdyFiPvZFj_Q-jfjRqeAoQM4';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const yearSelect = document.getElementById('dashboard-year');
const siteSelect = document.getElementById('dashboard-site');
const toggleLocation = document.getElementById('toggle-location');
const toggleMarket = document.getElementById('toggle-market');
const totalCarbonEl = document.getElementById('total-carbon');
const totalNoteEl = document.getElementById('total-note');
const scope1TotalEl = document.getElementById('scope1-total');
const scope2TotalEl = document.getElementById('scope2-total');
const scope3ActualsTotalEl = document.getElementById('scope3-actuals-total');
const scope3ScreeningTotalEl = document.getElementById('scope3-screening-total');
const coverageEl = document.getElementById('coverage-months');
const topSiteEl = document.getElementById('top-site');
const trendPath = document.getElementById('trend-path');
const trendEmpty = document.getElementById('trend-empty');
const signoutBtn = document.getElementById('nav-signout');

const formatNumber = (n, digits = 2) =>
  Number(n).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });

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

const requireAuth = async () => {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    window.location.href = 'index.html';
    return null;
  }
  return data.session;
};

const fetchCompanyPreference = async () => {
  const { data, error } = await supabase
    .from('companies')
    .select('reporting_year_preference')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error || !data || !data.length) return 'all';
  return data[0].reporting_year_preference || 'all';
};

const fetchScope2 = async (year, siteId) => {
  let query = supabase
    .from('scope2_records')
    .select('period_year,period_month,location_based_emissions,market_based_emissions,site_id')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });
  if (year) query = query.eq('period_year', Number(year));
  if (siteId) query = query.eq('site_id', siteId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

const fetchScope1 = async (year, siteId) => {
  let query = supabase
    .from('scope1_records')
    .select('period_year,period_month,emissions,site_id')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });
  if (year) query = query.eq('period_year', Number(year));
  if (siteId) query = query.eq('site_id', siteId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

const fetchScope3 = async (year) => {
  let query = supabase
    .from('scope3_records')
    .select('period_year,period_month,emissions,calculation_method')
    .order('period_year', { ascending: false })
    .order('created_at', { ascending: false });
  if (year) query = query.eq('period_year', Number(year));
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

const getScope2Value = (record, basis) => {
  if (basis === 'market') {
    return record.market_based_emissions != null
      ? Number(record.market_based_emissions)
      : Number(record.location_based_emissions || 0);
  }
  return Number(record.location_based_emissions || 0);
};

const renderTrend = (scope1, scope2, scope3Actuals, basis, year) => {
  if (!trendPath || !trendEmpty) return;
  if (!year) {
    trendPath.setAttribute('d', '');
    trendEmpty.style.display = 'block';
    return;
  }
  trendEmpty.style.display = 'none';
  const totals = Array.from({ length: 12 }, (_, idx) => {
    const month = idx + 1;
    const scope1Total = scope1
      .filter((r) => r.period_month === month)
      .reduce((sum, r) => sum + Number(r.emissions || 0), 0);
    const scope2Total = scope2
      .filter((r) => r.period_month === month)
      .reduce((sum, r) => sum + getScope2Value(r, basis), 0);
    const scope3Total = scope3Actuals
      .filter((r) => r.period_month === month)
      .reduce((sum, r) => sum + Number(r.emissions || 0), 0);
    return scope1Total + scope2Total + scope3Total;
  });
  const max = Math.max(...totals, 0);
  if (max === 0) {
    trendPath.setAttribute('d', '');
    trendEmpty.style.display = 'block';
    trendEmpty.textContent = 'No records found for this year.';
    return;
  }
  const points = totals.map((val, idx) => {
    const x = (idx / 11) * 320;
    const y = 130 - (val / max) * 120;
    return `${x},${y}`;
  });
  trendPath.setAttribute('d', `M${points.join(' L')}`);
};

const renderMetrics = (scope1, scope2, scope3, basis, year, sites, selectedSiteId) => {
  const scope1Total = scope1.reduce((sum, r) => sum + Number(r.emissions || 0), 0);
  const scope2Total = scope2.reduce((sum, r) => sum + getScope2Value(r, basis), 0);
  const scope3ActualsTotal = scope3
    .filter((r) => (r.calculation_method || 'eio') === 'actual')
    .reduce((sum, r) => sum + Number(r.emissions || 0), 0);
  const scope3ScreeningTotal = scope3
    .filter((r) => (r.calculation_method || 'eio') !== 'actual')
    .reduce((sum, r) => sum + Number(r.emissions || 0), 0);
  const total = scope1Total + scope2Total + scope3ActualsTotal;

  if (totalCarbonEl) totalCarbonEl.textContent = `${formatNumber(total, 2)} tCO₂e`;
  if (scope1TotalEl) scope1TotalEl.textContent = `${formatNumber(scope1Total, 2)} tCO₂e`;
  if (scope2TotalEl) scope2TotalEl.textContent = `${formatNumber(scope2Total, 2)} tCO₂e`;
  if (scope3ActualsTotalEl) scope3ActualsTotalEl.textContent = `${formatNumber(scope3ActualsTotal, 2)} tCO₂e`;
  if (scope3ScreeningTotalEl) scope3ScreeningTotalEl.textContent = `${formatNumber(scope3ScreeningTotal, 2)} tCO₂e`;
  if (totalNoteEl) {
    totalNoteEl.textContent = year
      ? `Totals for ${year} • ${basis === 'market' ? 'Market-based Scope 2' : 'Location-based Scope 2'}`
      : 'Select a year to see combined monthly trend.';
  }

  const coverageMonths = new Set();
  scope1.forEach((r) => coverageMonths.add(`${r.period_year}-${r.period_month}`));
  scope2.forEach((r) => coverageMonths.add(`${r.period_year}-${r.period_month}`));
  scope3
    .filter((r) => (r.calculation_method || 'eio') === 'actual' && r.period_month)
    .forEach((r) => coverageMonths.add(`${r.period_year}-${r.period_month}`));
  if (coverageEl) coverageEl.textContent = coverageMonths.size ? String(coverageMonths.size) : '—';

  if (topSiteEl) {
    if (selectedSiteId) {
      const site = sites.find((s) => String(s.id) === String(selectedSiteId));
      topSiteEl.textContent = site ? buildSiteLabel(site) : '—';
    } else {
      const siteTotals = new Map();
      scope1.forEach((r) => {
        const key = r.site_id || 'unknown';
        siteTotals.set(key, (siteTotals.get(key) || 0) + Number(r.emissions || 0));
      });
      scope2.forEach((r) => {
        const key = r.site_id || 'unknown';
        siteTotals.set(key, (siteTotals.get(key) || 0) + getScope2Value(r, basis));
      });
      let topId = null;
      let topVal = 0;
      siteTotals.forEach((val, key) => {
        if (val > topVal) {
          topVal = val;
          topId = key;
        }
      });
      const site = sites.find((s) => String(s.id) === String(topId));
      topSiteEl.textContent = site ? buildSiteLabel(site) : '—';
    }
  }
};

const populateYearOptions = (scope1, scope2, pref) => {
  if (!yearSelect) return;
  const years = new Set();
  scope1.forEach((r) => years.add(r.period_year));
  scope2.forEach((r) => years.add(r.period_year));
  const list = Array.from(years).filter(Boolean).sort((a, b) => b - a);
  clearChildren(yearSelect);
  yearSelect.appendChild(createOption('', 'All years'));
  list.forEach((year) => yearSelect.appendChild(createOption(String(year), String(year))));
  const now = new Date().getFullYear();
  const preferred = pref === 'current' ? now : pref === 'previous' ? now - 1 : null;
  if (preferred && list.includes(preferred)) {
    yearSelect.value = String(preferred);
  } else if (list.includes(now)) {
    yearSelect.value = String(now);
  }
};

const populateSites = (sites) => {
  if (!siteSelect) return;
  clearChildren(siteSelect);
  siteSelect.appendChild(createOption('', 'All sites'));
  sites.forEach((site) => {
    siteSelect.appendChild(createOption(site.id, buildSiteLabel(site)));
  });
};

const setBasis = (basis) => {
  if (!toggleLocation || !toggleMarket) return;
  toggleLocation.classList.toggle('active', basis === 'location');
  toggleMarket.classList.toggle('active', basis === 'market');
};

const getBasis = () => (toggleMarket?.classList.contains('active') ? 'market' : 'location');

const renderDashboard = async (sites) => {
  const basis = getBasis();
  const year = yearSelect?.value || '';
  const siteId = siteSelect?.value || '';
  const [scope1, scope2, scope3] = await Promise.all([
    fetchScope1(year, siteId),
    fetchScope2(year, siteId),
    fetchScope3(year)
  ]);
  renderMetrics(scope1, scope2, scope3, basis, year, sites, siteId);
  const scope3Actuals = scope3.filter((r) => (r.calculation_method || 'eio') === 'actual');
  renderTrend(scope1, scope2, scope3Actuals, basis, year);
};

const init = async () => {
  const session = await requireAuth();
  if (!session) return;
  const siteData = await ensureCompanySites(supabase, session);
  const sites = siteData.sites || [];
  populateSites(sites);
  const pref = await fetchCompanyPreference();
  const [scope1All, scope2All] = await Promise.all([fetchScope1('', ''), fetchScope2('', '')]);
  populateYearOptions(scope1All, scope2All, pref);
  setBasis('location');
  await renderDashboard(sites);

  yearSelect?.addEventListener('change', () => renderDashboard(sites));
  siteSelect?.addEventListener('change', () => renderDashboard(sites));
  toggleLocation?.addEventListener('click', () => {
    setBasis('location');
    renderDashboard(sites);
  });
  toggleMarket?.addEventListener('click', () => {
    setBasis('market');
    renderDashboard(sites);
  });
};

if (signoutBtn) {
  signoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  });
}

init();

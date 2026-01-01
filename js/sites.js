const buildKey = (country, region) => `${country || ''}::${region || ''}`;

const fetchCompany = async (supabase, session) => {
  if (!supabase || !session) return null;
  const { data, error } = await supabase
    .from('companies')
    .select('id,country,region')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error || !data || !data.length) return null;
  return data[0];
};

const fetchSites = async (supabase, companyId) => {
  if (!supabase || !companyId) return [];
  const { data, error } = await supabase
    .from('company_sites')
    .select('id,country,region,is_hq')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return data || [];
};

const ensureSingleHq = async (supabase, companyId, sites) => {
  if (!sites.length) return { sites, hqSite: null };
  const hqSites = sites.filter((site) => site.is_hq);
  if (hqSites.length === 1) return { sites, hqSite: hqSites[0] };
  const target = hqSites[0] || sites[0];
  const updates = sites.map((site) => ({
    id: site.id,
    is_hq: site.id === target.id
  }));
  const { data, error } = await supabase
    .from('company_sites')
    .upsert(updates)
    .select('id,country,region,is_hq');
  if (error) return { sites, hqSite: target };
  const normalized = data || [];
  const hqSite = normalized.find((site) => site.is_hq) || normalized[0];
  return { sites: normalized, hqSite };
};

const collectSitePairs = (scope2Records, scope1Records, company) => {
  const pairs = [];
  const seen = new Set();
  const addPair = (country, region) => {
    if (!country || !region) return;
    const key = buildKey(country, region);
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ country, region });
  };
  (scope2Records || []).forEach((row) => addPair(row.calc_country, row.calc_region));
  (scope1Records || []).forEach((row) => addPair(row.country, row.region));
  if (company?.country && company?.region) addPair(company.country, company.region);
  return pairs;
};

const linkRecordsToSites = async (supabase, companyId, sites) => {
  if (!supabase || !companyId || !sites.length) return;
  for (const site of sites) {
    await supabase
      .from('scope2_records')
      .update({ site_id: site.id })
      .eq('company_id', companyId)
      .eq('calc_country', site.country)
      .eq('calc_region', site.region)
      .is('site_id', null);
    await supabase
      .from('scope1_records')
      .update({ site_id: site.id })
      .eq('company_id', companyId)
      .eq('country', site.country)
      .eq('region', site.region)
      .is('site_id', null);
  }
};

const updateCompanyHq = async (supabase, companyId, hqSite) => {
  if (!supabase || !companyId || !hqSite) return;
  await supabase
    .from('companies')
    .update({ country: hqSite.country, region: hqSite.region })
    .eq('id', companyId);
};

export const ensureCompanySites = async (supabase, session) => {
  if (!supabase || !session) {
    return { companyId: null, sites: [], hqSite: null };
  }
  const company = await fetchCompany(supabase, session);
  if (!company) return { companyId: null, sites: [], hqSite: null };
  const companyId = company.id;
  let sites = await fetchSites(supabase, companyId);
  if (sites.length) {
    const { sites: normalized, hqSite } = await ensureSingleHq(supabase, companyId, sites);
    await updateCompanyHq(supabase, companyId, hqSite);
    await linkRecordsToSites(supabase, companyId, normalized);
    return { companyId, sites: normalized, hqSite };
  }

  const [{ data: scope2Records }, { data: scope1Records }] = await Promise.all([
    supabase
      .from('scope2_records')
      .select('calc_country,calc_region')
      .eq('company_id', companyId),
    supabase
      .from('scope1_records')
      .select('country,region')
      .eq('company_id', companyId)
  ]);

  const pairs = collectSitePairs(scope2Records, scope1Records, company);
  if (!pairs.length) {
    return { companyId, sites: [], hqSite: null };
  }

  const companyKey = buildKey(company.country, company.region);
  const hqKey = pairs.some((pair) => buildKey(pair.country, pair.region) === companyKey)
    ? companyKey
    : buildKey(pairs[0].country, pairs[0].region);

  const payload = pairs.map((pair) => ({
    company_id: companyId,
    country: pair.country,
    region: pair.region,
    is_hq: buildKey(pair.country, pair.region) === hqKey
  }));

  const { data: inserted, error } = await supabase
    .from('company_sites')
    .insert(payload)
    .select('id,country,region,is_hq');
  if (error) {
    return { companyId, sites: [], hqSite: null };
  }
  sites = inserted || [];
  const hqSite = sites.find((site) => site.is_hq) || sites[0] || null;
  await updateCompanyHq(supabase, companyId, hqSite);
  await linkRecordsToSites(supabase, companyId, sites);
  return { companyId, sites, hqSite };
};

export const buildSiteLabel = (site) => {
  if (!site) return '';
  return `${site.country}${site.region ? ' / ' + site.region : ''}`;
};

export const findSiteById = (sites, siteId) =>
  (sites || []).find((site) => String(site.id) === String(siteId)) || null;

export const getSitesByCountry = (sites) => {
  const map = new Map();
  (sites || []).forEach((site) => {
    if (!map.has(site.country)) map.set(site.country, []);
    map.get(site.country).push(site);
  });
  return map;
};

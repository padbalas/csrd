import { supabase } from './supabase';
import type { CompanySite } from './supabase';

type CompanyRecord = {
  id: string;
  country: string | null;
  region: string | null;
};

type SitePair = {
  country: string;
  region: string;
};

const buildKey = (country: string | null, region: string | null) =>
  `${country || ''}::${region || ''}`;

const fetchCompany = async (userId: string) => {
  const { data, error } = await supabase
    .from('companies')
    .select('id,country,region')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error || !data?.length) return null;
  return data[0] as CompanyRecord;
};

const fetchSites = async (companyId: string) => {
  const { data, error } = await supabase
    .from('company_sites')
    .select('id,country,region,is_hq')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data || []) as CompanySite[];
};

const ensureSingleHq = async (companyId: string, sites: CompanySite[]) => {
  if (!sites.length) return { sites, hqSite: null as CompanySite | null };
  const hqSites = sites.filter((site) => site.is_hq);
  if (hqSites.length === 1) return { sites, hqSite: hqSites[0] };
  const target = hqSites[0] || sites[0];
  const updates = sites.map((site) => ({
    id: site.id,
    is_hq: site.id === target.id,
  }));
  const { data, error } = await supabase
    .from('company_sites')
    .upsert(updates)
    .select('id,country,region,is_hq');
  if (error) return { sites, hqSite: target };
  const normalized = (data || []) as CompanySite[];
  const hqSite = normalized.find((site) => site.is_hq) || normalized[0] || null;
  return { sites: normalized, hqSite };
};

const collectSitePairs = (
  scope2Records: Array<{ calc_country: string | null; calc_region: string | null }>,
  scope1Records: Array<{ country: string | null; region: string | null }>,
  company: CompanyRecord | null
) => {
  const pairs: SitePair[] = [];
  const seen = new Set<string>();
  const addPair = (country: string | null, region: string | null) => {
    if (!country || !region) return;
    const key = buildKey(country, region);
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ country, region });
  };
  scope2Records.forEach((row) => addPair(row.calc_country, row.calc_region));
  scope1Records.forEach((row) => addPair(row.country, row.region));
  if (company?.country && company?.region) addPair(company.country, company.region);
  return pairs;
};

const linkRecordsToSites = async (companyId: string, sites: CompanySite[]) => {
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

const updateCompanyHq = async (companyId: string, hqSite: CompanySite | null) => {
  if (!hqSite) return;
  await supabase
    .from('companies')
    .update({ country: hqSite.country, region: hqSite.region })
    .eq('id', companyId);
};

export const ensureCompanySites = async (userId: string) => {
  const company = await fetchCompany(userId);
  if (!company) {
    return { companyId: null, sites: [] as CompanySite[], hqSite: null as CompanySite | null };
  }
  const companyId = company.id;
  let sites = await fetchSites(companyId);
  if (sites.length) {
    const { sites: normalized, hqSite } = await ensureSingleHq(companyId, sites);
    await updateCompanyHq(companyId, hqSite);
    await linkRecordsToSites(companyId, normalized);
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
      .eq('company_id', companyId),
  ]);

  const pairs = collectSitePairs(
    (scope2Records || []) as Array<{ calc_country: string | null; calc_region: string | null }>,
    (scope1Records || []) as Array<{ country: string | null; region: string | null }>,
    company
  );

  if (!pairs.length) {
    return { companyId, sites: [] as CompanySite[], hqSite: null as CompanySite | null };
  }

  const companyKey = buildKey(company.country, company.region);
  const hqKey = pairs.some((pair) => buildKey(pair.country, pair.region) === companyKey)
    ? companyKey
    : buildKey(pairs[0].country, pairs[0].region);

  const payload = pairs.map((pair) => ({
    company_id: companyId,
    country: pair.country,
    region: pair.region,
    is_hq: buildKey(pair.country, pair.region) === hqKey,
  }));

  const { data: inserted, error } = await supabase
    .from('company_sites')
    .insert(payload)
    .select('id,country,region,is_hq');
  if (error) {
    return { companyId, sites: [] as CompanySite[], hqSite: null as CompanySite | null };
  }
  sites = (inserted || []) as CompanySite[];
  const hqSite = sites.find((site) => site.is_hq) || sites[0] || null;
  await updateCompanyHq(companyId, hqSite);
  await linkRecordsToSites(companyId, sites);
  return { companyId, sites, hqSite };
};

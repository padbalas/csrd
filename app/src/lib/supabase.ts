import { createClient } from '@supabase/supabase-js';
import type { DateRange, EmissionRecord, Scope } from '../stores/useCarbonStore';

const DEFAULT_SUPABASE_URL = 'https://yyzyyjxmoggrmqsgrlxc.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5enl5anhtb2dncm1xc2dybHhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxMTQ4MzMsImV4cCI6MjA4MTY5MDgzM30.BhnHmz9ADB52B_VcMdzvdyFiPvZFj_Q-jfjRqeAoQM4';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  (window as { SUPABASE_URL?: string }).SUPABASE_URL ||
  DEFAULT_SUPABASE_URL;

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  (window as { SUPABASE_ANON_KEY?: string }).SUPABASE_ANON_KEY ||
  DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const requireSession = async () => {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    window.location.href = '/';
    return null;
  }
  return data.session;
};

export const fetchCompany = async (userId: string) => {
  const { data, error } = await supabase
    .from('companies')
    .select('id,company_name,reporting_year_preference,country,region')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) return null;
  return data?.[0] || null;
};

export type Entitlements = {
  tier: string | null;
  allow_scope3: boolean | null;
  allow_exports?: boolean | null;
  allow_insights?: boolean | null;
  max_sites?: number | null;
};

export const fetchEntitlements = async (companyId: string) => {
  const { data, error } = await supabase
    .from('entitlements')
    .select('tier,allow_scope3,allow_exports,allow_insights,max_sites')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) return null;
  return (data || null) as Entitlements | null;
};

export type CompanySite = {
  id: string;
  country: string | null;
  region: string | null;
  is_hq: boolean | null;
};

export const fetchCompanySites = async (companyId: string) => {
  const { data, error } = await supabase
    .from('company_sites')
    .select('id,country,region,is_hq')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data || []) as CompanySite[];
};

export const buildSiteLabel = (site: CompanySite) => {
  const country = site.country || '';
  const region = site.region ? ` / ${site.region}` : '';
  return `${country}${region}`.trim() || '—';
};

const toMonthDate = (year?: number | null, month?: number | null) => {
  if (!year || !month) return '';
  return `${year}-${String(month).padStart(2, '0')}-01`;
};

const inRange = (date: string, range: DateRange) => {
  if (!date) return false;
  if (!range.start && !range.end) return true;
  const time = Date.parse(date);
  if (Number.isNaN(time)) return false;
  const start = range.start ? Date.parse(range.start) : null;
  const end = range.end ? Date.parse(range.end) : null;
  if (start && time < start) return false;
  if (end && time > end) return false;
  return true;
};

type FetchParams = {
  organizationId: string | null;
  siteId: string | null;
  dateRange: DateRange;
  scopes: Scope[];
};

export const fetchSupabaseRecords = async (params: FetchParams): Promise<EmissionRecord[]> => {
  const { organizationId, siteId, dateRange, scopes } = params;
  const queries: Promise<EmissionRecord[]>[] = [];

  if (scopes.includes('scope2')) {
    let query = supabase
      .from('scope2_records')
      .select('id,period_year,period_month,location_based_emissions,calc_country,calc_region,company_id,site_id');
    if (organizationId) query = query.eq('company_id', organizationId);
    if (siteId) query = query.eq('site_id', siteId);
    queries.push(
      query.then(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((row) => {
          const date = toMonthDate(row.period_year, row.period_month);
          return {
            id: row.id,
            scope: 'scope2',
            category: row.calc_region || row.calc_country || 'Electricity',
            emissions_kgco2e: Number(row.location_based_emissions || 0) * 1000,
            date,
          } as EmissionRecord;
        }).filter((record) => inRange(record.date, dateRange));
      })
    );
  }

  if (scopes.includes('scope1')) {
    let query = supabase
      .from('scope1_records')
      .select('id,period_year,period_month,emissions,country,region,company_id,site_id');
    if (organizationId) query = query.eq('company_id', organizationId);
    if (siteId) query = query.eq('site_id', siteId);
    queries.push(
      query.then(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((row) => {
          const date = toMonthDate(row.period_year, row.period_month);
          return {
            id: row.id,
            scope: 'scope1',
            category: row.region || row.country || 'Natural gas',
            emissions_kgco2e: Number(row.emissions || 0) * 1000,
            date,
          } as EmissionRecord;
        }).filter((record) => inRange(record.date, dateRange));
      })
    );
  }

  if (scopes.includes('scope3')) {
    let query = supabase
      .from('scope3_records')
      .select('id,period_year,period_month,emissions,category_label,company_id');
    if (organizationId) query = query.eq('company_id', organizationId);
    queries.push(
      query.then(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((row) => {
          const date = toMonthDate(row.period_year, row.period_month);
          return {
            id: row.id,
            scope: 'scope3',
            category: row.category_label || 'Scope 3',
            emissions_kgco2e: Number(row.emissions || 0) * 1000,
            date,
          } as EmissionRecord;
        }).filter((record) => inRange(record.date, dateRange));
      })
    );
  }

  const results = await Promise.all(queries);
  return results.flat();
};

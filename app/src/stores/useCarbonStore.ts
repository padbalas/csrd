import { create } from 'zustand';
import { fetchSupabaseRecords } from '../lib/supabase';

export type Scope = 'scope1' | 'scope2' | 'scope3';

export type DateRange = {
  start: string;
  end: string;
};

export type Aggregation = 'monthly' | 'quarterly' | 'yearly';

export type EmissionRecord = {
  id: string;
  scope: Scope;
  category: string;
  emissions_kgco2e: number;
  date: string;
};

export type RecordsFilters = {
  year: string;
  country: string;
  region: string;
  method: string;
  category: string;
};

export type InsightsFilters = {
  year: string;
  tab: 'scope2' | 'scope1' | 'scope3';
};

export type ExportsFilters = {
  tab: 'scope2' | 'scope1' | 'scope3';
  scope2Year: string;
  scope1Year: string;
  scope3Year: string;
};

export type ScopeFilters = {
  year: string;
  country: string;
  region: string;
  category: string;
  method: string;
};

type CarbonState = {
  organizationId: string | null;
  siteId: string | null;
  dateRange: DateRange;
  scopes: Scope[];
  aggregation: Aggregation;
  reportingYear: string;
  records: EmissionRecord[];
  isLoading: boolean;
  error: string | null;
  totalEmissions: number;
  emissionsByScope: Record<Scope, number>;
  emissionsByCategory: Record<string, number>;
  recordsFilters: RecordsFilters;
  insightsFilters: InsightsFilters;
  exportsFilters: ExportsFilters;
  scopeFilters: ScopeFilters;
  setOrganization: (orgId: string) => void;
  setSite: (siteId: string) => void;
  setDateRange: (range: DateRange) => void;
  setScopes: (scopes: Scope[]) => void;
  setAggregation: (agg: Aggregation) => void;
  setReportingYear: (year: string) => void;
  setRecordsFilters: (updates: Partial<RecordsFilters>) => void;
  setInsightsFilters: (updates: Partial<InsightsFilters>) => void;
  setExportsFilters: (updates: Partial<ExportsFilters>) => void;
  setScopeFilters: (updates: Partial<ScopeFilters>) => void;
  fetchRecords: () => Promise<void>;
  computeDerived: () => void;
};

export const useCarbonStore = create<CarbonState>((set, get) => ({
  organizationId: null,
  siteId: null,
  dateRange: { start: '', end: '' },
  scopes: ['scope1', 'scope2', 'scope3'],
  aggregation: 'monthly',
  reportingYear: '',
  records: [],
  isLoading: false,
  error: null,
  totalEmissions: 0,
  emissionsByScope: { scope1: 0, scope2: 0, scope3: 0 },
  emissionsByCategory: {},
  recordsFilters: {
    year: '',
    country: '',
    region: '',
    method: '',
    category: '',
  },
  insightsFilters: {
    year: '',
    tab: 'scope2',
  },
  exportsFilters: {
    tab: 'scope2',
    scope2Year: '',
    scope1Year: '',
    scope3Year: '',
  },
  scopeFilters: {
    year: '',
    country: '',
    region: '',
    category: '',
    method: '',
  },
  setOrganization: (orgId) => set({ organizationId: orgId }),
  setSite: (siteId) => set({ siteId }),
  setDateRange: (range) => set({ dateRange: range }),
  setScopes: (scopes) => set({ scopes }),
  setAggregation: (agg) => set({ aggregation: agg }),
  setReportingYear: (year) => set({ reportingYear: year }),
  setRecordsFilters: (updates) =>
    set((state) => {
      const next = { ...state.recordsFilters, ...updates };
      const sync: Partial<ScopeFilters> = {};
      if (Object.prototype.hasOwnProperty.call(updates, 'country')) sync.country = next.country;
      if (Object.prototype.hasOwnProperty.call(updates, 'region')) sync.region = next.region;
      if (Object.prototype.hasOwnProperty.call(updates, 'method')) sync.method = next.method;
      if (Object.prototype.hasOwnProperty.call(updates, 'category')) sync.category = next.category;
      return {
        recordsFilters: next,
        scopeFilters: Object.keys(sync).length ? { ...state.scopeFilters, ...sync } : state.scopeFilters,
      };
    }),
  setInsightsFilters: (updates) =>
    set((state) => ({ insightsFilters: { ...state.insightsFilters, ...updates } })),
  setExportsFilters: (updates) =>
    set((state) => ({ exportsFilters: { ...state.exportsFilters, ...updates } })),
  setScopeFilters: (updates) =>
    set((state) => {
      const next = { ...state.scopeFilters, ...updates };
      const sync: Partial<RecordsFilters> = {};
      if (Object.prototype.hasOwnProperty.call(updates, 'country')) sync.country = next.country;
      if (Object.prototype.hasOwnProperty.call(updates, 'region')) sync.region = next.region;
      if (Object.prototype.hasOwnProperty.call(updates, 'method')) sync.method = next.method;
      if (Object.prototype.hasOwnProperty.call(updates, 'category')) sync.category = next.category;
      return {
        scopeFilters: next,
        recordsFilters: Object.keys(sync).length ? { ...state.recordsFilters, ...sync } : state.recordsFilters,
      };
    }),
  fetchRecords: async () => {
    set({ isLoading: true, error: null });
    try {
      const { organizationId, siteId, dateRange, scopes } = get();
      const data = await fetchSupabaseRecords({ organizationId, siteId, dateRange, scopes });
      set({ records: data || [] });
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ isLoading: false });
    }
  },
  computeDerived: () => {
    const { records } = get();
    const totalEmissions = records.reduce(
      (sum, record) => sum + record.emissions_kgco2e,
      0
    );
    const emissionsByScope = records.reduce((acc, record) => {
      acc[record.scope] = (acc[record.scope] || 0) + record.emissions_kgco2e;
      return acc;
    }, { scope1: 0, scope2: 0, scope3: 0 } as Record<Scope, number>);
    const emissionsByCategory = records.reduce((acc, record) => {
      acc[record.category] = (acc[record.category] || 0) + record.emissions_kgco2e;
      return acc;
    }, {} as Record<string, number>);
    set({ totalEmissions, emissionsByScope, emissionsByCategory });
  },
}));

import { useEffect, useMemo, useState } from 'react';
import { ensureCompanySites } from '../lib/sites';
import { fetchCompany, fetchEntitlements, requireSession, supabase, SUPABASE_URL } from '../lib/supabase';

const COUNTRY_OPTIONS = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'AU', label: 'Australia' },
  { value: 'SG', label: 'Singapore' },
  { value: 'NZ', label: 'New Zealand' },
];

const REGION_OPTIONS: Record<string, string[]> = {
  US: [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','District of Columbia',
    'Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine',
    'Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
    'New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma',
    'Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
    'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
  ],
  CA: [
    'Alberta','British Columbia','Manitoba','New Brunswick','Newfoundland and Labrador','Northwest Territories',
    'Nova Scotia','Nunavut','Ontario','Prince Edward Island','Quebec','Saskatchewan','Yukon',
  ],
  UK: ['England','Northern Ireland','Scotland','Wales'],
  AU: [
    'New South Wales','Victoria','Queensland','Western Australia','South Australia',
    'Tasmania','Australian Capital Territory','Northern Territory',
  ],
  SG: ['Singapore'],
  NZ: [
    "Auckland","Bay of Plenty","Canterbury","Gisborne","Hawke's Bay","Manawatu-Whanganui","Marlborough",
    "Nelson","Northland","Otago","Southland","Taranaki","Tasman","Waikato","Wellington","West Coast",
  ],
};

const FUNCTIONS_BASE_URL = SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co');

type CompanySite = {
  id: string;
  country: string | null;
  region: string | null;
  is_hq: boolean | null;
};

const Settings = () => {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [reportingPref, setReportingPref] = useState('all');
  const [status, setStatus] = useState('');
  const [sites, setSites] = useState<CompanySite[]>([]);
  const [siteCountry, setSiteCountry] = useState('');
  const [siteRegion, setSiteRegion] = useState('');
  const [sitesStatus, setSitesStatus] = useState('');
  const [entitlements, setEntitlements] = useState<any>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [userId, setUserId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [siteLimitReached, setSiteLimitReached] = useState(false);

  const yearLabels = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return { current: String(currentYear), previous: String(currentYear - 1) };
  }, []);

  const regionOptions = useMemo(() => REGION_OPTIONS[siteCountry] || [], [siteCountry]);

  const refreshEntitlements = async (companyIdValue: string | null) => {
    if (!companyIdValue) return;
    const data = await fetchEntitlements(companyIdValue);
    setEntitlements(data);
    return data;
  };

  const updateSiteGate = (siteList: CompanySite[]) => {
    const maxSites = entitlements?.max_sites ?? null;
    if (maxSites !== null && siteList.length >= maxSites) {
      setSitesStatus('Upgrade to CarbonWise Complete to add more sites.');
      setSiteLimitReached(true);
      return true;
    }
    setSiteLimitReached(false);
    return false;
  };

  const handleSaveCompany = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('');
    if (!companyName.trim()) {
      setStatus('Company name is required.');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        user_id: userId,
        company_name: companyName.trim(),
        reporting_year_preference: reportingPref || 'all',
      };
      if (companyId) {
        const { error } = await supabase.from('companies').update(payload).eq('id', companyId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('companies')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        setCompanyId(data?.id || null);
      }
      setStatus('Saved.');
      if (!sites.length) {
        const session = await requireSession();
        if (session) {
          const siteData = await ensureCompanySites(session.user.id);
          setCompanyId(siteData.companyId);
          setSites(siteData.sites);
        }
      }
    } catch (error) {
      console.warn('Settings save failed', error);
      setStatus('Save failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddSite = async (event: React.FormEvent) => {
    event.preventDefault();
    setSitesStatus('');
    if (!companyId) {
      setSitesStatus('Save your company details before adding sites.');
      return;
    }
    if (!siteCountry || !siteRegion) {
      setSitesStatus('Country and region are required.');
      return;
    }
    if (sites.some((site) => site.country === siteCountry && site.region === siteRegion)) {
      setSitesStatus('That site already exists.');
      return;
    }
    if (updateSiteGate(sites)) {
      return;
    }
    const needsHq = !sites.some((site) => site.is_hq);
    try {
      const { data, error } = await supabase
        .from('company_sites')
        .insert({
          company_id: companyId,
          country: siteCountry,
          region: siteRegion,
          is_hq: needsHq,
        })
        .select('id,country,region,is_hq')
        .single();
      if (error) throw error;
      const nextSites = [...sites, data as CompanySite];
      setSites(nextSites);
      if (needsHq) {
        await supabase
          .from('companies')
          .update({ country: data.country, region: data.region })
          .eq('id', companyId);
      }
      setSiteCountry('');
      setSiteRegion('');
      setSitesStatus(needsHq ? 'Site added and set as HQ.' : 'Site added.');
      updateSiteGate(nextSites);
    } catch (error) {
      console.warn('Site add failed', error);
      setSitesStatus('Could not add site.');
    }
  };

  const setHqSite = async (site: CompanySite) => {
    if (!companyId) return;
    setSitesStatus('Updating HQ...');
    try {
      await supabase
        .from('company_sites')
        .update({ is_hq: false })
        .eq('company_id', companyId)
        .neq('id', site.id);
      const { error } = await supabase
        .from('company_sites')
        .update({ is_hq: true })
        .eq('id', site.id);
      if (error) throw error;
      await supabase
        .from('companies')
        .update({ country: site.country, region: site.region })
        .eq('id', companyId);
      const updated = sites.map((row) => ({ ...row, is_hq: row.id === site.id }));
      setSites(updated);
      setSitesStatus('HQ updated.');
    } catch (error) {
      console.warn('HQ update failed', error);
      setSitesStatus('Could not update HQ. Please try again.');
    }
  };

  const canRemoveSite = async (siteId: string) => {
    const { count: scope2Count } = await supabase
      .from('scope2_records')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', siteId);
    const { count: scope1Count } = await supabase
      .from('scope1_records')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', siteId);
    return (scope1Count || 0) + (scope2Count || 0) === 0;
  };

  const removeSite = async (site: CompanySite) => {
    if (!companyId) return;
    if (site.is_hq) {
      setSitesStatus('Select a different HQ before removing this site.');
      return;
    }
    const okToRemove = await canRemoveSite(site.id);
    if (!okToRemove) {
      setSitesStatus('Cannot remove a site with linked records. Reassign records first.');
      return;
    }
    try {
      const { error } = await supabase.from('company_sites').delete().eq('id', site.id);
      if (error) throw error;
      const nextSites = sites.filter((row) => row.id !== site.id);
      setSites(nextSites);
      setSitesStatus('Site removed.');
      updateSiteGate(nextSites);
    } catch (error) {
      console.warn('Site removal failed', error);
      setSitesStatus('Could not remove site.');
    }
  };

  const createCheckoutSession = async (tier: string) => {
    if (!sessionToken) return;
    setSubscriptionStatus('Opening Stripe Checkout...');
    try {
      const response = await fetch(`${FUNCTIONS_BASE_URL}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          tier,
          success_url: `${window.location.origin}/app/settings?checkout=success`,
          cancel_url: `${window.location.origin}/app/settings?checkout=cancel`,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Stripe session failed');
      if (payload?.url) {
        window.location.href = payload.url;
        return;
      }
      if (payload?.updated) {
        setSubscriptionStatus('Plan updated. Syncing entitlements…');
        await refreshEntitlements(companyId);
        return;
      }
      throw new Error('Stripe session failed');
    } catch (error) {
      console.warn('Checkout session failed', error);
      setSubscriptionStatus('Could not start checkout. Please try again.');
    }
  };

  const createPortalSession = async () => {
    if (!sessionToken) return;
    setSubscriptionStatus('Opening subscription management…');
    try {
      const response = await fetch(`${FUNCTIONS_BASE_URL}/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          return_url: `${window.location.origin}/app/settings`,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.url) throw new Error(payload?.error || 'Portal session failed');
      window.location.href = payload.url;
    } catch (error) {
      console.warn('Portal session failed', error);
      setSubscriptionStatus('Could not open subscription management. Please try again.');
    }
  };

  useEffect(() => {
    const init = async () => {
      const session = await requireSession();
      if (!session) return;
      setSessionToken(session.access_token);
      setUserId(session.user.id);
      const checkoutParam = new URLSearchParams(window.location.search).get('checkout');
      if (checkoutParam === 'success') {
        setSubscriptionStatus('Checkout complete. Your plan will unlock once Stripe confirms payment.');
      } else if (checkoutParam === 'cancel') {
        setSubscriptionStatus('Checkout canceled. You can restart anytime.');
      }
      const company = await fetchCompany(session.user.id);
      if (company?.id) {
        setCompanyId(company.id);
        setCompanyName(company.company_name || '');
        setReportingPref(company.reporting_year_preference || 'all');
      }
      if (company?.id) {
        await refreshEntitlements(company.id);
      }
      const siteData = await ensureCompanySites(session.user.id);
      setCompanyId(siteData.companyId);
      setSites(siteData.sites);
      updateSiteGate(siteData.sites);

      if (checkoutParam === 'success') {
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts += 1;
          const updated = await refreshEntitlements(siteData.companyId);
          if (updated?.tier && updated.tier !== 'free') {
            setSubscriptionStatus('Subscription updated. You are now on a paid plan.');
            clearInterval(poll);
          } else if (attempts >= 6) {
            setSubscriptionStatus('We are still waiting on Stripe confirmation. Refresh in a minute if this persists.');
            clearInterval(poll);
          }
        }, 5000);
      }
    };
    init();
  }, []);

  useEffect(() => {
    updateSiteGate(sites);
  }, [sites, entitlements]);

  const tier = (entitlements?.tier || 'free').toLowerCase();
  const disableCore = tier === 'core' || tier === 'complete';
  const disableComplete = tier === 'complete';
  const manageDisabled = tier === 'free';

  useEffect(() => {
    if (!entitlements || subscriptionStatus) return;
    if (tier === 'free') {
      setSubscriptionStatus('Free plan active. Upgrade to unlock higher limits.');
    } else if (tier === 'core') {
      setSubscriptionStatus('Core plan active. Upgrade to Complete for Scope 3 and multi-site access.');
    } else if (tier === 'complete') {
      setSubscriptionStatus('Complete plan active. All features unlocked.');
    }
  }, [entitlements, subscriptionStatus, tier]);

  return (
    <div>
      <section className="page-card stack">
        <h2 className="section-title">Subscription</h2>
        <div className="plan-grid">
          <div className="plan-tile">
            <div className="plan-title">
              <span>CarbonWise Core</span>
              {tier === 'core' ? <span className="plan-badge">Current</span> : null}
            </div>
            <div className="plan-price">$99 / month</div>
            <ul className="plan-list">
              <li>Unlimited Scope 1 & Scope 2 records</li>
              <li>Exports + Insights</li>
              <li>Single site</li>
            </ul>
            <div className="plan-actions">
              <button type="button" className="btn primary" onClick={() => createCheckoutSession('core')} disabled={disableCore}>
                Upgrade to Core
              </button>
            </div>
          </div>
          <div className="plan-tile">
            <div className="plan-title">
              <span>CarbonWise Complete</span>
              {tier === 'complete' ? <span className="plan-badge">Current</span> : null}
            </div>
            <div className="plan-price">$149 / month</div>
            <ul className="plan-list">
              <li>Scope 3 records + insights</li>
              <li>Exports + Insights</li>
              <li>Multi-site support</li>
            </ul>
            <div className="plan-actions">
              <button
                type="button"
                className="btn primary"
                onClick={() => createCheckoutSession('complete')}
                disabled={disableComplete}
              >
                Upgrade to Complete
              </button>
            </div>
          </div>
        </div>
        <div className="plan-actions">
          <button type="button" className="btn secondary" onClick={createPortalSession} disabled={manageDisabled}>
            Manage subscription
          </button>
          <div className="plan-status">{subscriptionStatus}</div>
        </div>
      </section>

      <section className="page-card stack">
        <h1 className="page-title">Settings</h1>
        <form onSubmit={handleSaveCompany} className="stack">
          <div>
            <label htmlFor="company-name" className="section-title">Company name</label>
            <input
              id="company-name"
              type="text"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Acme Co."
            />
          </div>
          <div>
            <label htmlFor="reporting-pref" className="section-title">Reporting year preference</label>
            <select
              id="reporting-pref"
              value={reportingPref}
              onChange={(event) => setReportingPref(event.target.value)}
            >
              <option value="all">All years</option>
              <option value="current">{yearLabels.current}</option>
              <option value="previous">{yearLabels.previous}</option>
            </select>
          </div>
          <div className="actions">
            <button type="submit" className="btn primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
          <div className="status">{status}</div>
        </form>
      </section>

      <section className="page-card stack">
        <h2 className="section-title">Sites</h2>
        <form className="row" onSubmit={handleAddSite}>
          <div>
            <label htmlFor="site-country">Country</label>
            <select
              id="site-country"
              value={siteCountry}
              onChange={(event) => setSiteCountry(event.target.value)}
              disabled={siteLimitReached}
            >
              <option value="">Select country</option>
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="site-region">Region</label>
            <select
              id="site-region"
              value={siteRegion}
              onChange={(event) => setSiteRegion(event.target.value)}
              disabled={siteLimitReached}
            >
              <option value="">Select region</option>
              {regionOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="actions">
            <button type="submit" className="btn primary" disabled={siteLimitReached}>Add site</button>
          </div>
        </form>
        <div className="status">{sitesStatus}</div>
        <div className="site-list">
          {sites.length ? (
            sites.map((site) => (
              <div className="site-row" key={site.id}>
                <div>
                  <div className="site-label">{site.country || '—'}{site.region ? ` / ${site.region}` : ''}</div>
                  <div className="site-meta">{site.is_hq ? 'Headquarters' : 'Site'}</div>
                </div>
                <div className="site-actions">
                  <label className="site-hq">
                    <input
                      type="radio"
                      name="hq-site"
                      checked={Boolean(site.is_hq)}
                      onChange={() => setHqSite(site)}
                    />
                    HQ
                  </label>
                  <button type="button" className="btn secondary" onClick={() => removeSite(site)}>
                    Remove
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="note">No sites yet. Add at least one site and mark your HQ.</div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Settings;

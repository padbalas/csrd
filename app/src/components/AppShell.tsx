import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { SUPABASE_URL, fetchCompany, fetchEntitlements, supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';

const AppShell = () => {
  const { signOut, session, company } = useAuth();
  const [brandName, setBrandName] = useState('CarbonWise');
  const [brandBadge, setBrandBadge] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    const loadBrand = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) {
        setBrandName('CarbonWise');
        setBrandBadge('');
        return;
      }
      const company = await fetchCompany(session.user.id);
      if (!company?.company_name) {
        setBrandName('CarbonWise');
        setBrandBadge('');
        return;
      }
      setBrandName(company.company_name);
      const entitlements = company?.id ? await fetchEntitlements(company.id) : null;
      const tier = (entitlements?.tier || 'free').toLowerCase();
      if (tier === 'core') setBrandBadge('Core');
      else if (tier === 'complete') setBrandBadge('Complete');
      else setBrandBadge('Free');
    };
    loadBrand();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const enabled = params.get('debug') === '1' || localStorage.getItem('cwDebug') === '1';
    setDebugOpen(enabled);
  }, []);

  const handleNavClick = () => {
    if (navOpen) setNavOpen(false);
  };

  const handleSignOut = () => {
    setNavOpen(false);
    void signOut();
    window.location.assign('/app/?signedOut=1');
  };

  const debugInfo = useMemo(() => {
    const readAuthStorage = (storage: Storage) => {
      try {
        const supabaseUrl = new URL(SUPABASE_URL);
        const projectRef = supabaseUrl.hostname.split('.')[0];
        const key = projectRef ? `sb-${projectRef}-auth-token` : '';
        if (!key) return { key: '', data: null };
        const raw = storage.getItem(key);
        if (!raw) return { key, data: null };
        const parsed = JSON.parse(raw);
        return {
          key,
          data: {
            hasAccessToken: Boolean(parsed?.access_token),
            expiresAt: parsed?.expires_at || null,
            userId: parsed?.user?.id || null,
          },
        };
      } catch {
        return { key: '', data: null };
      }
    };
    return {
      url: window.location.href,
      supabaseUrl: SUPABASE_URL,
      sessionUserId: session?.user?.id || null,
      companyId: company?.id || null,
      localStorage: readAuthStorage(localStorage),
      sessionStorage: readAuthStorage(sessionStorage),
    };
  }, [session, company]);

  return (
    <div className={`app-shell ${navOpen ? 'nav-open' : ''}`}>
      <div className="mobile-topbar">
        <Link className="mobile-brand" to="/" onClick={handleNavClick} aria-label="Company">
          <span className="brand-name">{brandName}</span>
          {brandBadge ? <span className="brand-badge">{brandBadge}</span> : null}
        </Link>
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setNavOpen((prev) => !prev)}
        >
          Menu
        </button>
      </div>
      <div
        className="mobile-overlay"
        onClick={() => setNavOpen(false)}
        role="button"
        tabIndex={-1}
        aria-hidden={!navOpen}
      />
      <aside className="app-nav">
        <Link className="nav-brand" to="/" onClick={handleNavClick}>
          <span className="brand-name">{brandName}</span>
          {brandBadge ? <span className="brand-badge">{brandBadge}</span> : null}
        </Link>
        <nav className="nav-links">
          <NavLink to="/dashboard" onClick={handleNavClick}>Dashboard</NavLink>
          <NavLink to="/insights" onClick={handleNavClick}>Insights</NavLink>
          <NavLink to="/scope/scope1" onClick={handleNavClick}>Scope 1 Records</NavLink>
          <NavLink to="/scope/scope2" onClick={handleNavClick}>Scope 2 Records</NavLink>
          <NavLink to="/scope/scope3" onClick={handleNavClick}>Scope 3 Records</NavLink>
          <NavLink to="/exports" onClick={handleNavClick}>Exports</NavLink>
          <NavLink to="/settings" onClick={handleNavClick}>Settings</NavLink>
          <NavLink to="/methodology" onClick={handleNavClick}>Methodology</NavLink>
        </nav>
        <div className="nav-footer">
          <button type="button" className="nav-logout" onClick={handleSignOut}>
            Log out
          </button>
        </div>
      </aside>
      <main className="app-main">
        <Outlet />
        <footer className="app-footer">
          <p>
            <NavLink to="/methodology">Methodology</NavLink> ·{' '}
            <a href="mailto:hello@esgrise.com">Contact / support</a>
          </p>
          <p className="muted small">Emission factors updated as of 2024.</p>
        </footer>
        {debugOpen ? (
          <div className="debug-panel" role="region" aria-label="Debug panel">
            <div className="debug-header">
              <strong>Debug</strong>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  localStorage.setItem('cwDebug', '0');
                  setDebugOpen(false);
                }}
              >
                Hide
              </button>
            </div>
            <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
          </div>
        ) : null}
      </main>
    </div>
  );
};

export default AppShell;

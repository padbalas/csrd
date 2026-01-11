import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SUPABASE_URL, fetchCompany, supabase } from '../lib/supabase';

type AuthView = 'signin' | 'signup' | 'reset' | 'update' | 'company';

type Company = {
  id: string;
  company_name: string | null;
  country: string | null;
  region: string | null;
};

type OpenOptions = {
  view?: AuthView;
  title?: string;
  description?: string;
  onComplete?: (() => void | Promise<void>) | null;
};

type AuthContextValue = {
  session: any;
  company: Company | null;
  openAuth: (options?: OpenOptions) => void;
  closeAuth: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_TITLE = 'Log in to save & track history';
const DEFAULT_DESC = 'Log in to save results and track your history. Calculations work without an account.';

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
    'Nelson','Northland','Otago','Southland','Taranaki','Tasman','Waikato','Wellington','West Coast',
  ],
};

const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<any>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AuthView>('signin');
  const [modalTitle, setModalTitle] = useState(DEFAULT_TITLE);
  const [modalDesc, setModalDesc] = useState(DEFAULT_DESC);
  const [authLoading, setAuthLoading] = useState(false);
  const [status, setStatus] = useState({
    signin: '',
    signup: '',
    reset: '',
    update: '',
    passcode: '',
    passcodeHint: '',
    company: '',
  });
  const [signinEmail, setSigninEmail] = useState('');
  const [signinPassword, setSigninPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupCompanyName, setSignupCompanyName] = useState('');
  const [signupCompanyCountry, setSignupCompanyCountry] = useState('');
  const [signupCompanyRegion, setSignupCompanyRegion] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [updatePassword, setUpdatePassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyCountry, setCompanyCountry] = useState('');
  const [companyRegion, setCompanyRegion] = useState('');
  const pendingActionRef = useRef<OpenOptions['onComplete']>(null);

  const resetStatuses = () =>
    setStatus({
      signin: '',
      signup: '',
      reset: 'We have sent you a password reset link.',
      update: 'Enter a new password to complete reset.',
      passcode: '',
      passcodeHint: '',
      company: '',
    });

  const openAuth = (options?: OpenOptions) => {
    const nextView = options?.view || 'signin';
    setView(nextView);
    setModalTitle(options?.title || DEFAULT_TITLE);
    setModalDesc(options?.description || DEFAULT_DESC);
    pendingActionRef.current = options?.onComplete || null;
    resetStatuses();
    setOpen(true);
  };

  const closeAuth = () => {
    setOpen(false);
    pendingActionRef.current = null;
    resetStatuses();
  };

  const loadCompany = async (userId: string) => {
    const record = await fetchCompany(userId);
    if (!record) {
      setCompany(null);
      return null;
    }
    const normalized = record as Company;
    setCompany(normalized);
    return normalized;
  };

  const createHqSite = async (companyId: string, country: string, region: string) => {
    await supabase
      .from('company_sites')
      .insert([{ company_id: companyId, country, region, is_hq: true }]);
  };

  const createCompany = async (userId: string, name: string, country: string, region: string) => {
    const { data, error } = await supabase
      .from('companies')
      .insert([{ user_id: userId, company_name: name, country, region }])
      .select('id,company_name,country,region')
      .single();
    if (error || !data) return null;
    await createHqSite(data.id, country, region);
    setCompany(data as Company);
    return data as Company;
  };

  const clearSupabaseSession = () => {
    const removeSupabaseKeys = (storage: Storage) => {
      const keys = Object.keys(storage);
      keys.forEach((key) => {
        if (key.startsWith('sb-') || key.startsWith('supabase.auth.token')) {
          storage.removeItem(key);
        }
      });
    };
    try {
      const supabaseUrl = new URL(SUPABASE_URL);
      const projectRef = supabaseUrl.hostname.split('.')[0];
      const key = projectRef ? `sb-${projectRef}-auth-token` : '';
      if (key) {
        localStorage.removeItem(key);
        localStorage.removeItem(`${key}-code-verifier`);
        sessionStorage.removeItem(key);
        sessionStorage.removeItem(`${key}-code-verifier`);
      }
      removeSupabaseKeys(localStorage);
      removeSupabaseKeys(sessionStorage);
    } catch {
      try {
        removeSupabaseKeys(localStorage);
        removeSupabaseKeys(sessionStorage);
      } catch {
        // Ignore storage cleanup errors.
      }
    }
  };

  const redirectToDashboardIfLanding = () => {
    const normalizedPath = window.location.pathname.replace(/\/+$/, '');
    if (normalizedPath === '') {
      window.location.assign(`${window.location.origin}/dashboard`);
    }
  };

  const finishPending = async () => {
    const pending = pendingActionRef.current;
    pendingActionRef.current = null;
    if (pending) await pending();
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('signedOut') === '1') {
      clearSupabaseSession();
      supabase.auth.signOut({ scope: 'local' }).catch(() => null);
      params.delete('signedOut');
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
      window.history.replaceState({}, '', nextUrl);
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data?.session || null);
      if (data?.session?.user?.id) {
        loadCompany(data.session.user.id);
      }
    });
    const { data } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') {
        setModalTitle('Set a new password');
        setModalDesc('Complete your password reset to continue.');
        setView('update');
        setOpen(true);
        return;
      }
      if (!nextSession?.user?.id) {
        setCompany(null);
        return;
      }
      const companyRecord = await loadCompany(nextSession.user.id);
      if (!companyRecord && view !== 'company') {
        setModalTitle('Add your company');
        setModalDesc('Provide company details to save results. No bill uploads required.');
        setView('company');
        setOpen(true);
        return;
      }
      if (companyRecord && open) {
        setOpen(false);
        await finishPending();
      }
      if (companyRecord) {
        redirectToDashboardIfLanding();
      }
    });
    return () => {
      data?.subscription.unsubscribe();
    };
  }, [open, view]);

  const signOut = async () => {
    clearSupabaseSession();
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Ignore local sign-out failures.
    }
    try {
      await supabase.auth.signOut({ scope: 'global' });
    } catch {
      // Ignore global sign-out failures.
    }
    clearSupabaseSession();
    setSession(null);
    setCompany(null);
    if (typeof window !== 'undefined') {
      window.location.assign('/?signedOut=1');
    }
  };

  const handleSignIn = async () => {
    if (!signinEmail || !signinPassword) {
      setStatus((prev) => ({ ...prev, signin: 'Enter your email and password.' }));
      return;
    }
    setAuthLoading(true);
    setStatus((prev) => ({ ...prev, signin: 'Signing in...' }));
    const { error } = await supabase.auth.signInWithPassword({
      email: signinEmail,
      password: signinPassword,
    });
    if (error) {
      setStatus((prev) => ({ ...prev, signin: 'Could not sign in. Check your email or password.' }));
    } else {
      setStatus((prev) => ({ ...prev, signin: '' }));
    }
    setAuthLoading(false);
  };

  const handlePasscode = async () => {
    if (!signinEmail) {
      setStatus((prev) => ({
        ...prev,
        passcode: 'Enter your email to receive a passcode link.',
        passcodeHint: '',
      }));
      return;
    }
    setStatus((prev) => ({
      ...prev,
      passcode: 'Sending email passcode...',
      passcodeHint: '',
    }));
    const { error } = await supabase.auth.signInWithOtp({
      email: signinEmail,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) {
      setStatus((prev) => ({
        ...prev,
        passcode: 'We could not send the email. Try again or use your password.',
        passcodeHint: '',
      }));
      return;
    }
    setStatus((prev) => ({
      ...prev,
      passcode: 'We will email you a secure one-time sign-in link.',
      passcodeHint: 'After clicking the email link, continue in that tab. Refresh here if needed.',
    }));
  };

  const handleSignup = async () => {
    if (!signupCompanyName.trim()) {
      setStatus((prev) => ({ ...prev, signup: 'Enter a company name to continue.' }));
      return;
    }
    if (!signupCompanyCountry || !signupCompanyRegion) {
      setStatus((prev) => ({ ...prev, signup: 'Select a company country and region to continue.' }));
      return;
    }
    setAuthLoading(true);
    setStatus((prev) => ({ ...prev, signup: 'Creating account...' }));
    const { data, error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
    });
    if (error) {
      setStatus((prev) => ({ ...prev, signup: 'Could not create account. Try a different email.' }));
      setAuthLoading(false);
      return;
    }
    if (data?.user?.id) {
      const created = await createCompany(
        data.user.id,
        signupCompanyName.trim(),
        signupCompanyCountry,
        signupCompanyRegion
      );
      if (!created) {
        setStatus((prev) => ({
          ...prev,
          signup: 'Account created. Check your email to confirm, then sign in. We will ask for company info after sign-in.',
        }));
        setAuthLoading(false);
        return;
      }
    }
    setStatus((prev) => ({
      ...prev,
      signup: 'Check your email to confirm your account before signing in.',
    }));
    setAuthLoading(false);
  };

  const handleReset = async () => {
    if (!resetEmail) {
      setStatus((prev) => ({ ...prev, reset: 'Enter your email to receive a reset link.' }));
      return;
    }
    setStatus((prev) => ({ ...prev, reset: 'Sending reset link...' }));
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) {
      setStatus((prev) => ({ ...prev, reset: 'Could not send reset link. Please try again.' }));
      return;
    }
    setStatus((prev) => ({ ...prev, reset: 'We have sent you a password reset link.' }));
  };

  const handleUpdatePassword = async () => {
    if (!updatePassword) {
      setStatus((prev) => ({ ...prev, update: 'Enter a new password.' }));
      return;
    }
    setStatus((prev) => ({ ...prev, update: 'Updating password...' }));
    const { error } = await supabase.auth.updateUser({ password: updatePassword });
    if (error) {
      setStatus((prev) => ({ ...prev, update: 'Could not update password. Please try again.' }));
      return;
    }
    setStatus((prev) => ({ ...prev, update: 'Password updated. Please sign in with your new password.' }));
    await supabase.auth.signOut();
  };

  const handleCompanySave = async () => {
    if (!companyName || !companyCountry || !companyRegion) {
      setStatus((prev) => ({ ...prev, company: 'Enter company name, country, and region.' }));
      return;
    }
    if (!session?.user?.id) {
      setStatus((prev) => ({ ...prev, company: 'Please sign in to continue.' }));
      return;
    }
    setStatus((prev) => ({ ...prev, company: 'Saving company...' }));
    const created = await createCompany(session.user.id, companyName.trim(), companyCountry, companyRegion.trim());
    if (!created) {
      setStatus((prev) => ({ ...prev, company: 'Could not save company. Please try again.' }));
      return;
    }
    setStatus((prev) => ({ ...prev, company: '' }));
    setOpen(false);
    await finishPending();
  };

  const value: AuthContextValue = {
    session,
    company,
    openAuth,
    closeAuth,
    signOut,
  };

  const signupRegionOptions = REGION_OPTIONS[signupCompanyCountry] || [];

  return (
    <AuthContext.Provider value={value}>
      {children}
      {open ? (
        <div className="modal active" role="dialog" aria-modal="true">
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{modalTitle}</h3>
                <p className="muted">{modalDesc}</p>
              </div>
              <button type="button" className="btn secondary" onClick={closeAuth} aria-label="Close auth modal">
                ×
              </button>
            </div>

            {view !== 'company' && view !== 'update' ? (
              <div className="tab-header auth-tabs">
                <button
                  type="button"
                  className={`tab-button ${view === 'signin' ? 'active' : ''}`}
                  onClick={() => {
                    setView('signin');
                    resetStatuses();
                  }}
                >
                  Log in
                </button>
                <button
                  type="button"
                  className={`tab-button ${view === 'signup' ? 'active' : ''}`}
                  onClick={() => {
                    setView('signup');
                    resetStatuses();
                  }}
                >
                  Create account
                </button>
              </div>
            ) : null}

            {view === 'signin' ? (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSignIn();
                }}
              >
                <div>
                  <label>Email</label>
                  <input
                    type="email"
                    value={signinEmail}
                    onChange={(event) => setSigninEmail(event.target.value)}
                  />
                </div>
                <div>
                  <label>Password</label>
                  <input
                    type="password"
                    value={signinPassword}
                    onChange={(event) => setSigninPassword(event.target.value)}
                  />
                </div>
                <div className="modal-actions split">
                  <button type="button" className="btn secondary" onClick={() => setView('reset')}>
                    Forgot password?
                  </button>
                  <button type="submit" className="btn primary" disabled={authLoading}>
                    Log in
                  </button>
                </div>
                <button type="button" className="btn secondary" onClick={handlePasscode}>
                  Use email passcode instead
                </button>
                <p className="muted small">{status.signin}</p>
                {status.passcode ? <p className="muted small">{status.passcode}</p> : null}
                {status.passcodeHint ? <p className="muted small">{status.passcodeHint}</p> : null}
              </form>
            ) : null}

            {view === 'signup' ? (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSignup();
                }}
              >
                <div>
                  <label>Email</label>
                  <input
                    type="email"
                    value={signupEmail}
                    onChange={(event) => setSignupEmail(event.target.value)}
                  />
                </div>
                <div>
                  <label>Password</label>
                  <input
                    type="password"
                    value={signupPassword}
                    onChange={(event) => setSignupPassword(event.target.value)}
                  />
                </div>
                <div>
                  <label>Company name</label>
                  <input
                    type="text"
                    value={signupCompanyName}
                    onChange={(event) => setSignupCompanyName(event.target.value)}
                  />
                </div>
                <div className="two-col">
                  <div>
                    <label>Company country / region</label>
                    <select
                      value={signupCompanyCountry}
                      onChange={(event) => {
                        setSignupCompanyCountry(event.target.value);
                        setSignupCompanyRegion('');
                      }}
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
                    <label>State / region</label>
                    <select
                      value={signupCompanyRegion}
                      onChange={(event) => setSignupCompanyRegion(event.target.value)}
                    >
                      <option value="">Select state / province</option>
                      {signupRegionOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="submit" className="btn primary" disabled={authLoading}>
                    Create account
                  </button>
                </div>
                <p className="muted small">{status.signup}</p>
                <p className="muted small">Check your email to confirm your account before signing in.</p>
              </form>
            ) : null}

            {view === 'reset' ? (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleReset();
                }}
              >
                <div>
                  <label>Email</label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                  />
                </div>
                <div className="modal-actions">
                  <button type="submit" className="btn primary">Send reset link</button>
                </div>
                <p className="muted small">{status.reset}</p>
              </form>
            ) : null}

            {view === 'update' ? (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleUpdatePassword();
                }}
              >
                <div>
                  <label>New password</label>
                  <input
                    type="password"
                    value={updatePassword}
                    onChange={(event) => setUpdatePassword(event.target.value)}
                  />
                </div>
                <div className="modal-actions">
                  <button type="submit" className="btn primary">Update password</button>
                </div>
                <p className="muted small">{status.update}</p>
              </form>
            ) : null}

            {view === 'company' ? (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleCompanySave();
                }}
              >
                <div>
                  <label>Company name</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                  />
                </div>
                <div className="two-col">
                  <div>
                    <label>Company country</label>
                    <select
                      value={companyCountry}
                      onChange={(event) => setCompanyCountry(event.target.value)}
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
                    <label>Region / state</label>
                    <input
                      type="text"
                      value={companyRegion}
                      onChange={(event) => setCompanyRegion(event.target.value)}
                      placeholder="e.g., California"
                    />
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn secondary" onClick={closeAuth}>
                    Back
                  </button>
                  <button type="submit" className="btn primary">Save company</button>
                </div>
                <p className="muted small">{status.company}</p>
                <p className="muted small">No bill uploads required. We only store usage values you save.</p>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export default AuthProvider;

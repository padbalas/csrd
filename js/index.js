    import { EMISSION_FACTORS, GLOBAL_FALLBACK, SCOPE1_NATURAL_GAS_DEFAULT, SCOPE1_NATURAL_GAS_FACTORS } from '../data/emission-factors.js';
    import { loadRecords, saveRecords, renderRecords, openRecord } from './records.js';
    // Configurable emission factors (metric tons CO₂e per kWh)
    // Emission factors imported from a versioned, append-only dataset for easy updates without touching UI/logic.

    // Valid regions to keep entries clean and trusted
    const REGION_OPTIONS = {
      US: [
        "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","District of Columbia",
        "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine",
        "Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
        "New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma",
        "Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
        "Virginia","Washington","West Virginia","Wisconsin","Wyoming"
      ],
      CA: [
        "Alberta","British Columbia","Manitoba","New Brunswick","Newfoundland and Labrador","Northwest Territories",
        "Nova Scotia","Nunavut","Ontario","Prince Edward Island","Quebec","Saskatchewan","Yukon"
      ],
      UK: [
        "England","Northern Ireland","Scotland","Wales"
      ],
      AU: [
        "New South Wales","Victoria","Queensland","Western Australia","South Australia",
        "Tasmania","Australian Capital Territory","Northern Territory"
      ],
      SG: [
        "Singapore"
      ],
      NZ: [
        "Auckland","Bay of Plenty","Canterbury","Gisborne","Hawke's Bay","Manawatu-Whanganui","Marlborough",
        "Nelson","Northland","Otago","Southland","Taranaki","Tasman","Waikato","Wellington","West Coast"
      ]
    };
    const CAR_MILES_PER_TON = 1 / 0.000404; // ~0.404 kg CO₂e per mile
    const AVG_HOME_KWH_MONTH = 877; // US average monthly kWh per home

    const form = document.getElementById('carbon-form');
    const countryEl = document.getElementById('country');
    const regionEl = document.getElementById('region');
    const yearEl = document.getElementById('year');
    const monthEl = document.getElementById('month');
    const marketToggleEl = document.getElementById('market-toggle');
    const marketFields = document.getElementById('market-fields');
    const marketTypeEl = document.getElementById('market-type');
    const marketKwhEl = document.getElementById('market-kwh');
    const marketYearEl = document.getElementById('market-year');
    const resultContainer = document.getElementById('result-container');
    const placeholder = document.getElementById('placeholder');
    const tonsEl = document.getElementById('result-tons');
    const compareEl = document.getElementById('result-compare');
    const nextEl = document.getElementById('result-next');
    const calcDetailsEl = document.getElementById('calc-details');
    const interpretationEl = document.getElementById('interpretation');
    const factorMismatchEl = document.getElementById('factor-mismatch');
    const resultMarketEl = document.getElementById('result-market');
    const marketDisclaimer = document.getElementById('market-disclaimer');
    const marketDetails = document.getElementById('market-details');
    const saveBtn = document.getElementById('save-btn');
    // history-btn removed in favor of link
    const signoutBtn = document.getElementById('signout-btn');
    const recordsLoading = document.getElementById('records-loading');
    const recordsError = document.getElementById('records-error');
    const recordsTable = document.getElementById('records-table');
    const recordsTbody = document.getElementById('records-tbody');
    const recordsEmpty = document.getElementById('records-empty');
    const recordsSignout = document.getElementById('records-signout');
    const authModal = document.getElementById('auth-modal');
    const authEmail = document.getElementById('auth-email');
    const authStatus = document.getElementById('auth-status');
    const companyForm = document.getElementById('company-form');
    const companyName = document.getElementById('company-name');
    const companyCountry = document.getElementById('company-country');
    const companyRegion = document.getElementById('company-region');
    const companyBack = document.getElementById('company-back');
    const authModalTitle = document.getElementById('auth-modal-title');
    const authModalDesc = document.getElementById('auth-modal-desc');
    const authClose = document.getElementById('auth-close');
    const authTabSignin = document.getElementById('auth-tab-signin');
    const authTabSignup = document.getElementById('auth-tab-signup');
    const authFormSignin = document.getElementById('auth-form-signin');
    const authFormSignup = document.getElementById('auth-form-signup');
    const authFormReset = document.getElementById('auth-form-reset');
    const authPassword = document.getElementById('auth-password');
    const authEmailSignup = document.getElementById('auth-email-signup');
    const authPasswordSignup = document.getElementById('auth-password-signup');
    const authEmailReset = document.getElementById('auth-email-reset');
    const authStatusSignup = document.getElementById('auth-status-signup');
    const authStatusReset = document.getElementById('auth-status-reset');
    const authSubmitSignup = document.getElementById('auth-submit-signup');
    const authSubmitReset = document.getElementById('auth-submit-reset');
    const authForgot = document.getElementById('auth-forgot');
    const headerSignIn = document.getElementById('header-signin');
    const authFormUpdatePassword = document.getElementById('auth-form-update-password');
    const authPasswordNew = document.getElementById('auth-password-new');
    const authSubmitUpdate = document.getElementById('auth-submit-update');
    const authStatusUpdate = document.getElementById('auth-status-update');
    const authStatusPasscode = document.getElementById('auth-status-passcode');
    const authStatusPasscodeHint = document.getElementById('auth-status-passcode-hint');
    const authPasscodeBtn = document.getElementById('auth-passcode');
    const signupCompanyName = document.getElementById('signup-company-name');
    const signupCompanyCountry = document.getElementById('signup-company-country');
    const signupCompanyRegion = document.getElementById('signup-company-region');
    const viewModal = document.getElementById('view-modal');
    const viewBody = document.getElementById('view-body');
    const viewClose = document.getElementById('view-close');
    const editModal = document.getElementById('edit-modal');
    const editForm = document.getElementById('edit-form');
    const editClose = document.getElementById('edit-close');
    const editPeriod = document.getElementById('edit-period');
    const editFactor = document.getElementById('edit-factor');
    const editKwh = document.getElementById('edit-kwh');
    const editMarketType = document.getElementById('edit-market-type');
    const editCovered = document.getElementById('edit-covered');
    const editStatus = document.getElementById('edit-status');
    const headerSignout = document.getElementById('header-signout');
    const pages = Array.from(document.querySelectorAll('.page'));

    const appState = {
      session: null,
      companyId: null,
      companyName: null,
      lastCalculation: null,
      saving: false,
      records: [],
      recordsLoading: false,
      recordsError: '',
      editingRecordId: null,
      authView: 'signin',
      authLoading: false,
      historyRevealed: false,
      scope1Saving: false,
      scope1PendingEntry: null
    };

    // Supabase client config (replace placeholders or set window.SUPABASE_URL / window.SUPABASE_ANON_KEY)
    const SUPABASE_URL = window.SUPABASE_URL || 'https://yyzyyjxmoggrmqsgrlxc.supabase.co';
    const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5enl5anhtb2dncm1xc2dybHhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxMTQ4MzMsImV4cCI6MjA4MTY5MDgzM30.BhnHmz9ADB52B_VcMdzvdyFiPvZFj_Q-jfjRqeAoQM4';
    const RESET_REDIRECT = 'https://www.esgrise.com/'; // must be a clean URL without hash
    let supabase = null;
    const initSupabaseClient = async () => {
      try {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        window.supabaseClient = supabase; // expose for debugging in console
      } catch (err) {
        console.warn('Supabase client failed to load from esm.sh; trying fallback CDN.', err);
        try {
          const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
          supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
          window.supabaseClient = supabase;
          console.info('Supabase loaded via jsDelivr fallback.');
        } catch (err2) {
          console.error('Supabase client failed to load; save/history disabled until online.', err2);
        }
      }
    };

    const TODAY = new Date();
    const CURRENT_YEAR = TODAY.getFullYear();
    const CURRENT_MONTH = TODAY.getMonth() + 1; // 1-12
    const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    const formatNumber = (n, digits = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });

    const normalizeKey = (str) => (str || "").trim().toUpperCase();

    // Populate year dropdown with current year and past years only
    const populateYears = (el) => {
      el.innerHTML = '';
      for (let y = CURRENT_YEAR; y >= 2024; y -= 1) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        el.appendChild(opt);
      }
    };

    const refreshSessionDisplay = async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      setSessionUI(data?.session || null);
    };

    // Records now live on records.html; keep a no-op to avoid undefined references.
    const refreshRecordsFromRemote = () => {};

    const redirectToRecords = () => {
      if (!window.location.pathname.endsWith('records.html')) {
        window.location.href = 'records.html';
      }
    };

    // Disable future months when current year is selected
    const syncMonthOptions = () => {
      const selectedYear = parseInt(yearEl.value, 10);
      const monthOptions = Array.from(monthEl.options).filter((o) => o.value);
      monthOptions.forEach((opt, idx) => {
        const monthNumber = idx + 1;
        opt.disabled = selectedYear === CURRENT_YEAR && monthNumber > CURRENT_MONTH;
      });
      // If current selection becomes invalid, reset to blank
      if (selectedYear === CURRENT_YEAR) {
        const selMonthIndex = monthEl.selectedIndex;
        const monthNumber = selMonthIndex > 0 ? selMonthIndex : 0;
        if (monthNumber > CURRENT_MONTH) {
          monthEl.value = '';
        }
      }
    };

    const setRegionOptions = (country) => {
      const opts = REGION_OPTIONS[country] || [];
      regionEl.innerHTML = '<option value="">Select state / province</option>';
      opts.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        regionEl.appendChild(opt);
      });
    };
    const setSignupRegionOptions = (country) => {
      const opts = REGION_OPTIONS[country] || [];
      signupCompanyRegion.innerHTML = '<option value="">Select state / province (optional)</option>';
      opts.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        signupCompanyRegion.appendChild(opt);
      });
    };

    // Select a FINAL factor version: prefer billing-year match, else most recent final year. Never overwrite historical records.
    const selectFinalFactor = (records, billingYear) => {
      const finals = (records || []).filter((r) => r.status === 'final');
      if (!finals.length) return null;
      const exact = finals.find((r) => r.year === billingYear);
      if (exact) return exact;
      return finals.reduce((latest, rec) => {
        if (!latest) return rec;
        return rec.year > latest.year ? rec : latest;
      }, null);
    };

    const setSessionUI = (session) => {
      // Minimal guard: rely only on header controls to avoid missing-node issues
      if (!headerSignIn || !headerSignout) return;
      appState.session = session;
      if (signoutBtn) signoutBtn.style.display = 'none'; // keep only header sign-out to reduce clutter near Save
      headerSignout.style.display = session ? 'inline-flex' : 'none';
      if (!session) {
        if (typeof recordsTable !== 'undefined' && recordsTable) recordsTable.style.display = 'none';
        if (typeof recordsEmpty !== 'undefined' && recordsEmpty) recordsEmpty.style.display = 'none';
        if (typeof recordsError !== 'undefined' && recordsError) recordsError.style.display = 'none';
        if (typeof recordsLoading !== 'undefined' && recordsLoading) recordsLoading.style.display = 'none';
        appState.companyId = null;
        appState.companyName = null;
        appState.historyRevealed = false;
        headerSignIn.style.display = 'inline-flex';
        headerSignout.style.display = 'none';
      } else {
        headerSignIn.style.display = 'none';
        // Default destination after login: show My Records info card
        // Keep user on the calculator by default; only show records when requested
      }
    };


    const setAuthView = (view) => {
      appState.authView = view;
      authFormSignin.style.display = view === 'signin' ? 'block' : 'none';
      authFormSignup.style.display = view === 'signup' ? 'block' : 'none';
      authFormReset.style.display = view === 'reset' ? 'block' : 'none';
      authFormUpdatePassword.style.display = view === 'update' ? 'block' : 'none';
      companyForm.style.display = view === 'company' ? 'block' : 'none';
      // Tab highlighting
      authTabSignin.classList.toggle('tab-active', view === 'signin');
      authTabSignup.classList.toggle('tab-active', view === 'signup');
      authStatus.textContent = '';
      authStatusSignup.textContent = '';
      authStatusReset.textContent = 'We’ve sent you a password reset link.';
      authStatusUpdate.textContent = 'Enter a new password to complete reset.';
      authStatusPasscode.style.display = 'none';
      authStatusPasscode.textContent = '';
      authStatusPasscodeHint.style.display = 'none';
      if (view === 'signup') {
        setSignupRegionOptions(signupCompanyCountry.value);
      }
    };

    const openAuthModal = (view = 'signin') => {
      setAuthView(view);
      authModal.classList.add('active');
    };
    const closeAuthModal = () => {
      authModal.classList.remove('active');
      authFormSignin.reset();
      authFormSignup.reset();
      authFormReset.reset();
      authStatusPasscode.style.display = 'none';
      authStatusPasscode.textContent = '';
      authStatusPasscodeHint.style.display = 'none';
      authStatusPasscodeHint.textContent = 'After clicking the email link, continue in that tab. Refresh here if needed.';
    };

    const showHistorySection = () => {
      if (!appState.session) {
        authModalTitle.textContent = 'Log in to view history';
        authModalDesc.textContent = 'Log in to view saved records. Calculations work without an account.';
        openAuthModal('signin');
        return;
      }
      showPage('records');
      // Soft deprecation: no inline rendering; direct link provided in info card.
    };

    const showPage = (pageName) => {
      pages.forEach((page) => {
        page.style.display = page.dataset.page === pageName ? 'block' : 'none';
      });
    };

    const enterRecoveryMode = (session) => {
      // Supabase sets a temporary session for recovery; detect via session.user.recovery_sent_at or auth event.
      setSessionUI(session || appState.session);
      setAuthView('update');
      authModalTitle.textContent = 'Set a new password';
      authModalDesc.textContent = 'Complete your password reset to continue.';
      authModal.classList.add('active');
    };

    const initAuth = async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      setSessionUI(data?.session || null);
      if (data?.session && typeof refreshScope1Entries === 'function') {
        refreshScope1Entries();
      }
      if (data?.session?.user?.recovery_sent_at) {
        enterRecoveryMode(data.session);
      }
      supabase.auth.onAuthStateChange(async (_event, session) => {
        setSessionUI(session);
        if (session) {
          if (session.user?.recovery_sent_at || _event === 'PASSWORD_RECOVERY') {
            enterRecoveryMode(session);
            return;
          }
          if (appState.saving) {
            // Continue save flow after auth
            handleSaveFlow();
          }
          if (appState.scope1Saving && appState.scope1PendingEntry) {
            await saveScope1Entry(appState.scope1PendingEntry);
            return;
          }
          if (typeof refreshScope1Entries === 'function') {
            refreshScope1Entries();
          }
          // Redirect only on new sign-in events to avoid bouncing when intentionally visiting the calculator
          if (_event === 'SIGNED_IN' && !window.location.pathname.endsWith('records.html')) {
            redirectToRecords();
          }
        }
      });
    };

    // Refresh session display when the user returns to the tab (helps with magic-link flows that open in a new tab)
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && supabase) {
        const { data } = await supabase.auth.getSession();
        setSessionUI(data?.session || null);
      }
    });

    authFormSignin.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!supabase) {
        authStatus.textContent = 'Supabase unavailable. Please retry when online.';
        return;
      }
      authStatus.textContent = 'Signing in...';
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.value,
        password: authPassword.value
      });
      if (error) {
        authStatus.textContent = 'Could not sign in. Check your email or password, or confirm your account.';
        return;
      }
      authStatus.textContent = '';
      await refreshSessionDisplay();
      closeAuthModal();
      if (appState.saving) handleSaveFlow();
    });

    authFormSignup.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!supabase) {
        authStatusSignup.textContent = 'Supabase unavailable. Please retry when online.';
        return;
      }
      authStatusSignup.textContent = 'Creating account...';
      const { error, data } = await supabase.auth.signUp({
        email: authEmailSignup.value,
        password: authPasswordSignup.value
      });
      if (error) {
        authStatusSignup.textContent = 'Could not create account. Try a different email or check your password.';
        return;
      }
      if (data?.session?.user?.id) {
        const { error: companyErr } = await supabase.from('companies').insert({
          user_id: data.session.user.id,
          company_name: signupCompanyName.value.trim(),
          country: signupCompanyCountry.value,
          region: signupCompanyRegion.value || null
        });
        if (companyErr) {
          authStatusSignup.textContent = 'Account created. Check your email to confirm, then sign in. We will ask for company info after sign-in.';
          return;
        }
      }
      authStatusSignup.textContent = 'Check your email to confirm your account before signing in.';
    });

    authFormReset.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!supabase) {
        authStatusReset.textContent = 'Supabase unavailable. Please retry when online.';
        return;
      }
      authStatusReset.textContent = 'Sending reset link...';
      const { error } = await supabase.auth.resetPasswordForEmail(authEmailReset.value, { redirectTo: RESET_REDIRECT });
      if (error) {
        authStatusReset.textContent = 'Could not send reset link. Please try again.';
        return;
      }
      authStatusReset.textContent = 'We’ve sent you a password reset link.';
    });

    authClose.addEventListener('click', () => {
      closeAuthModal();
    });

    authTabSignin.addEventListener('click', () => setAuthView('signin'));
    authTabSignup.addEventListener('click', () => setAuthView('signup'));
    authForgot.addEventListener('click', () => setAuthView('reset'));
    authPasscodeBtn.addEventListener('click', async () => {
      if (!supabase) {
        authStatusPasscode.style.display = 'block';
        authStatusPasscode.textContent = 'Supabase unavailable. Please retry when online.';
        authStatusPasscodeHint.style.display = 'none';
        return;
      }
      if (!authEmail.value) {
        authStatusPasscode.style.display = 'block';
        authStatusPasscode.textContent = 'Enter your email to receive a passcode link.';
        authStatusPasscodeHint.style.display = 'none';
        return;
      }
      authStatusPasscode.style.display = 'block';
      authStatusPasscode.textContent = 'Sending email passcode...';
      authStatusPasscodeHint.style.display = 'none';
      const { error } = await supabase.auth.signInWithOtp({ email: authEmail.value, options: { emailRedirectTo: window.location.href } });
      if (error) {
        authStatusPasscode.textContent = 'We couldn’t send the email. Try again or use your password.';
        authStatusPasscodeHint.style.display = 'none';
        return;
      }
      authStatusPasscode.textContent = 'We’ll email you a secure one-time sign-in link.';
      authStatusPasscodeHint.style.display = 'block';
    });
    headerSignIn.addEventListener('click', () => {
      authModalTitle.textContent = 'Log in to save & track history';
      authModalDesc.textContent = 'Log in to save results and track your history. Calculations work without an account.';
      openAuthModal('signin');
    });
    authSubmitUpdate.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!supabase) {
        authStatusUpdate.textContent = 'Supabase unavailable. Please retry when online.';
        return;
      }
      if (!authPasswordNew.value) {
        authStatusUpdate.textContent = 'Enter a new password.';
        return;
      }
      authStatusUpdate.textContent = 'Updating password...';
      const { error } = await supabase.auth.updateUser({ password: authPasswordNew.value });
      if (error) {
        authStatusUpdate.textContent = 'Could not update password. Please try again.';
        return;
      }
      authStatusUpdate.textContent = 'Password updated. Please sign in with your new password.';
      await supabase.auth.signOut();
      window.location.href = '/';
    });

    signoutBtn.addEventListener('click', async () => {
      if (supabase) {
        await supabase.auth.signOut();
      }
      appState.companyId = null;
      await refreshSessionDisplay();
    });
    if (headerSignout) {
      headerSignout.addEventListener('click', async () => {
        if (supabase) {
          await supabase.auth.signOut();
        }
        appState.companyId = null;
        await refreshSessionDisplay();
        // Silent sign-out; no alert to avoid popups
      });
    }

    const handleSaveFlow = async () => {
      if (!appState.session) {
        authModalTitle.textContent = 'Log in to save & track history';
        authModalDesc.textContent = 'Log in to save results and track your history. Calculations work without an account.';
        openAuthModal('signin');
        appState.saving = true;
        return;
      }
      appState.saving = false;
      if (!appState.companyId) {
        appState.companyId = await getOrCreateCompany();
        if (!appState.companyId) return;
      }
      await upsertRecord(appState.companyId);
    };

    saveBtn.addEventListener('click', () => {
      if (!appState.lastCalculation) {
        alert('Calculate before saving.');
        return;
      }
      handleSaveFlow();
    });

    if (recordsSignout) {
      recordsSignout.addEventListener('click', async () => {
        if (supabase) await supabase.auth.signOut();
        window.location.href = '/';
      });
    }

    const findRecordById = (id) => openRecord(id) || appState.records.find((r) => r.id === id);

    const openModal = (el) => el && el.classList.add('active');
    const closeModal = (el) => el && el.classList.remove('active');

    viewClose.addEventListener('click', () => closeModal(viewModal));
    editClose.addEventListener('click', () => closeModal(editModal));

    const renderViewModal = (record) => {
      if (!record) return;
      viewBody.innerHTML = `
        <div class="two-col">
          <div><strong>Billing period</strong><br>${record.period_year}-${String(record.period_month).padStart(2, '0')}</div>
          <div><strong>Company</strong><br>${record.companies?.company_name || '—'}</div>
        </div>
        <div class="two-col">
          <div><strong>Country / region</strong><br>${record.calc_country || '—'}${record.calc_region ? ' / ' + record.calc_region : ''}</div>
          <div><strong>kWh</strong><br>${formatNumber(record.kwh, 0)}</div>
        </div>
        <div class="two-col">
          <div><strong>Location-based</strong><br>${formatNumber(record.location_based_emissions, 3)} tCO₂e</div>
          <div><strong>Market-based</strong><br>${record.market_based_emissions != null ? formatNumber(record.market_based_emissions, 3) + ' tCO₂e' : '—'}</div>
        </div>
        <div class="two-col">
          <div><strong>Emission factor</strong><br>${formatNumber(record.emission_factor_value, 6)} tCO₂e/kWh</div>
          <div><strong>Factor source</strong><br>${record.emission_factor_source} ${record.emission_factor_year}</div>
        </div>
      `;
      openModal(viewModal);
    };

    const openEditModal = (record) => {
      if (!record) return;
      appState.editingRecordId = record.id;
      editPeriod.value = `${record.period_year}-${String(record.period_month).padStart(2, '0')}`;
      editFactor.value = `${record.emission_factor_source} ${record.emission_factor_year}`;
      editKwh.value = record.kwh;
      editMarketType.value = record.market_instrument_type || '';
      editCovered.value = record.covered_kwh != null ? record.covered_kwh : '';
      editStatus.textContent = '';
      openModal(editModal);
    };

    if (recordsTbody) {
      recordsTbody.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        const record = findRecordById(id);
        if (!record) return;
        if (action === 'view') {
          if (window.openRecordPanel) {
            window.openRecordPanel(id, 'recordPanel');
          } else {
            renderViewModal(record);
          }
        }
        if (action === 'edit') {
          openEditModal(record);
        }
        if (action === 'delete') {
          const confirmDelete = confirm('Are you sure you want to delete this record?');
          if (!confirmDelete) return;
          supabase.from('scope2_records').delete().eq('id', id).then(({ error }) => {
            if (error) {
              alert('Delete failed. Please try again.');
              return;
            }
            refreshRecordsFromRemote();
          });
        }
      });
    }

    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!supabase) {
        editStatus.textContent = 'Supabase unavailable. Please retry when online.';
        return;
      }
      const record = findRecordById(appState.editingRecordId);
      if (!record) {
        editStatus.textContent = 'Record not found.';
        return;
      }
      const kwhVal = parseFloat(editKwh.value || '0');
      const coveredVal = parseFloat(editCovered.value || '0');
      if (!kwhVal || kwhVal <= 0) {
        editStatus.textContent = 'Enter a valid kWh.';
        return;
      }
      const covered = !Number.isNaN(coveredVal) && coveredVal >= 0 ? coveredVal : 0;
      const factorVal = record.emission_factor_value;
      const tonsLocation = kwhVal * factorVal;
      const tonsMarket = covered > 0 ? Math.max(kwhVal - covered, 0) * factorVal : tonsLocation;
      editStatus.textContent = 'Saving...';
      const { error } = await supabase.from('scope2_records').update({
        kwh: kwhVal,
        location_based_emissions: tonsLocation,
        market_based_emissions: record.market_based_emissions != null ? tonsMarket : null,
        market_instrument_type: editMarketType.value || null,
        covered_kwh: covered
      }).eq('id', record.id);
      if (error) {
        editStatus.textContent = 'Save failed. Please try again.';
        return;
      }
      editStatus.textContent = 'Saved.';
      closeModal(editModal);
      refreshRecordsFromRemote();
    });

    const getOrCreateCompany = async () => {
      // Try existing company
      if (!supabase) {
        alert('Saving unavailable while offline.');
        return null;
      }
      const { data, error } = await supabase.from('companies').select('id').limit(1);
      if (error) {
        alert('Unable to fetch company.');
        return null;
      }
      if (data && data.length) return data[0].id;
      // Otherwise show company form
      authModalTitle.textContent = 'Add your company';
      authModalDesc.textContent = 'Provide company details to save results. No bill uploads required.';
      setAuthView('company');
      authModal.classList.add('active');
      return new Promise((resolve) => {
        const onSubmit = async (ev) => {
          ev.preventDefault();
          if (!companyName.value || !companyCountry.value) {
            alert('Company name and country are required.');
            return;
          }
          const { data: inserted, error: insertErr } = await supabase.from('companies').insert({
            user_id: appState.session?.user?.id,
            company_name: companyName.value.trim(),
            country: companyCountry.value,
            region: companyRegion.value.trim() || null
          }).select('id').single();
          if (insertErr) {
            console.error('Company save error', insertErr);
            alert('Could not save company.');
            return;
          }
          companyForm.removeEventListener('submit', onSubmit);
          companyBack.removeEventListener('click', onCancel);
          companyForm.style.display = 'none';
          authModal.classList.remove('active');
          resolve(inserted.id);
        };
        const onCancel = () => {
          companyForm.removeEventListener('submit', onSubmit);
          companyBack.removeEventListener('click', onCancel);
          companyForm.style.display = 'none';
          authModal.classList.remove('active');
          resolve(null);
        };
        companyForm.addEventListener('submit', onSubmit);
        companyBack.addEventListener('click', onCancel, { once: true });
      });
    };

    const upsertRecord = async (companyId) => {
      if (!appState.lastCalculation) {
        alert('Calculate before saving.');
        return;
      }
      const calc = appState.lastCalculation;
      if (!supabase) {
        alert('Saving unavailable while offline.');
        return;
      }
      const { data: existing } = await supabase
        .from('scope2_records')
        .select('id')
        .eq('company_id', companyId)
        .eq('period_year', calc.year)
        .eq('period_month', calc.month)
        .limit(1);
      if (existing && existing.length) {
        const confirmReplace = confirm('A record for this period already exists. Replace it?');
        if (!confirmReplace) return;
      }
      const payload = {
        user_id: appState.session.user.id,
        company_id: companyId,
        period_year: calc.year,
        period_month: calc.month,
        kwh: calc.kwh,
        location_based_emissions: calc.tonsLocation,
        market_based_emissions: calc.marketEnabled ? calc.tonsMarket : null,
        market_instrument_type: calc.marketEnabled ? calc.marketType : null,
        covered_kwh: calc.marketEnabled ? calc.coveredKwh : null,
        emission_factor_value: calc.factorValue,
        emission_factor_year: calc.factorYear,
        emission_factor_source: calc.factorSource,
        calc_country: calc.country,
        calc_region: calc.region
      };
      const { error } = await supabase
        .from('scope2_records')
        .upsert([payload], { onConflict: 'user_id,company_id,period_year,period_month,calc_country,calc_region' });
      if (error) {
        alert('Save failed. Please try again.');
        return;
      }
      // Redirect to records page after saving to avoid noisy popups
      window.location.href = 'records.html';
    };

    const getEmissionFactor = (country, region) => {
      const countryData = EMISSION_FACTORS[country];
      const regionKey = normalizeKey(region);
      if (countryData?.regions && countryData.regions[regionKey]) {
        const data = selectFinalFactor(countryData.regions[regionKey], parseInt(yearEl.value, 10));
        if (data) return { ...data, regionLabel: `${country} – ${region}` };
      }
      if (countryData?.default) {
        const data = selectFinalFactor(countryData.default, parseInt(yearEl.value, 10));
        if (data) return { ...data, regionLabel: country };
      }
      const fallback = selectFinalFactor(GLOBAL_FALLBACK, parseInt(yearEl.value, 10)) || GLOBAL_FALLBACK[0];
      return { ...fallback, regionLabel: "Global average" };
    };

    countryEl.addEventListener('change', (e) => {
      setRegionOptions(e.target.value);
    });
    signupCompanyCountry.addEventListener('change', (e) => {
      setSignupRegionOptions(e.target.value);
    });

    yearEl.addEventListener('change', syncMonthOptions);
    marketToggleEl.addEventListener('change', (e) => {
      marketFields.style.display = e.target.checked ? 'grid' : 'none';
    });

    // Initialize dropdowns
    populateYears(yearEl);
    populateYears(marketYearEl);
    // Default to current reporting year per Scope 2 reporting norms.
    yearEl.value = String(CURRENT_YEAR);
    marketYearEl.value = String(CURRENT_YEAR);
    syncMonthOptions();
    setRegionOptions('');
    setSignupRegionOptions('');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const persona = form.persona.value;
      const country = form.country.value || 'OTHER';
      const month = form.month.value;
      const year = parseInt(form.year.value, 10);
      const kwh = parseFloat(form.kwh.value || '0');
      const region = form.region.value.trim();
      const marketEnabled = marketToggleEl.checked;
      const marketType = marketTypeEl.value;
      const marketKwh = parseFloat(marketKwhEl.value || '0');
      const marketYear = parseInt(marketYearEl.value || `${CURRENT_YEAR}`, 10);

      if (!persona || !country || !month || !year || !kwh || kwh <= 0 || !region) {
        alert('Please complete all fields to calculate.');
        return;
      }

      // Validation to block future periods and distinguish current partial periods
      if (year > CURRENT_YEAR) {
        alert('Carbon emissions can only be calculated for past or current periods.');
        return;
      }
      const monthNumber = MONTHS.indexOf(month) + 1; // Jan=1..Dec=12
      if (year === CURRENT_YEAR && monthNumber > CURRENT_MONTH) {
        alert('Future months are not supported. Please select a completed or current billing period.');
        return;
      }

      if (marketEnabled) {
        if (!marketType || Number.isNaN(marketKwh) || marketKwh < 0 || !marketYear) {
          alert('Please provide market-based instrument type, covered kWh, and reporting year.');
          return;
        }
        if (marketYear > CURRENT_YEAR) {
          alert('Carbon emissions can only be calculated for past or current periods.');
          return;
        }
        if (marketKwh > kwh) {
          alert('Covered electricity (kWh) cannot exceed total electricity used.');
          return;
        }
      }

      const factorData = getEmissionFactor(country, region);
      const factor = factorData.factor;
      const tonsLocation = kwh * factor;
      const coveredKwh = marketEnabled ? Math.min(marketKwh, kwh) : 0;
      const uncoveredKwh = Math.max(kwh - coveredKwh, 0);
      const tonsMarket = marketEnabled ? uncoveredKwh * factor : tonsLocation;
      // Keep location-based and market-based as separate values for downstream export/reporting
      const miles = tonsLocation * CAR_MILES_PER_TON;
      const homes = kwh / AVG_HOME_KWH_MONTH;

      tonsEl.textContent = `${formatNumber(tonsLocation, 3)} tCO₂e`;
      compareEl.textContent = `${formatNumber(tonsLocation * CAR_MILES_PER_TON, 0)} car miles or ${formatNumber(homes, 1)} homes for a month`;
      nextEl.textContent = persona === 'finance'
        ? 'Save this number for your monthly close and share with leadership.'
        : persona === 'advisor'
          ? 'Use this as a directional input in your client’s ESG summary.'
          : 'Track this month-over-month to spot reductions and set targets.';
      resultMarketEl.textContent = marketEnabled
        ? `${formatNumber(tonsMarket, 3)} tCO₂e`
        : 'Not provided';

      const factorSentence = `This estimate uses ${factorData.year} ${factorData.source} location-based electricity emission factors for ${factorData.regionLabel} (${formatNumber(factor, 6)} tCO₂e/kWh, version ${factorData.version}).`;
      calcDetailsEl.textContent = factorSentence;

      const isPartialCurrent = year === CURRENT_YEAR && monthNumber === CURRENT_MONTH;
      const partialNote = isPartialCurrent ? ' Partial period estimate: This calculation is based on usage entered for the current month and may change once the billing period is complete.' : '';
      interpretationEl.textContent = `For ${month} ${year} in ${region}, your electricity use generates about ${formatNumber(tonsLocation, 3)} tCO₂e (location-based).${partialNote}`;

      // Show data currency disclaimer when billing year exceeds factor year
      if (year > factorData.year || (marketEnabled && marketYear > factorData.year)) {
        factorMismatchEl.style.display = 'block';
        factorMismatchEl.textContent = 'Emission factors are published with a delay. This calculation uses the most recent available data.';
      } else {
        factorMismatchEl.style.display = 'none';
        factorMismatchEl.textContent = '';
      }

      if (marketEnabled) {
        marketDisclaimer.style.display = 'block';
        marketDetails.textContent = `Instrument: ${marketType} • Covered kWh: ${formatNumber(coveredKwh, 0)} • Reporting year: ${marketYear}. Market-based emissions depend on contractual instruments and are reported separately from location-based emissions.`;
      } else {
        marketDisclaimer.style.display = 'none';
        marketDetails.textContent = '';
      }

    appState.lastCalculation = {
      year,
      month: monthNumber,
      monthName: month,
      kwh,
        country,
        region,
        factorValue: factor,
        factorYear: factorData.year,
        factorSource: factorData.source,
        factorVersion: factorData.version,
        tonsLocation,
        tonsMarket,
        marketEnabled,
        marketType: marketEnabled ? marketType : null,
      coveredKwh: marketEnabled ? coveredKwh : null
    };

    placeholder.style.display = 'none';
    resultContainer.classList.add('active');
    resultContainer.scrollIntoView({ behavior: 'smooth' });
    });

    // Kick off auth session detection on load (safe if supabase fails to load)
    initSupabaseClient().then(() => initAuth());

    const SCOPE1_TOGGLE_KEY = 'scope1_v1_beta_enabled';
    const SCOPE1_DISCLOSURE = 'Scope 1 emissions are estimates based on user-provided fuel data. Results may be partial and do not represent full Scope 1 coverage.';
    const SCOPE1_UNITS = [
      { value: 'therms', label: 'Therms (US)' },
      { value: 'm3', label: 'Cubic meters (m3)' },
      { value: 'kwh-eq', label: 'kWh-equivalent' }
    ];
    const SCOPE1_UNIT_LABELS = SCOPE1_UNITS.reduce((acc, unit) => {
      acc[unit.value] = unit.label;
      return acc;
    }, {});
    const SCOPE1_COUNTRY_LABELS = {
      US: 'United States',
      CA: 'Canada',
      UK: 'United Kingdom',
      AU: 'Australia',
      SG: 'Singapore',
      NZ: 'New Zealand'
    };

    const scope1Toggle = document.getElementById('scope1-toggle');
    const scope1Teaser = document.getElementById('scope1-teaser');
    const scope1Body = document.getElementById('scope1-body');
    const scope1Form = document.getElementById('scope1-form');
    const scope1Month = document.getElementById('scope1-month');
    const scope1Year = document.getElementById('scope1-year');
    const scope1Country = document.getElementById('scope1-country');
    const scope1Region = document.getElementById('scope1-region');
    const scope1Quantity = document.getElementById('scope1-quantity');
    const scope1Unit = document.getElementById('scope1-unit');
    const scope1Notes = document.getElementById('scope1-notes');
    const scope1Status = document.getElementById('scope1-status');
    const scope1Results = document.getElementById('scope1-results');
    const scope1ResultValue = document.getElementById('scope1-result-value');
    const scope1FactorDetails = document.getElementById('scope1-factor-details');
    const scope1Disclosure = document.getElementById('scope1-disclosure');
    const scope1SaveBtn = document.getElementById('scope1-save');

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

    const setScope1Visibility = (enabled) => {
      if (!scope1Body || !scope1Teaser) return;
      scope1Body.classList.toggle('active', enabled);
      scope1Teaser.style.display = enabled ? 'none' : 'block';
      if (!enabled && scope1Results) scope1Results.classList.remove('active');
    };

    const saveScope1Toggle = (enabled) => {
      try {
        localStorage.setItem(SCOPE1_TOGGLE_KEY, enabled ? 'true' : 'false');
      } catch {
        /* ignore localStorage errors */
      }
    };

    const loadScope1Toggle = () => {
      try {
        return localStorage.getItem(SCOPE1_TOGGLE_KEY) === 'true';
      } catch {
        return false;
      }
    };

    const populateScope1Years = () => {
      if (!scope1Year) return;
      clearChildren(scope1Year);
      scope1Year.appendChild(createOption('', 'Select year'));
      for (let y = CURRENT_YEAR; y >= 2024; y -= 1) {
        scope1Year.appendChild(createOption(String(y), String(y)));
      }
    };

    const syncScope1MonthOptions = () => {
      if (!scope1Year || !scope1Month) return;
      const selectedYear = parseInt(scope1Year.value, 10);
      Array.from(scope1Month.options).forEach((opt) => {
        if (!opt.value) return;
        const monthNumber = parseInt(opt.value, 10);
        opt.disabled = selectedYear === CURRENT_YEAR && monthNumber > CURRENT_MONTH;
      });
      if (selectedYear === CURRENT_YEAR && scope1Month.value) {
        const selectedMonth = parseInt(scope1Month.value, 10);
        if (selectedMonth > CURRENT_MONTH) scope1Month.value = '';
      }
    };

    const setScope1RegionOptions = (country) => {
      if (!scope1Region) return;
      clearChildren(scope1Region);
      scope1Region.appendChild(createOption('', 'Select region'));
      const regions = REGION_OPTIONS[country] || [];
      regions.forEach((region) => {
        scope1Region.appendChild(createOption(region, region));
      });
    };

    const getScope1Factor = (country, region, unit) => {
      const countryData = SCOPE1_NATURAL_GAS_FACTORS[country];
      const regionKey = normalizeKey(region);
      let factorData = null;
      let label = 'Default';
      if (countryData?.regions && regionKey && countryData.regions[regionKey]?.[unit]) {
        factorData = countryData.regions[regionKey][unit];
        label = 'Region-specific';
      }
      if (!factorData && countryData?.default?.[unit]) {
        factorData = countryData.default[unit];
      }
      if (!factorData && SCOPE1_NATURAL_GAS_DEFAULT?.[unit]) {
        factorData = SCOPE1_NATURAL_GAS_DEFAULT[unit];
        label = 'Default';
      }
      if (!factorData) return null;
      return { ...factorData, label };
    };

    const fetchScope1Entries = async () => {
      if (!supabase || !appState.session) return [];
      const { data, error } = await supabase
        .from('scope1_records')
        .select('id,period_year,period_month,country,region,quantity,unit,notes,emissions,factor_value,factor_year,factor_source,factor_basis,factor_label,created_at')
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('Scope 1 load failed', error);
        return [];
      }
      return data || [];
    };

    async function refreshScope1Entries() {
      if (!appState.session) return;
      await fetchScope1Entries();
    }

    const showScope1Status = (message) => {
      if (!scope1Status) return;
      scope1Status.textContent = message || '';
    };

    const updateScope1Results = (result) => {
      if (!scope1Results || !scope1ResultValue || !scope1FactorDetails || !scope1Disclosure) return;
      scope1ResultValue.textContent = `${formatNumber(result.emissions, 3)} tCO₂e`;
      scope1FactorDetails.textContent = `Factor: ${formatNumber(result.factor_value, 6)} ${result.factor_basis} • ${result.factor_year} • ${result.factor_source} • ${result.factor_label}`;
      if (scope1Disclosure) scope1Disclosure.textContent = SCOPE1_DISCLOSURE;
      scope1Results.classList.add('active');
      if (scope1SaveBtn) scope1SaveBtn.disabled = false;
    };

    const saveScope1Entry = async (entry) => {
      if (!supabase) {
        showScope1Status('Supabase unavailable. Please retry when online.');
        return;
      }
      if (!appState.session) {
        showScope1Status('Log in to save Scope 1 entries.');
        return;
      }
      appState.scope1Saving = false;
      if (!appState.companyId) {
        appState.companyId = await getOrCreateCompany();
        if (!appState.companyId) return;
      }
      const payload = {
        user_id: appState.session.user.id,
        company_id: appState.companyId,
        period_year: entry.period_year,
        period_month: entry.period_month,
        country: entry.country,
        region: entry.region || null,
        quantity: entry.quantity,
        unit: entry.unit,
        notes: entry.notes || null,
        emissions: entry.emissions,
        factor_value: entry.factor_value,
        factor_year: entry.factor_year,
        factor_source: entry.factor_source,
        factor_basis: entry.factor_basis,
        factor_label: entry.factor_label
      };
      const { error } = await supabase
        .from('scope1_records')
        .upsert([payload], { onConflict: 'user_id,company_id,period_year,period_month,country,region' });
      if (error) {
        showScope1Status('Save failed. Please try again.');
        return;
      }
      updateScope1Results(entry);
      appState.scope1PendingEntry = null;
      showScope1Status('Scope 1 record saved.');
      window.location.href = 'scope1.html';
    };

    const handleScope1Submit = async (event) => {
      event.preventDefault();
      showScope1Status('');
      const errors = [];
      const monthVal = parseInt(scope1Month?.value || '', 10);
      const yearVal = parseInt(scope1Year?.value || '', 10);
      const countryVal = scope1Country?.value || '';
      const regionVal = scope1Region?.value || '';
      const quantityVal = Number(scope1Quantity?.value || '');
      const unitVal = scope1Unit?.value || '';
      const notesVal = String(scope1Notes?.value || '').trim().slice(0, 240);

      if (!monthVal) errors.push('Select a billing month.');
      if (!yearVal) errors.push('Select a billing year.');
      if (!countryVal) errors.push('Select a facility country.');
      if (!unitVal) errors.push('Select a unit.');
      if (!Number.isFinite(quantityVal) || quantityVal < 0) errors.push('Enter a non-negative quantity.');
      if (yearVal && monthVal) {
        const isFuture = yearVal > CURRENT_YEAR || (yearVal === CURRENT_YEAR && monthVal > CURRENT_MONTH);
        if (isFuture) errors.push('Scope 1 entries must be for past or current months.');
      }
      if (unitVal && !SCOPE1_UNIT_LABELS[unitVal]) {
        errors.push('Select a valid unit option.');
      }

      if (errors.length) {
        showScope1Status(errors.join(' '));
        return;
      }

      const factorData = getScope1Factor(countryVal, regionVal, unitVal);
      if (!factorData) {
        showScope1Status('No emission factor is available for this selection. Please adjust the location or unit.');
        return;
      }

      const emissions = quantityVal * factorData.factor;
      const entry = {
        period_year: yearVal,
        period_month: monthVal,
        country: countryVal,
        region: regionVal,
        quantity: quantityVal,
        unit: unitVal,
        notes: notesVal,
        emissions,
        factor_value: factorData.factor,
        factor_year: factorData.year,
        factor_source: factorData.source,
        factor_basis: factorData.basis,
        factor_label: factorData.label
      };

      appState.scope1PendingEntry = entry;
      updateScope1Results(entry);
      showScope1Status('Scope 1 estimate ready. Review and save below.');
    };

    const initScope1Module = () => {
      if (!scope1Toggle || !scope1Body || !scope1Teaser) return;
      populateScope1Years();
      syncScope1MonthOptions();
      setScope1RegionOptions(scope1Country?.value || '');
      const enabled = loadScope1Toggle();
      scope1Toggle.checked = enabled;
      setScope1Visibility(enabled);
      scope1Disclosure.textContent = SCOPE1_DISCLOSURE;

      scope1Toggle.addEventListener('change', (event) => {
        const isEnabled = event.target.checked;
        saveScope1Toggle(isEnabled);
        setScope1Visibility(isEnabled);
      });

      scope1Year?.addEventListener('change', syncScope1MonthOptions);
      scope1Country?.addEventListener('change', (event) => {
        setScope1RegionOptions(event.target.value);
      });
      scope1Form?.addEventListener('submit', handleScope1Submit);
      scope1SaveBtn?.addEventListener('click', async () => {
        if (!appState.scope1PendingEntry) {
          showScope1Status('Calculate a Scope 1 estimate before saving.');
          return;
        }
        if (!appState.session) {
          authModalTitle.textContent = 'Log in to save Scope 1 records';
          authModalDesc.textContent = 'Log in to save Scope 1 results to your account.';
          openAuthModal('signin');
          appState.scope1Saving = true;
          return;
        }
        await saveScope1Entry(appState.scope1PendingEntry);
      });
    };

    initScope1Module();

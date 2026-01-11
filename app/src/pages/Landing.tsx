import { Link } from 'react-router-dom';
import Calculator from './Calculator';
import { useAuth } from '../components/AuthProvider';

const Landing = () => {
  const { session, openAuth, signOut } = useAuth();

  return (
    <div>
      <header className="landing-hero">
        <div className="landing-shell">
          <div className="landing-top">
            <div className="landing-tag">CarbonWise</div>
            <div className="landing-actions">
              {session ? (
                <>
                  <Link className="btn secondary" to="/dashboard">Open app</Link>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      void signOut();
                      window.location.assign('/app/?signedOut=1');
                    }}
                  >
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => openAuth({ view: 'signin' })}
                  >
                    Log in
                  </button>
                  <Link className="btn secondary" to="/dashboard">Open app</Link>
                </>
              )}
            </div>
          </div>
          <h1 className="landing-title">Carbon reporting for small teams - without the complexity</h1>
          <p className="landing-subhead">Calculate Scope 1 and Scope 2 emissions in minutes.</p>
          <div className="landing-cta">
            <a className="btn primary" href="#calculator">Start Scope 2 electricity calculation</a>
            <a className="btn secondary" href="#scope1">Start Scope 1 natural gas calculation</a>
          </div>
          <div className="landing-meta">
            No uploads. No portals. Calculate without an account; sign in only to save or export.
          </div>
        </div>
      </header>

      <div className="landing-shell">
        <section className="page-card stack" id="how">
          <h2 className="section-title">How CarbonWise works</h2>
          <div className="grid-3">
            <div>
              <strong>1) You enter Scope 1 or Scope 2 data</strong>
              <p className="muted">Natural gas quantity or electricity kWh, plus billing month and location.</p>
            </div>
            <div>
              <strong>2) CarbonWise applies public emission factors</strong>
              <p className="muted">Transparent, government-issued factors with clear year stamps.</p>
            </div>
            <div>
              <strong>3) You get a clear estimate</strong>
              <p className="muted">
                Scope 1 uses fuel quantities. Scope 2 defaults to location-based with optional market-based adjustments.
              </p>
            </div>
          </div>
        </section>

        <div id="calculator">
          <div id="scope1" />
          <Calculator />
        </div>

        <section className="page-card stack" id="privacy">
          <h2 className="section-title">Privacy &amp; trust</h2>
          <ul className="list">
            <li>No uploads. We never ask for bills or PDFs.</li>
            <li>Calculate without an account. Log in only to save Scope 1, Scope 2, or Scope 3 records.</li>
            <li>We only store what you save to your account. No extra personal data.</li>
            <li>Scope 2 electricity factors from public government sources.</li>
            <li>Scope 1 natural gas factors from public government sources.</li>
          </ul>
        </section>

        <section className="page-card stack" id="vision">
          <h2 className="section-title">CarbonWise is just getting started</h2>
          <p className="muted">We are building the calm, obvious path to carbon reporting.</p>
          <div className="grid-3">
            <div>
              <strong>Monthly tracking</strong>
              <p className="muted">See trends over time and surface anomalies automatically.</p>
            </div>
            <div>
              <strong>Scope 2 + Scope 1 coverage</strong>
              <p className="muted">Track Scope 2 electricity and Scope 1 natural gas in one place.</p>
            </div>
            <div>
              <strong>Exportable summaries</strong>
              <p className="muted">Share clean, audit-friendly summaries with stakeholders.</p>
            </div>
          </div>
        </section>

        <footer className="landing-footer">
          <p>
            <Link to="/methodology">Methodology</Link> ·{' '}
            <a href="mailto:hello@esgrise.com">Contact / support</a>
          </p>
          <p className="muted small">Emission factors updated as of 2024.</p>
        </footer>
      </div>
    </div>
  );
};

export default Landing;

import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import { LocaleProvider, useBrowserLocale } from './browserLocale.tsx';
import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createApi } from './api.ts';
import { Brand } from './components/Brand.tsx';
import { Icon } from './components/Icon.tsx';
import { LanguageSwitcher } from './components/LanguageSwitcher.tsx';
import { readBootstrap } from './domain.ts';
import { Login } from './pages/Login.tsx';
import { Sharing } from './pages/Sharing.tsx';
import { Upload } from './pages/Upload.tsx';
import { createSessionStore } from './session.ts';
import { theme } from './theme.ts';
import './styles.css';

const bootstrap = readBootstrap(document.querySelector('meta[name="pigeon-bootstrap"]')?.getAttribute('content') ?? null);
const api = createApi(bootstrap.base_path);
const session = createSessionStore(bootstrap.base_path);

function App() {
  const { t } = useBrowserLocale();
  const [token, setToken] = useState(session.read);
  const [notice, setNotice] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    function restoreSession(event: PageTransitionEvent) {
      // The back/forward cache can restore a previous document after sign-out.
      if (event.persisted) setToken(session.read());
    }
    window.addEventListener('pageshow', restoreSession);
    return () => window.removeEventListener('pageshow', restoreSession);
  }, []);
  const updateSession = useCallback((next: string) => {
    session.write(next);
    setToken(next);
  }, []);
  const expireSession = useCallback(() => {
    updateSession('');
    setNotice(false);
  }, [updateSession]);
  async function signOut() {
    setSigningOut(true);
    try {
      await api.logout(token);
      updateSession('');
      setNotice(false);
    } catch {
      setNotice(true);
    } finally {
      setSigningOut(false);
    }
  }
  const sharing = bootstrap.page === 'sharing';
  const showWorkspace = !sharing && Boolean(token);

  return (
    <div className={showWorkspace ? 'shell' : 'shell entry-shell'}>
      {showWorkspace && (
        <header className="site-header">
          <Brand />
          <div className="header-actions">
            <LanguageSwitcher />
            <Button variant="outlined" type="button" onClick={signOut} disabled={signingOut}
              startIcon={<Icon name="exit" size={18} />}>
              {t('logout')}
            </Button>
          </div>
        </header>
      )}
      {notice && <p className="session-notice" role="status">{t('logoutFailed')}</p>}
      {sharing ? <Sharing api={api} share={bootstrap.share} /> : token ? (
        <Upload api={api} token={token} onSessionExpired={expireSession} />
      ) : <Login api={api} onLogin={(next) => { updateSession(next); setNotice(false); }} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LocaleProvider basePath={bootstrap.base_path}><App /></LocaleProvider>
      </ThemeProvider>
    </StyledEngineProvider>
  </StrictMode>,
);

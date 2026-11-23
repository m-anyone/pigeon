import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import { LocaleProvider, useBrowserLocale } from './browserLocale.tsx';
import { StrictMode, Suspense, lazy, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createApi } from './api.ts';
import { Brand } from './components/Brand.tsx';
import { Icon } from './components/Icon.tsx';
import { LanguageSwitcher } from './components/LanguageSwitcher.tsx';
import { readBootstrap } from './domain.ts';
import { readRoute } from './routes.ts';
import { createSessionStore } from './session.ts';
import { theme } from './theme.ts';
import './styles.css';

const bootstrap = readBootstrap(document.querySelector('meta[name="pigeon-bootstrap"]')?.getAttribute('content') ?? null);
const api = createApi(bootstrap.base_path);
const session = createSessionStore(bootstrap.base_path);
const Login = lazy(() => import('./pages/Login.tsx').then(({ Login }) => ({ default: Login })));
const Sharing = lazy(() => import('./pages/Sharing.tsx').then(({ Sharing }) => ({ default: Sharing })));
const Upload = lazy(() => import('./pages/Upload.tsx').then(({ Upload }) => ({ default: Upload })));

function watchHash(notify: () => void) {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
}

function currentHash() {
  return window.location.hash;
}

function App() {
  const { t } = useBrowserLocale();
  const [token, setToken] = useState(session.read);
  const [notice, setNotice] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const route = readRoute(useSyncExternalStore(watchHash, currentHash));

  useEffect(() => {
    if (route.page === 'home' && !token) window.location.replace('#/login');
    if (route.page === 'login' && token) window.location.replace('#/');
  }, [route.page, token]);

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
  const showWorkspace = (route.page === 'home' || route.page === 'login') && Boolean(token);

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
      {showWorkspace && notice && <p className="session-notice" role="status">{t('logoutFailed')}</p>}
      <Suspense fallback={<p className="app-status" role="status">{t('reading')}</p>}>
        {route.page === 'sharing' ? (
          <Sharing key={route.id} api={api} id={route.id} initialPassword={route.password} />
        ) : route.page === 'notFound' ? (
          <main className="app-status"><h1>{t('pageNotFound')}</h1></main>
        ) : token ? (
          <Upload api={api} token={token} onSessionExpired={expireSession} />
        ) : <Login api={api} onLogin={(next) => { updateSession(next); setNotice(false); }} />}
      </Suspense>
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

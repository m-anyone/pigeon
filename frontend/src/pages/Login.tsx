import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { useBrowserLocale } from '../browserLocale.tsx';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, errorMessageKey } from '../api.ts';
import type { PigeonApi } from '../api.ts';
import type { MessageKey } from '../i18n.ts';
import { EntryLayout } from '../components/EntryLayout.tsx';
import { Icon } from '../components/Icon.tsx';

export function Login({ api, onLogin }: { api: PigeonApi; onLogin: (token: string) => void }) {
  const { t } = useBrowserLocale();
  const usernameId = useId();
  const passwordId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | ''>('');

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const result = await api.login(String(fields.get('username')), String(fields.get('password')));
      onLogin(result.token);
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 401
        ? 'invalidCredentials'
        : errorMessageKey(failure, 'signInFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntryLayout title={t('brand')} linkTitle>
      <form onSubmit={signIn} className="fields login-form" aria-busy={busy}>
        <TextField id={usernameId} name="username" label={t('username')} variant="outlined"
          autoComplete="username" placeholder={t('enterUsername')} required fullWidth />
        <TextField id={passwordId} name="password" label={t('password')} variant="outlined"
          type="password" autoComplete="current-password" placeholder={t('enterPassword')} required fullWidth />
        {error && <Alert severity="error">{t(error)}</Alert>}
        <Button variant="contained" className="entry-submit" type="submit" disabled={busy}
          endIcon={<Icon name="arrow" size={18} />}>
          {busy ? t('signingIn') : t('signIn')}
        </Button>
      </form>
    </EntryLayout>
  );
}

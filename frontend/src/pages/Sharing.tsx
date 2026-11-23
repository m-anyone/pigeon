import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { useBrowserLocale } from '../browserLocale.tsx';
import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, errorMessageKey } from '../api.ts';
import type { DownloadLink, PigeonApi } from '../api.ts';
import type { MessageKey } from '../i18n.ts';
import { CopyValue } from '../components/CopyValue.tsx';
import { EntryLayout } from '../components/EntryLayout.tsx';
import { Icon } from '../components/Icon.tsx';
import { formatBytes, passwordFromShareLink } from '../domain.ts';
import type { Share } from '../domain.ts';

export function Sharing({ api, share }: { api: PigeonApi; share?: Share }) {
  const { locale, t } = useBrowserLocale();
  const passwordId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | ''>('');
  const [unavailable, setUnavailable] = useState(!share);
  const [download, setDownload] = useState<DownloadLink>();
  const [downloadRequested, setDownloadRequested] = useState(false);
  const [password, setPassword] = useState(() => passwordFromShareLink(new URL(window.location.href)));
  const filename = download?.filename ?? share?.filename;
  const sizeBytes = download?.size_bytes ?? share?.size_bytes;
  const downloadUrl = download?.download_url;

  useEffect(() => {
    function fillPassword() {
      setPassword(passwordFromShareLink(new URL(window.location.href)));
    }
    window.addEventListener('hashchange', fillPassword);
    return () => window.removeEventListener('hashchange', fillPassword);
  }, []);

  function requestDownload(url: string) {
    setDownloadRequested(true);
    window.location.assign(url);
  }

  async function extract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!share || busy) return;
    const fields = new FormData(event.currentTarget);
    const submittedPassword = fields.get('password');
    setBusy(true);
    setError('');
    try {
      const result = await api.download(share.id, typeof submittedPassword === 'string' ? submittedPassword : undefined);
      setDownload(result);
      // For a protected share, verification prepares the link for a separate download click.
      if (!share.requires_password) requestDownload(result.download_url);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 404) {
        setUnavailable(true);
      } else {
        setError(errorMessageKey(failure, 'downloadFailed'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntryLayout title={t(unavailable ? 'shareUnavailable' : 'receiveFile')}>
      {unavailable ? (
        <p className="subtitle">{t('shareUnavailableDetails')}</p>
      ) : (
        <>
          {filename && (
            <div className="incoming-file">
              <b>{filename}</b>
              {typeof sizeBytes === 'number' && <span>{formatBytes(sizeBytes, locale)}</span>}
            </div>
          )}
          {downloadUrl ? (
            <div className={downloadRequested ? 'fields download-ready' : 'fields'}>
              {downloadRequested && (
                <CopyValue label={t('downloadLink')} value={new URL(downloadUrl, window.location.origin).href} />
              )}
              <Button variant="contained" className={downloadRequested ? undefined : 'entry-submit'}
                href={downloadRequested ? downloadUrl : undefined} endIcon={<Icon name="download" size={19} />}
                onClick={downloadRequested ? undefined : () => requestDownload(downloadUrl)}>
                {t(downloadRequested ? 'downloadAgain' : 'downloadFile')}
              </Button>
            </div>
          ) : (
            <form className="fields" onSubmit={extract} aria-busy={busy}>
              {share?.requires_password && (
                <TextField id={passwordId} name="password" type="text" label={t('extractionPassword')} variant="outlined"
                  placeholder={t('enterExtractionPassword')} required fullWidth autoFocus autoComplete="off"
                  slotProps={{ htmlInput: { 'aria-label': t('extractionPassword'), autoCapitalize: 'none', spellCheck: false } }}
                  value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
              )}
              {error && <Alert severity="error">{t(error)}</Alert>}
              <Button variant="contained" className="entry-submit" type="submit" disabled={busy}
                endIcon={share?.requires_password ? undefined : <Icon name="download" size={19} />}>
                {t(busy ? 'preparing' : share?.requires_password ? 'verifyPassword' : 'downloadFile')}
              </Button>
            </form>
          )}
        </>
      )}
    </EntryLayout>
  );
}

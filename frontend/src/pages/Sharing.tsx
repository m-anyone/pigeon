import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { useBrowserLocale } from '../browserLocale.tsx';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, errorMessageKey } from '../api.ts';
import type { DownloadLink, PigeonApi } from '../api.ts';
import type { MessageKey } from '../i18n.ts';
import { CopyValue } from '../components/CopyValue.tsx';
import { EntryLayout } from '../components/EntryLayout.tsx';
import { Icon } from '../components/Icon.tsx';
import { formatBytes } from '../domain.ts';
import type { Share } from '../domain.ts';

type ShareView = { status: 'loading' | 'unavailable' | 'failed' } | { status: 'ready'; share: Share };

export function Sharing({ api, id, initialPassword }: { api: PigeonApi; id: string; initialPassword: string }) {
  const { locale, t } = useBrowserLocale();
  const passwordId = useId();
  const extraction = useRef<AbortController | null>(null);
  const [view, setView] = useState<ShareView>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | ''>('');
  const [download, setDownload] = useState<DownloadLink>();
  const [downloadRequested, setDownloadRequested] = useState(false);
  const [password, setPassword] = useState(initialPassword);
  const share = view.status === 'ready' ? view.share : undefined;
  const filename = download?.filename ?? share?.filename;
  const sizeBytes = download?.size_bytes ?? share?.size_bytes;
  const downloadUrl = download?.download_url;

  useEffect(() => setPassword(initialPassword), [initialPassword]);

  useEffect(() => {
    const controller = new AbortController();
    api.shareInfo(id, controller.signal).then((details) => {
      if (!controller.signal.aborted) setView({ status: 'ready', share: details });
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      setView({ status: failure instanceof ApiError && failure.status === 404 ? 'unavailable' : 'failed' });
    });
    return () => {
      controller.abort();
      // Changing the hash may unmount this page while extraction is pending.
      extraction.current?.abort();
    };
  }, [api, id]);

  function requestDownload(url: string) {
    setDownloadRequested(true);
    window.location.assign(url);
  }

  async function extract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!share || extraction.current) return;
    const fields = new FormData(event.currentTarget);
    const submittedPassword = fields.get('password');
    const controller = new AbortController();
    extraction.current = controller;
    setBusy(true);
    setError('');
    try {
      const result = await api.download(id, typeof submittedPassword === 'string' ? submittedPassword : undefined, controller.signal);
      if (controller.signal.aborted) return;
      setDownload(result);
      // For a protected share, verification prepares the link for a separate download click.
      if (!share.requires_password) requestDownload(result.download_url);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 404) {
        setView({ status: 'unavailable' });
      } else {
        setError(errorMessageKey(failure, 'downloadFailed'));
      }
    } finally {
      extraction.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <EntryLayout title={t(view.status === 'unavailable' ? 'shareUnavailable' : 'receiveFile')}>
      {view.status === 'loading' ? (
        <p className="subtitle" role="status">{t('reading')}</p>
      ) : view.status === 'unavailable' ? (
        <p className="subtitle">{t('shareUnavailableDetails')}</p>
      ) : !share ? (
        <Alert severity="error">{t('shareLoadFailed')}</Alert>
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
                <TextField id={passwordId} name="password" type="text" label={t('password')} variant="outlined"
                  placeholder={t('enterExtractionPassword')} required fullWidth autoFocus autoComplete="off"
                  slotProps={{ htmlInput: { 'aria-label': t('password'), autoCapitalize: 'none', spellCheck: false } }}
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

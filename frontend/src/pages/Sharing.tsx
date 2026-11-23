import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { useBrowserLocale } from '../browserLocale.tsx';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, errorMessageKey } from '../api.ts';
import type { DownloadLink, PigeonApi } from '../api.ts';
import type { MessageKey } from '../i18n.ts';
import { EntryLayout } from '../components/EntryLayout.tsx';
import { Icon } from '../components/Icon.tsx';
import { formatBytes } from '../domain.ts';
import type { Share } from '../domain.ts';

type ShareView = { status: 'loading' | 'unavailable' | 'failed' } | { status: 'ready'; share: Share };

export function Sharing({ api, id, initialPassword }: { api: PigeonApi; id: string; initialPassword: string }) {
  const { locale, t } = useBrowserLocale();
  const passwordId = useId();
  const extraction = useRef<AbortController | null>(null);
  const downloadUrl = useRef<string | undefined>(undefined);
  const [view, setView] = useState<ShareView>({ status: 'loading' });
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<MessageKey | ''>('');
  const [verifiedFile, setVerifiedFile] = useState<Pick<DownloadLink, 'filename' | 'size_bytes'>>();
  const [password, setPassword] = useState(initialPassword);
  const share = view.status === 'ready' ? view.share : undefined;
  const needsPassword = share?.requires_password && !verifiedFile;
  const filename = verifiedFile?.filename ?? share?.filename;
  const sizeBytes = verifiedFile?.size_bytes ?? share?.size_bytes;

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

  async function extract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!share || extraction.current) return;
    // Reuse the issued URL so subsequent clicks use the same download slot.
    if (downloadUrl.current) {
      window.location.assign(downloadUrl.current);
      return;
    }
    const submittedPassword = new FormData(event.currentTarget).get('password');
    const controller = new AbortController();
    extraction.current = controller;
    if (needsPassword) setVerifying(true);
    setError('');
    try {
      const result = await api.download(id, typeof submittedPassword === 'string' ? submittedPassword : undefined, controller.signal);
      if (controller.signal.aborted) return;
      downloadUrl.current = result.download_url;
      if (needsPassword) {
        setVerifiedFile({ filename: result.filename, size_bytes: result.size_bytes });
      } else {
        window.location.assign(result.download_url);
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 404) {
        setView({ status: 'unavailable' });
      } else {
        setError(errorMessageKey(failure, 'downloadFailed'));
      }
    } finally {
      extraction.current = null;
      if (!controller.signal.aborted && needsPassword) setVerifying(false);
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
          <form className="fields" onSubmit={extract} aria-busy={verifying}>
            {needsPassword && (
              <TextField id={passwordId} name="password" type="text" label={t('password')} variant="outlined"
                placeholder={t('enterExtractionPassword')} required fullWidth autoFocus autoComplete="off"
                slotProps={{ htmlInput: { 'aria-label': t('password'), autoCapitalize: 'none', spellCheck: false } }}
                value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
            )}
            {error && <Alert severity="error">{t(error)}</Alert>}
            <Button variant="contained" className="entry-submit" type="submit" disabled={verifying}
              endIcon={needsPassword ? undefined : <Icon name="download" size={19} />}>
              {t(verifying ? 'preparing' : needsPassword ? 'verifyPassword' : 'downloadFile')}
            </Button>
          </form>
        </>
      )}
    </EntryLayout>
  );
}

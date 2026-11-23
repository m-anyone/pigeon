import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { useBrowserLocale } from '../browserLocale.tsx';
import { ApiError, errorMessageKey } from '../api.ts';
import type { PigeonApi, UploadProgress } from '../api.ts';
import type { MessageKey } from '../i18n.ts';
import { Icon } from '../components/Icon.tsx';
import { CopyValue } from '../components/CopyValue.tsx';
import { PigeonArt } from '../components/Brand.tsx';
import { UploadDrop } from '../components/UploadDrop.tsx';
import { ShareList } from '../components/ShareList.tsx';
import { formatBytes, makePassword, shareLinkWithPassword } from '../domain.ts';
import type { UploadOptions } from '../domain.ts';
import { archiveFolder } from '../folderArchive.ts';
import { readDroppedFolder } from '../folderSelection.ts';
import type { UploadSelection } from '../folderSelection.ts';
import { usePageDrop } from '../usePageDrop.ts';

type Result = { url: string; password?: string };
type ActiveUpload = { phase: 'packing' } | { phase: 'uploading'; file: File; progress: UploadProgress };

const defaultOptions: UploadOptions = { expiration: '7', maxDownloads: '' };

function DiskSpace({ api, token, onSessionExpired }: {
  api: PigeonApi;
  token: string;
  onSessionExpired: () => void;
}) {
  const { locale, t } = useBrowserLocale();
  const [space, setSpace] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api.storage(token, controller.signal).then(({ available_bytes }) => {
      if (controller.signal.aborted) return;
      setSpace(available_bytes);
      setError(false);
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
      else setError(true);
    });
    return () => controller.abort();
  }, [api, token, onSessionExpired]);

  return (
    <p className="disk-summary" aria-live="polite">
      {t('availableSpace')}{' '}
      <span className="disk-value">
        {error ? t('spaceUnavailable') : space === null ? t('reading') : formatBytes(space, locale)}
      </span>
    </p>
  );
}

export function Upload({ api, token, onSessionExpired }: {
  api: PigeonApi;
  token: string;
  onSessionExpired: () => void;
}) {
  const { locale, t } = useBrowserLocale();
  const form = useRef<HTMLFormElement>(null);
  const inFlight = useRef<{ controller: AbortController; bodySent: boolean } | null>(null);
  const [activeUpload, setActiveUpload] = useState<ActiveUpload | null>(null);
  const [expiration, setExpiration] = useState(defaultOptions.expiration);
  const [maxDownloads, setMaxDownloads] = useState(defaultOptions.maxDownloads);
  const [password, setPassword] = useState<string>();
  const [result, setResult] = useState<Result | null>(null);
  const [shareRevision, setShareRevision] = useState(0);
  const [error, setError] = useState<MessageKey | ''>('');
  const [canceled, setCanceled] = useState(false);
  const transfer = activeUpload?.phase === 'uploading' ? activeUpload : undefined;
  const saving = transfer?.progress.percent === 100;
  const busy = activeUpload !== null;
  const dragging = usePageDrop(busy, upload, () => setError('oneItemOnly'));

  useEffect(() => () => inFlight.current?.controller.abort(), []);

  async function upload(selection: UploadSelection) {
    if (inFlight.current || (!result && !form.current?.reportValidity())) return;
    const folder = !(selection instanceof File);
    const options = result ? defaultOptions : { expiration, maxDownloads, password };
    if (result) reset();
    // Lock both pickers for the entire pack-and-upload operation.
    const operation = { controller: new AbortController(), bodySent: false };
    inFlight.current = operation;
    const { signal } = operation.controller;
    setError('');
    setCanceled(false);
    let packing = folder;
    try {
      let file: File;
      if (folder) {
        setActiveUpload({ phase: 'packing' });
        const files = Array.isArray(selection) ? selection : await readDroppedFolder(selection, signal);
        if (files.length === 0) {
          setError('emptyFolder');
          return;
        }
        file = await archiveFolder(files, signal);
      } else {
        file = selection;
      }
      packing = false;
      const reportProgress = (progress: UploadProgress) => {
        if (signal.aborted) return;
        operation.bodySent = progress.percent === 100;
        setActiveUpload({ phase: 'uploading', file, progress });
      };
      reportProgress({ percent: 0, bytesPerSecond: 0 });
      const { share_url } = await api.share(token, file, options, signal, reportProgress);
      setResult({ url: new URL(share_url, window.location.origin).href, password: options.password });
      setShareRevision((revision) => revision + 1);
    } catch (failure) {
      if (signal.aborted) setCanceled(true);
      else if (packing) setError('folderArchiveFailed');
      else if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
      else setError(errorMessageKey(failure, 'uploadFailed'));
    } finally {
      inFlight.current = null;
      setActiveUpload(null);
    }
  }

  function cancelUpload() {
    const operation = inFlight.current;
    // Sending the full body hands the upload over to the server's save step.
    if (operation && !operation.bodySent) operation.controller.abort();
  }

  function reset() {
    setResult(null);
    setExpiration(defaultOptions.expiration);
    setMaxDownloads(defaultOptions.maxDownloads);
    setPassword(undefined);
    setError('');
  }

  return (
    <main className={dragging ? "workspace is-dragging" : "workspace"}>
      <Paper component="section" variant="outlined" className="workspace-card">
        {result ? (
          <div className="share-result">
            <header className="share-result-heading">
              <Typography component="h1" variant="h4">{t('shareReady')}</Typography>
              <div className="share-result-art"><PigeonArt /></div>
            </header>
            <div className="fields result-fields">
              <CopyValue label={t('shareLink')} value={result.url} resetAfterCopy />
              {result.password && <CopyValue label={t('shareLinkWithPassword')} actionLabel={t('copyWithPassword')}
                value={shareLinkWithPassword(result.url, result.password)} resetAfterCopy />}
              <Button className="primary" type="button" variant="contained" onClick={reset}
                endIcon={<Icon name="arrow" size={18} />}>
                {t('shareAnother')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Typography component="h1" variant="h4">{t('shareFile')}</Typography>
            <form ref={form} className="upload-form" onSubmit={(event) => event.preventDefault()}>
              <fieldset className="share-options" aria-label={t('shareSettings')} disabled={busy}>
                <div className="settings-grid">
                  <TextField variant="outlined" size="small" label={t('expiry')} type="number"
                    disabled={busy} value={expiration} placeholder={t('forever')}
                    onChange={(event) => setExpiration(event.target.value)}
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: { min: 1, step: 1 },
                      input: {
                        startAdornment: <InputAdornment position="start" disablePointerEvents>
                          <Icon name="calendar" size={18} />
                        </InputAdornment>,
                        endAdornment: <InputAdornment position="end" disablePointerEvents>
                          <span className="input-unit">{t('days')}</span>
                        </InputAdornment>,
                      },
                    }} />
                  <TextField variant="outlined" size="small" label={t('extractionCount')} type="number"
                    disabled={busy} value={maxDownloads} placeholder={t('unlimited')}
                    onChange={(event) => setMaxDownloads(event.target.value)}
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: { min: 1, step: 1 },
                      input: {
                        startAdornment: <InputAdornment position="start" disablePointerEvents>
                          <Icon name="count" size={17} />
                        </InputAdornment>,
                      },
                    }} />
                </div>
                <div className="password-option">
                  <label className="toggle-field">
                    <Switch size="small" disabled={busy} checked={password !== undefined}
                      onChange={(event) => setPassword(event.target.checked ? makePassword() : undefined)}
                      slotProps={{ input: { role: 'switch' } }} />
                    <span>{t('extractionPassword')}</span>
                  </label>
                  {password !== undefined && (
                    <TextField className="share-password-input" variant="outlined" size="small" type="text"
                      label={t('sharePasswordValue')} required disabled={busy} value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      slotProps={{
                        htmlInput: {
                          pattern: '[A-Za-z0-9]+',
                          maxLength: 64,
                          'aria-label': t('sharePasswordValue'),
                          title: t('sharePasswordFormat'),
                          autoComplete: 'off',
                          autoCapitalize: 'none',
                          spellCheck: false,
                        },
                      }} />
                  )}
                </div>
                <DiskSpace api={api} token={token} onSessionExpired={onSessionExpired} />
              </fieldset>
              <UploadDrop file={transfer?.file} disabled={busy} onSelect={upload} />
              {activeUpload && (
                <div className="upload-status">
                  <div className="upload-status-line">
                    <p role="status">{transfer
                      ? saving ? t('saving') : t('uploading', { progress: transfer.progress.percent })
                      : t('packingFolder')}</p>
                    {transfer && !saving && <span>{formatBytes(transfer.progress.bytesPerSecond, locale)}/s</span>}
                  </div>
                  <LinearProgress className="upload-progress" variant={transfer ? 'determinate' : 'indeterminate'}
                    value={transfer?.progress.percent} aria-label={transfer ? t('uploadProgress') : t('packingFolder')} />
                  {!saving && <Button className="upload-cancel" type="button" variant="outlined"
                    onClick={cancelUpload}>
                    {t('cancelUpload')}
                  </Button>}
                </div>
              )}
            </form>
          </>
        )}
        {error && <Alert className="upload-error" severity="error" icon={false}>{t(error)}</Alert>}
        {!error && canceled && <p className="upload-canceled" role="status">{t('uploadCanceled')}</p>}
      </Paper>
      <ShareList api={api} token={token} onSessionExpired={onSessionExpired} refreshKey={shareRevision} />
    </main>
  );
}

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ApiError, errorMessageKey } from '../api.ts';
import type { PigeonApi, SharePage } from '../api.ts';
import { useBrowserLocale } from '../browserLocale.tsx';
import type { MessageKey } from '../i18n.ts';
import { formatBytes } from '../domain.ts';
import { Icon } from './Icon.tsx';
import { useCopyFeedback } from './useCopyFeedback.ts';
import './share-list.css';

type Props = {
  api: PigeonApi;
  token: string;
  onSessionExpired: () => void;
  refreshKey: number;
};

type Filters = { page: number; query: string };
type Load = {
  filters: Filters;
  refreshKey: number;
  response?: SharePage;
  error?: MessageKey;
};

function ShareDate({ seconds, dateTime }: { seconds: number; dateTime: Intl.DateTimeFormat }) {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return <span>—</span>;
  return <time dateTime={date.toISOString()}>{dateTime.format(date)}</time>;
}

function ShareRow({ item, onDelete, dateTime }: {
  item: SharePage['items'][number];
  onDelete: (id: string) => Promise<void>;
  dateTime: Intl.DateTimeFormat;
}) {
  const { locale, t } = useBrowserLocale();
  const [copy, setCopy] = useCopyFeedback(true);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<MessageKey | ''>('');
  const dialogTitle = useId();
  const dialogDescription = useId();
  const link = new URL(item.share_url, window.location.origin).href;
  const copyLabel = t('copyField', { label: t('shareLink') });
  const deleteLabel = t('deleteShareLabel', { filename: item.filename });
  const copied = copy === 'copied';

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopy('copied');
    } catch {
      setCopy('manual');
    }
  }

  async function deleteShare() {
    if (deleting) return;
    setConfirming(false);
    setDeleting(true);
    setDeleteError('');
    try {
      await onDelete(item.id);
      // Keep the action disabled until the refreshed list removes this row.
    } catch (failure) {
      setDeleteError(errorMessageKey(failure, 'deleteShareFailed'));
      setDeleting(false);
    }
  }

  return (
    <li className="shares-list-row">
      <div className="shares-list-file">
        <span className="file-icon"><Icon name="file" size={18} /></span>
        <div className="shares-list-identity">
          <a className="shares-list-name" href={link} title={item.filename}>{item.filename}</a>
          <div className="shares-list-file-meta">
            <span>{formatBytes(item.size_bytes, locale)}</span>
            {item.requires_password && (
              <span title={t('passwordProtected')} aria-label={t('passwordProtected')} role="img">
                <Icon name="lock" size={14} />
              </span>
            )}
          </div>
        </div>
      </div>
      <dl className="shares-list-details">
        <div>
          <dt>{t('uploadedAt')}</dt>
          <dd><ShareDate seconds={item.created_at} dateTime={dateTime} /></dd>
        </div>
        <div>
          <dt>{t('expiresAt')}</dt>
          <dd>{item.expires_at === null ? t('forever') : <ShareDate seconds={item.expires_at} dateTime={dateTime} />}</dd>
        </div>
        <div>
          <dt>{t('remainingDownloads')}</dt>
          <dd>{item.remaining_downloads === null ? t('unlimited') : item.remaining_downloads.toLocaleString(locale)}</dd>
        </div>
      </dl>
      <div className="shares-list-actions">
        <IconButton className="shares-list-copy" color="primary" type="button" onClick={copyLink}
          aria-label={copyLabel} title={copied ? t('copied') : copyLabel}>
          <Icon name={copied ? 'check' : 'copy'} size={18} />
        </IconButton>
        <IconButton className="shares-list-delete" color="error" type="button" disabled={deleting}
          onClick={(event) => {
            event.currentTarget.focus();
            setConfirming(true);
          }} aria-haspopup="dialog"
          aria-label={deleteLabel} aria-busy={deleting} title={deleting ? t('deletingShare') : t('deleteShare')}>
          <Icon name="trash" size={18} />
        </IconButton>
      </div>
      <Dialog open={confirming} onClose={() => setConfirming(false)}
        aria-labelledby={dialogTitle} aria-describedby={dialogDescription} maxWidth="xs" fullWidth>
        <DialogTitle id={dialogTitle}>{t('deleteShare')}</DialogTitle>
        <DialogContent>
          <DialogContentText id={dialogDescription}>
            {t('confirmDeleteShare', { filename: item.filename })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="outlined" autoFocus
            onClick={() => setConfirming(false)}>{t('cancel')}</Button>
          <Button type="button" variant="contained" color="error" onClick={deleteShare}>
            {t('deleteShare')}
          </Button>
        </DialogActions>
      </Dialog>
      {deleteError && (
        <Alert icon={false} severity="error" className="shares-list-delete-error">{t(deleteError)}</Alert>
      )}
      {copied && <span role="status" className="sr-only">{t('copiedField', { label: t('shareLink') })}</span>}
      {copy === 'manual' && (
        <TextField className="shares-list-manual-copy" variant="outlined" size="small" fullWidth
          label={t('shareLink')} helperText={t('manualCopy')} autoFocus type="url" value={link}
          slotProps={{ input: { readOnly: true } }} onFocus={(event) => event.currentTarget.select()} />
      )}
    </li>
  );
}

export function ShareList({ api, token, onSessionExpired, refreshKey }: Props) {
  const { locale, t } = useBrowserLocale();
  const dateTime = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }), [locale]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>({ page: 1, query: '' });
  const [load, setLoad] = useState<Load | null>(null);
  const results = useRef<HTMLDivElement>(null);
  const query = search.trim();
  const searchPending = query !== filters.query;

  useEffect(() => {
    if (!searchPending) return;
    const timer = window.setTimeout(() => setFilters({ query, page: 1 }), 250);
    return () => window.clearTimeout(timer);
  }, [query, searchPending]);

  useEffect(() => {
    if (searchPending) return;
    const controller = new AbortController();
    api.listShares(token, filters.page, filters.query, controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      const lastPage = Math.max(1, Math.ceil(response.total / response.page_size));
      // Deletions or expiry can shorten the list while the user is paging.
      if (response.page > lastPage) {
        setFilters({ query: filters.query, page: lastPage });
      } else {
        setLoad({ filters, refreshKey, response });
      }
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) {
        onSessionExpired();
      } else {
        setLoad({ filters, refreshKey, error: errorMessageKey(failure, 'shareListFailed') });
      }
    });
    return () => controller.abort();
  }, [api, filters, onSessionExpired, refreshKey, searchPending, token]);

  useEffect(() => {
    results.current?.scrollTo({ top: 0 });
  }, [filters.page, filters.query]);

  const current = load?.filters === filters && load.refreshKey === refreshKey && !searchPending;
  const response = load?.filters.query === query ? load.response : undefined;
  const error = current ? load.error : undefined;
  const lastPage = response ? Math.max(1, Math.ceil(response.total / response.page_size)) : 1;

  function changePage(page: number) {
    setFilters({ query: filters.query, page });
  }

  async function deleteShare(id: string) {
    try {
      await api.deleteShare(token, id);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) {
        onSessionExpired();
        return;
      }
      if (!(failure instanceof ApiError && failure.status === 404)) throw failure;
    }

    // Refresh the selected page and keep the latest search if it changed during deletion.
    setFilters((selected) => ({ ...selected }));
  }

  return (
    <Paper component="section" variant="outlined" className="shares-list workspace-card" aria-labelledby="shares-list-title">
      <div className="shares-list-header">
        <Typography component="h2" variant="h6" id="shares-list-title">{t('activeShares')}</Typography>
        <search className="shares-list-search">
          <TextField variant="outlined" size="small" fullWidth type="search" value={search}
            label={t('searchShares')} onChange={(event) => setSearch(event.currentTarget.value)} />
        </search>
      </div>
      <div ref={results} className="shares-list-results" role="group" aria-label={t('shareResults')}
        tabIndex={0} aria-busy={!current}>
        {error ? (
          <div className="shares-list-error">
            <Alert icon={false} severity="error">{t(error)}</Alert>
            <Button variant="outlined" type="button"
              onClick={() => changePage(filters.page)}>{t('retry')}</Button>
          </div>
        ) : response?.items.length ? (
          <ul className="shares-list-items">
            {response.items.map((item) => <ShareRow key={item.id} item={item} onDelete={deleteShare} dateTime={dateTime} />)}
          </ul>
        ) : current ? (
          <p className="shares-list-status" role="status">{t(query ? 'shareSearchEmpty' : 'shareListEmpty')}</p>
        ) : (
          <p className="shares-list-status" role="status">{t('reading')}</p>
        )}
      </div>
      {response && response.total > 0 && !error && (
        <footer className="shares-list-footer">
          <span className="shares-list-total" aria-live="polite">
            {t('shareTotal', { total: response.total.toLocaleString(locale) })}
          </span>
          {lastPage > 1 && (
            <nav className="shares-list-pagination" aria-label={t('sharePagination')}>
              <Button variant="outlined" type="button" disabled={!current || response.page <= 1}
                onClick={() => changePage(response.page - 1)}>{t('previousPage')}</Button>
              <span>{t('sharePagePosition', { page: response.page.toLocaleString(locale), pages: lastPage.toLocaleString(locale) })}</span>
              <Button variant="outlined" type="button" disabled={!current || response.page >= lastPage}
                onClick={() => changePage(response.page + 1)}>{t('nextPage')}</Button>
            </nav>
          )}
        </footer>
      )}
    </Paper>
  );
}

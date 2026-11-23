import type { MessageKey } from './i18n.ts';
import { appPath, uploadForm } from './domain.ts';
import type { Share, UploadOptions } from './domain.ts';

export type SharePage = {
  items: {
    id: string;
    filename: string;
    size_bytes: number;
    created_at: number;
    expires_at: number | null;
    remaining_downloads: number | null;
    requires_password: boolean;
    share_url: string;
  }[];
  page: number;
  page_size: number;
  total: number;
};

export type UploadProgress = { percent: number; bytesPerSecond: number };
export type UploadConfig = { available_bytes: number; max_file_size_bytes: number | null };
export type DownloadLink = { download_url: string; filename: string; size_bytes: number };

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, payload?.error || '');
  return payload as T;
}

export function createApi(basePath: string) {
  const apiUrl = (path: string) => appPath(basePath, `/api${path}`);
  const json = (data: object): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const session = (token: string) => ({ 'X-Pigeon-Token': token });

  return {
    login(username: string, password: string) {
      return request<{ token: string }>(apiUrl('/sessions'), json({ username, password }));
    },
    async logout(token: string) {
      await request<void>(apiUrl('/sessions'), { method: 'DELETE', headers: session(token) });
    },
    config(token: string, signal: AbortSignal) {
      return request<UploadConfig>(
        apiUrl('/config'), { headers: session(token), signal },
      );
    },
    listShares(token: string, page: number, query: string, signal: AbortSignal) {
      const params = new URLSearchParams({ page: String(page) });
      if (query) params.set('q', query);
      return request<SharePage>(apiUrl(`/shares?${params}`), { headers: session(token), signal });
    },
    async deleteShare(token: string, id: string) {
      await request<void>(apiUrl(`/shares/${encodeURIComponent(id)}`), { method: 'DELETE', headers: session(token) });
    },
    async share(token: string, file: File, options: UploadOptions, signal: AbortSignal, progress: (sample: UploadProgress) => void) {
      signal.throwIfAborted();
      const upload = new XMLHttpRequest();
      const abort = () => upload.abort();
      try {
        return await new Promise<{ share_url: string }>((resolve, reject) => {
          upload.open('POST', apiUrl('/shares'));
          upload.setRequestHeader('X-Pigeon-Token', token);
          upload.responseType = 'json';
          signal.addEventListener('abort', abort, { once: true });
          upload.addEventListener('abort', () => reject(signal.reason));
          upload.addEventListener('error', () => reject(new ApiError(0, 'network_error')));
          upload.addEventListener('load', () => {
            if (upload.status >= 200 && upload.status < 300 && typeof upload.response?.share_url === 'string') {
              resolve(upload.response);
            } else {
              reject(new ApiError(upload.status, upload.response?.error || ''));
            }
          });
          const startedAt = performance.now();
          upload.upload.addEventListener('progress', (event) => {
            if (!event.lengthComputable || event.total === 0) return;
            progress({
              percent: Math.min(99, Math.floor(event.loaded * 100 / event.total)),
              bytesPerSecond: event.loaded * 1000 / Math.max(1, performance.now() - startedAt),
            });
          });
          // Upload load means the body was sent. The response can still be pending.
          upload.upload.addEventListener('load', () => progress({ percent: 100, bytesPerSecond: 0 }));
          upload.send(uploadForm(file, options));
        });
      } finally {
        signal.removeEventListener('abort', abort);
      }
    },
    shareInfo(id: string, signal: AbortSignal) {
      return request<Share>(apiUrl(`/shares/${encodeURIComponent(id)}`), { signal });
    },
    download(id: string, password: string | undefined, signal: AbortSignal) {
      return request<DownloadLink>(
        apiUrl(`/shares/${encodeURIComponent(id)}/download-links`),
        { ...json(password ? { password } : {}), signal },
      );
    },
  };
}

export type PigeonApi = ReturnType<typeof createApi>;

const messages: Readonly<Record<string, MessageKey>> = {
  invalid_password: 'badSharePassword',
  invalid_credentials: 'invalidCredentials',
  invalid_expiry_days: 'invalidExpiryDays',
  invalid_max_downloads: 'invalidDownloadCount',
  insufficient_space: 'diskFull',
  file_too_large: 'fileTooLarge',
  rate_limited: 'rateLimited',
  network_error: 'networkError',
  upload_timeout: 'uploadTimeout',
};

export function errorMessageKey(error: unknown, fallback: MessageKey): MessageKey {
  if (error instanceof TypeError) return 'networkError';
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return error.code === 'password_cooldown' ? 'passwordCooldown' : 'rateLimited';
    }
    if (error.status === 413) return 'fileTooLarge';
    if (error.status === 507) return 'diskFull';
    if (Object.hasOwn(messages, error.code)) return messages[error.code];
  }
  return fallback;
}

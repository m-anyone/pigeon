export type Share = {
  id: string;
  filename?: string;
  size_bytes?: number;
  requires_password: boolean;
};

export type Bootstrap = {
  base_path: string;
  page: 'home' | 'sharing';
  share?: Share;
};

export type UploadOptions = {
  expiration: string;
  maxDownloads: string;
  password?: string;
};

export function readBootstrap(content: string | null): Bootstrap {
  // The placeholder is intact on the standalone Vite homepage.
  if (!content || content.startsWith('__')) {
    return { base_path: '/', page: 'home' };
  }
  const bytes = Uint8Array.from(atob(content.replace(/-/g, '+').replace(/_/g, '/')), (code) => code.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Bootstrap;
}

export function appPath(basePath: string, path = '') {
  if (!path) return basePath;
  return basePath === '/' ? path : basePath + path;
}

export function shareLinkWithPassword(link: string, password: string) {
  const url = new URL(link);
  // The fragment keeps the password out of the initial HTTP request URL.
  url.hash = new URLSearchParams({ password }).toString();
  return url.href;
}

export function passwordFromShareLink(url: URL) {
  const fragment = new URLSearchParams(url.hash.slice(1));
  return fragment.get('password') ?? url.searchParams.get('password') ?? '';
}

export function formatBytes(bytes: number, locale = 'en') {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(Math.max(1, bytes)) / Math.log(1024)));
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / (1024 ** exponent))} ${units[exponent]}`;
}

export function formatUploadLimit(bytes: number, locale = 'en') {
  const inGigabytes = bytes >= 1_000_000_000;
  const unitBytes = inGigabytes ? 1_000_000_000 : 1_000_000;
  const amount = new Intl.NumberFormat(locale, { maximumFractionDigits: inGigabytes ? 9 : 6 });
  return `${amount.format(bytes / unitBytes)} ${inGigabytes ? 'GB' : 'MB'}`;
}

export function makePassword() {
  // The alphabet has 32 symbols, so masking is uniform for random bytes.
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (byte) => alphabet[byte & 31]).join('');
}

export function uploadForm(file: File, options: UploadOptions) {
  const body = new FormData();
  if (options.expiration !== '') body.set('expiry_days', options.expiration);
  if (options.maxDownloads !== '') body.set('max_downloads', options.maxDownloads);
  if (options.password) body.set('password', options.password);
  body.set('file', file);
  return body;
}

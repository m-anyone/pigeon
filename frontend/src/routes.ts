export type Route =
  | { page: 'home' | 'login' | 'notFound' }
  | { page: 'sharing'; id: string; password: string };

const sharePrefix = '#/sharing/';
const shareId = /^[0-9a-f]{32}$/;

export function readRoute(hash: string): Route {
  if (!hash || hash === '#/') return { page: 'home' };
  if (hash === '#/login') return { page: 'login' };
  if (!hash.startsWith(sharePrefix)) return { page: 'notFound' };

  const queryIndex = hash.indexOf('?');
  const id = queryIndex === -1 ? hash.slice(sharePrefix.length) : hash.slice(sharePrefix.length, queryIndex);
  if (!shareId.test(id)) return { page: 'notFound' };
  const params = new URLSearchParams(queryIndex === -1 ? '' : hash.slice(queryIndex + 1));
  return { page: 'sharing', id, password: params.get('password') ?? '' };
}

export function shareLinkWithPassword(link: string, password: string): string {
  const url = new URL(link);
  const route = readRoute(url.hash);
  if (route.page !== 'sharing') return url.href;
  // The fragment carries the password without including it in the HTTP URL.
  url.search = '';
  url.hash = sharingHash(route.id, password);
  return url.href;
}

function sharingHash(id: string, password: string): string {
  const query = password ? `?${new URLSearchParams({ password })}` : '';
  return `${sharePrefix}${id}${query}`;
}

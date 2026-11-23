type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function createSessionStore(
  basePath: string,
  storage: () => SessionStorage = () => window.sessionStorage,
) {
  const key = `pigeon.session:${basePath}`;

  return {
    read(): string {
      try {
        return storage().getItem(key) ?? '';
      } catch {
        return '';
      }
    },
    write(token: string): void {
      try {
        if (token) storage().setItem(key, token);
        else storage().removeItem(key);
      } catch {
        // The page can keep using its in-memory session if storage is blocked.
      }
    },
  };
}

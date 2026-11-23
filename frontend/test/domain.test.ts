import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { appPath, formatBytes, makePassword, passwordFromShareLink, readBootstrap, shareLinkWithPassword, uploadForm } from '../src/domain.ts';

test('loads non-ASCII sharing metadata from the backend bootstrap', () => {
  const bootstrap = {
    base_path: '/pigeon',
    page: 'sharing',
    share: { id: 'abc', filename: '信鸽.txt', requires_password: false, size_bytes: 42 },
  };
  assert.deepEqual(readBootstrap(Buffer.from(JSON.stringify(bootstrap)).toString('base64url')), bootstrap);
  assert.deepEqual(readBootstrap('__PIGEON_BOOTSTRAP__'), { base_path: '/', page: 'home' });
});

test('keeps links inside the configured base path', () => {
  assert.equal(appPath('/', '/api/storage'), '/api/storage');
  assert.equal(appPath('/pigeon', '/api/storage'), '/pigeon/api/storage');
  assert.equal(appPath('/pigeon'), '/pigeon');
});

test('includes the share password in the fragment and preserves the share ID and base path', () => {
  const link = 'https://example.com/pigeon/sharing?id=abc';
  const password = 'a+b&c=#';
  const url = new URL(shareLinkWithPassword(link, password));
  assert.equal(url.pathname, '/pigeon/sharing');
  assert.equal(url.search, '?id=abc');
  assert.equal(url.hash, '#password=a%2Bb%26c%3D%23');
  assert.equal(passwordFromShareLink(url), password);
  assert.equal(passwordFromShareLink(new URL(link)), '');
});

test('reads passwords from share query parameters and prioritizes the fragment', () => {
  const url = new URL('https://example.com/sharing?id=abc&password=First2');
  assert.equal(passwordFromShareLink(url), 'First2');
  url.hash = '#password=Second3';
  assert.equal(passwordFromShareLink(url), 'Second3');
});

test('omits cleared optional upload settings and sends configured values', () => {
  const file = new File(['hello'], 'test.txt');
  const unlimited = uploadForm(file, { expiration: '', maxDownloads: '' });
  assert.deepEqual(Array.from(unlimited.keys()), ['file']);
  assert.equal(unlimited.get('file'), file);

  const limited = uploadForm(file, { expiration: '7', maxDownloads: '2', password: 'ABCDEFGH' });
  assert.equal(limited.get('expiry_days'), '7');
  assert.equal(limited.get('max_downloads'), '2');
  assert.equal(limited.get('password'), 'ABCDEFGH');
});

test('generates five-character passwords with unambiguous letters and digits', () => {
  for (let i = 0; i < 64; i += 1) assert.match(makePassword(), /^[2-9A-HJ-NP-Z]{5}$/);
});

test('formats filesystem space and file sizes in IEC units', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1 KiB');
  assert.equal(formatBytes(1024 ** 3 * 1.5), '1.5 GiB');
});

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createSessionStore } from '../src/session.ts';

function tabStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  };
}

test('reads the same session after navigating or reloading in a tab', () => {
  const storage = tabStorage();
  const store = () => createSessionStore('/pigeon', () => storage);
  assert.equal(store().read(), '');
  store().write('token');
  assert.equal(store().read(), 'token');
  store().write('');
  assert.equal(store().read(), '');
});

test('keeps session data separate for each deployment and tab', () => {
  const storage = tabStorage();
  const first = createSessionStore('/pigeon', () => storage);
  const second = createSessionStore('/', () => storage);
  const freshTab = tabStorage();
  first.write('first');
  second.write('second');
  assert.equal(createSessionStore('/pigeon', () => freshTab).read(), '');
  first.write('');
  assert.equal(second.read(), 'second');
});

test('allows login with storage blocked by the browser', () => {
  const store = createSessionStore('/', () => { throw new Error('storage blocked'); });
  assert.equal(store.read(), '');
  assert.doesNotThrow(() => store.write('token'));
  assert.doesNotThrow(() => store.write(''));
});

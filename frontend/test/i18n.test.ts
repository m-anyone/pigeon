import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { detectLocale, isLocale, translate } from '../src/i18n.ts';

test('uses browser language preference order and falls back to English', () => {
  assert.equal(detectLocale(['fr-FR', 'zh-CN', 'en-GB']), 'zh-Hans');
  assert.equal(detectLocale(['en-GB', 'zh-TW']), 'en');
  assert.equal(detectLocale(['???', 'ja-JP']), 'en');
  assert.equal(detectLocale([]), 'en');
});

test('selects Chinese scripts before regional defaults', () => {
  assert.equal(detectLocale(['zh']), 'zh-Hans');
  assert.equal(detectLocale(['zh-TW']), 'zh-Hant');
  assert.equal(detectLocale(['zh_HK']), 'zh-Hant');
  assert.equal(detectLocale(['zh-MO']), 'zh-Hant');
  assert.equal(detectLocale(['zh-Hans-TW']), 'zh-Hans');
  assert.equal(detectLocale(['zh-Hant-CN']), 'zh-Hant');
});

test('only accepts supported language codes stored by the language switcher', () => {
  for (const language of ['en', 'zh-Hans', 'zh-Hant']) assert.ok(isLocale(language));
  for (const language of [null, 'zh-CN', 'fr', 'constructor']) assert.ok(!isLocale(language));
});

test('translates copy and progress with interpolation', () => {
  assert.equal(translate('zh-Hans', 'brand'), '信鸽');
  assert.equal(translate('zh-Hant', 'copyField', { label: translate('zh-Hant', 'shareLink') }), '複製分享連結');
  assert.equal(translate('en', 'uploading', { progress: 0 }), 'Uploading (0%)');
});

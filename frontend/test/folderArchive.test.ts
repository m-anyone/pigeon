import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js/lib/zip-core-native.js';
import { archiveFiles, archiveFolder } from '../src/folderArchive.ts';

function selectedFile(path: string, text = '') {
  return { path, file: new File([text], path.split('/').at(-1)!) };
}

async function readFiles(archive: File) {
  const reader = new ZipReader(new BlobReader(archive));
  try {
    const files: [string, string][] = [];
    for (const entry of await reader.getEntries()) {
      assert.ok(!entry.directory);
      files.push([entry.filename, await entry.getData(new TextWriter())]);
    }
    return files;
  } finally {
    await reader.close();
  }
}

test('compresses individual files at the root of one ZIP archive', async () => {
  const text = '信鸽 archive\n'.repeat(200);
  const zip = await archiveFiles([new File([text], '信件.txt'), new File([], '空.txt')]);
  assert.equal(zip.name, 'files.zip');
  assert.equal(zip.type, 'application/zip');
  assert.ok(zip.size < new TextEncoder().encode(text).length);
  assert.deepEqual(await readFiles(zip), [['信件.txt', text], ['空.txt', '']]);
});

test('numbers duplicate filenames while retaining extensions and existing names', async () => {
  const names = ['Report.txt', 'report.txt', 'Report (2).txt', 'Report.txt', 'é.txt', 'e\u0301.txt', '.env', '.env'];
  const zip = await archiveFiles(names.map((name, index) => new File([String(index)], name)));
  assert.deepEqual(await readFiles(zip), [
    ['Report.txt', '0'],
    ['report (3).txt', '1'],
    ['Report (2).txt', '2'],
    ['Report (4).txt', '3'],
    ['é.txt', '4'],
    ['e\u0301 (2).txt', '5'],
    ['.env', '6'],
    ['.env (2)', '7'],
  ]);
});

test('gives unsafe filenames unique top-level paths', async () => {
  const names = ['../escape.txt', '..\\escape.txt', 'C:/drive.txt', ' .. ', 'aux.txt', '\u0000.txt', ' trailing.txt. ', 'trailing.txt'];
  const zip = await archiveFiles(names.map((name, index) => new File([String(index)], name)));
  assert.deepEqual(await readFiles(zip), [
    ['.._escape.txt', '0'],
    ['.._escape (2).txt', '1'],
    ['C__drive.txt', '2'],
    ['file', '3'],
    ['_aux.txt', '4'],
    ['_.txt', '5'],
    ['trailing.txt', '6'],
    ['trailing (2).txt', '7'],
  ]);
});

test('compresses a folder while preserving nested Unicode paths and empty files', async () => {
  const text = '信鸽 archive\n'.repeat(200);
  const zip = await archiveFolder([
    selectedFile('资料/子目录/信件.txt', text),
    selectedFile('资料/空.txt'),
  ]);
  assert.equal(zip.name, '资料.zip');
  assert.equal(zip.type, 'application/zip');
  assert.ok(zip.size < new TextEncoder().encode(text).length);

  const reader = new ZipReader(new BlobReader(zip));
  try {
    const [nested, empty] = await reader.getEntries();
    assert.equal(nested.filename, '资料/子目录/信件.txt');
    assert.equal(empty.filename, '资料/空.txt');
    assert.ok(!nested.directory && !empty.directory);
    assert.equal(await nested.getData(new TextWriter()), text);
    assert.equal(empty.uncompressedSize, 0);
    assert.equal(await empty.getData(new TextWriter()), '');
  } finally {
    await reader.close();
  }
});

test('rejects an empty selection and paths outside the selected folder', async () => {
  await assert.rejects(archiveFolder([]), /Empty folder/);
  for (const path of ['/absolute.txt', 'C:/drive.txt', 'root/../parent.txt', 'root/nested\\..\\file', 'file.txt']) {
    await assert.rejects(archiveFolder([selectedFile(path)]), /Invalid folder path/, path);
  }
  await assert.rejects(archiveFolder([
    selectedFile('root/first.txt'),
    selectedFile('other/second.txt'),
  ]), /Invalid folder path/);
});

test('fits a long archive filename within the server limit at a Unicode boundary', async () => {
  const zip = await archiveFolder([selectedFile('鸽'.repeat(85) + '/file.txt')]);
  assert.equal(zip.name, '鸽'.repeat(83) + '.zip');
  assert.ok(new TextEncoder().encode(zip.name).length <= 255);
});

test('discards an archive when compression is canceled', async () => {
  const controller = new AbortController();
  const packing = archiveFolder([selectedFile('root/file.txt', 'content'.repeat(1024))], controller.signal);
  controller.abort();
  await assert.rejects(packing, { name: 'AbortError' });
});

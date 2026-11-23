import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readDroppedFolder } from '../src/folderSelection.ts';

function fileEntry(name: string, text = '') {
  return {
    name,
    isFile: true,
    file: (resolve: FileCallback) => resolve(new File([text], name)),
  } as FileSystemFileEntry;
}

function directoryEntry(name: string, batches: FileSystemEntry[][]) {
  return {
    name,
    isDirectory: true,
    createReader() {
      const remaining = batches.values();
      return { readEntries: (resolve: FileSystemEntriesCallback) => resolve(remaining.next().value ?? []) };
    },
  } as FileSystemDirectoryEntry;
}

test('reads all batches and nested file paths in a dropped directory', async () => {
  const root = directoryEntry('资料', [
    [directoryEntry('子目录', [[fileEntry('信件.txt', 'Pigeon')]]), fileEntry('空文件.txt')],
    [fileEntry('另一批.txt')],
  ]);
  const files = await readDroppedFolder(root);
  assert.deepEqual(files.map(({ path }) => path), ['资料/子目录/信件.txt', '资料/空文件.txt', '资料/另一批.txt']);
  assert.equal(await files[0].file.text(), 'Pigeon');
  assert.equal(files[1].file.size, 0);
});

test('handles an empty folder and reports unreadable entries', async () => {
  assert.deepEqual(await readDroppedFolder(directoryEntry('empty', [])), []);
  const failure = new DOMException('Could not read file', 'NotReadableError');
  const brokenFile = {
    name: 'broken',
    isFile: true,
    file: (_resolve: FileCallback, reject: ErrorCallback) => reject(failure),
  } as FileSystemFileEntry;
  const root = directoryEntry('root', [[fileEntry('readable'), brokenFile]]);
  await assert.rejects(readDroppedFolder(root), failure);
});

test('cancels immediately while a dropped directory is awaiting its entries', async () => {
  const controller = new AbortController();
  let completeRead: FileSystemEntriesCallback | undefined;
  const root = {
    name: 'root',
    createReader: () => ({ readEntries: (resolve: FileSystemEntriesCallback) => { completeRead = resolve; } }),
  } as FileSystemDirectoryEntry;
  const reading = readDroppedFolder(root, controller.signal);
  controller.abort();
  await assert.rejects(reading, { name: 'AbortError' });
  completeRead?.([fileEntry('late.txt')]);
});

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { selectDroppedFiles, selectFiles } from '../src/uploadSelection.ts';

function dropped(files: File[], items: DataTransferItem[] = []): Pick<DataTransfer, 'files' | 'items'> {
  return { files: files as unknown as FileList, items: items as unknown as DataTransferItemList };
}

function dropItem(kind: 'file' | 'string', entry: FileSystemEntry | null = null): DataTransferItem {
  return { kind, type: '', getAsFile: () => null, getAsString: () => {}, webkitGetAsEntry: () => entry };
}

test('keeps a single picked file intact and groups all files from a multiple selection', () => {
  const first = new File(['first'], 'first.txt');
  const second = new File(['second'], 'second.txt');
  assert.equal(selectFiles([]), undefined);
  const single = selectFiles([first]);
  assert.equal(single?.kind, 'file');
  assert.equal(single.file, first);
  assert.deepEqual(selectFiles([first, second]), { kind: 'files', files: [first, second] });
});

test('groups all dropped files when native entries are unavailable', () => {
  const files = [new File([], 'first.txt'), new File([], 'second.txt')];
  assert.deepEqual(selectDroppedFiles(dropped(files)), { kind: 'files', files });
});

test('groups dropped file entries and ignores non-file items', () => {
  const fileItem = dropItem('file', { isDirectory: false } as FileSystemFileEntry);
  const textItem = dropItem('string');
  const files = [new File([], 'first.txt'), new File([], 'second.txt')];
  assert.deepEqual(selectDroppedFiles(dropped(files, [fileItem, textItem, fileItem])), { kind: 'files', files });
  assert.deepEqual(selectDroppedFiles(dropped([files[0]], [textItem, fileItem])), { kind: 'file', file: files[0] });
});

test('routes a folder drop to the directory reader and asks for a separate drop if mixed with files', () => {
  const entry = { name: 'folder', isDirectory: true } as FileSystemDirectoryEntry;
  const folderItem = dropItem('file', entry);
  const fileItem = dropItem('file');
  assert.deepEqual(selectDroppedFiles(dropped([], [folderItem])), { kind: 'droppedFolder', entry });
  assert.equal(selectDroppedFiles(dropped([new File([], 'file.txt')], [folderItem, fileItem])), 'dropFolderSeparately');
});

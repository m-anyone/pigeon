import type { FolderFile } from './folderSelection.ts';

export type UploadSelection =
  | { kind: 'file'; file: File }
  | { kind: 'files'; files: File[] }
  | { kind: 'folder'; files: FolderFile[] }
  | { kind: 'droppedFolder'; entry: FileSystemDirectoryEntry };

export function selectFiles(files: FileList | readonly File[]): UploadSelection | undefined {
  if (files.length === 1) return { kind: 'file', file: files[0] };
  if (files.length > 1) return { kind: 'files', files: Array.from(files) };
}

export function selectDroppedFiles(
  transfer: Pick<DataTransfer, 'files' | 'items'>,
): UploadSelection | 'dropFolderSeparately' | undefined {
  const fileItems = Array.from(transfer.items).filter((item) => item.kind === 'file');
  for (const item of fileItems) {
    // Directory entries are available only while handling the drop event.
    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      if (fileItems.length > 1 || transfer.files.length > 1) return 'dropFolderSeparately';
      return { kind: 'droppedFolder', entry: entry as FileSystemDirectoryEntry };
    }
  }
  return selectFiles(transfer.files);
}

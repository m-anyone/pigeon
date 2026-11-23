export type FolderFile = { file: File; path: string };

export async function readDroppedFolder(root: FileSystemDirectoryEntry, signal?: AbortSignal): Promise<FolderFile[]> {
  const files: FolderFile[] = [];

  async function readDirectory(directory: FileSystemDirectoryEntry, prefix: string) {
    signal?.throwIfAborted();
    const reader = directory.createReader();
    // A directory reader can return several batches before signaling completion.
    while (true) {
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      signal?.throwIfAborted();
      if (entries.length === 0) return;
      for (const entry of entries) {
        const path = prefix + '/' + entry.name;
        if (entry.isDirectory) {
          await readDirectory(entry as FileSystemDirectoryEntry, path);
        } else if (entry.isFile) {
          const fileEntry = entry as FileSystemFileEntry;
          const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));
          signal?.throwIfAborted();
          files.push({ file, path });
        }
      }
    }
  }

  // Native reads cannot be interrupted, so let cancellation release the caller
  // immediately and have the traversal discard any late results.
  let abort: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      abort = () => reject(signal?.reason);
      signal?.addEventListener('abort', abort, { once: true });
      readDirectory(root, root.name).then(resolve, reject);
    });
  } finally {
    if (abort) signal?.removeEventListener('abort', abort);
  }
  return files;
}

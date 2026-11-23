import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js/lib/zip-core-native.js';

import type { FolderFile } from './folderSelection.ts';

const mimeType = 'application/zip';

export async function archiveFolder(files: readonly FolderFile[], signal?: AbortSignal): Promise<File> {
  signal?.throwIfAborted();
  if (!files.length) throw new Error('Empty folder selection');
  const root = files[0].path.split('/')[0];

  // While preserving the browser's relative paths, reject entries that ZIP
  // extractors could treat as absolute paths or as traversal on any platform.
  for (const { path } of files) {
    const parts = path.split('/');
    if (parts.length < 2 || parts[0] !== root || parts.some((part) =>
      !part || part === '.' || part === '..' || /^[a-z]:/i.test(part) ||
      /[\\\u0000-\u001f\u007f-\u009f]/u.test(part)
    )) {
      throw new Error('Invalid folder path');
    }
  }

  // The server accepts up to 255 UTF-8 bytes, including the .zip suffix.
  const { read } = new TextEncoder().encodeInto(root, new Uint8Array(251));
  const archiveName = root.slice(0, read) + '.zip';
  const writer = new BlobWriter(mimeType);
  // Stream one file at a time, using the embedded/native codecs allowed by CSP.
  const zip = new ZipWriter<Blob>(writer, { useWebWorkers: false });
  try {
    for (const { path, file } of files) {
      await zip.add(path, new BlobReader(file), { lastModDate: new Date(file.lastModified), signal });
    }
    signal?.throwIfAborted();
    const contents = await zip.close();
    signal?.throwIfAborted();
    return new File([contents], archiveName, { type: mimeType });
  } catch (error) {
    await writer.writable.abort(error).catch(() => {});
    throw error;
  }
}

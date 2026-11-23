import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js/lib/zip-core-native.js';

import type { FolderFile } from './folderSelection.ts';

const mimeType = 'application/zip';

export async function archiveFiles(files: readonly File[], signal?: AbortSignal): Promise<File> {
  signal?.throwIfAborted();
  if (!files.length) throw new Error('Empty file selection');

  const names = files.map((file) => safeFileName(file.name));
  const reserved = new Set(names.map(fileNameKey));
  const nextSuffix = new Map<string, number>();
  const entries = files.map((file, index) => {
    const name = names[index];
    const key = fileNameKey(name);
    let suffix = nextSuffix.get(key);
    if (suffix === undefined) {
      nextSuffix.set(key, 2);
      return { file, path: name };
    }

    // Reserve all original names before numbering duplicates so a generated name cannot take one.
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : '';
    let path: string;
    do {
      path = `${stem} (${suffix})${extension}`;
      suffix += 1;
    } while (reserved.has(fileNameKey(path)));
    reserved.add(fileNameKey(path));
    nextSuffix.set(key, suffix);
    return { file, path };
  });
  return writeArchive('files.zip', entries, signal);
}

function safeFileName(name: string): string {
  // Give each file one extractable path segment, including on Windows.
  const safe = name.replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/gu, '_')
    .trimStart().replace(/[.\s]+$/u, '') || 'file';
  return /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]) *(?:\.|$)/iu.test(safe) ? `_${safe}` : safe;
}

function fileNameKey(name: string): string {
  // Filesystems can treat case and canonically equivalent Unicode names as the same path.
  return name.normalize('NFC').toLowerCase();
}

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
  return writeArchive(archiveName, files, signal);
}

async function writeArchive(archiveName: string, files: readonly FolderFile[], signal?: AbortSignal): Promise<File> {
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

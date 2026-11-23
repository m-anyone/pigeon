import Button from '@mui/material/Button';
import { useRef } from 'react';
import { useBrowserLocale } from '../browserLocale.tsx';
import { formatBytes } from '../domain.ts';
import { selectFiles } from '../uploadSelection.ts';
import type { UploadSelection } from '../uploadSelection.ts';
import { Icon } from './Icon.tsx';

const supportsFolderPicker = 'webkitdirectory' in HTMLInputElement.prototype;

export function UploadDrop({ file, disabled, onSelect }: {
  file?: File;
  disabled: boolean;
  onSelect: (selection: UploadSelection) => void;
}) {
  const { locale, t } = useBrowserLocale();
  const input = useRef<HTMLInputElement>(null);

  function pick(directory: boolean) {
    if (!input.current) return;
    input.current.webkitdirectory = directory;
    input.current.multiple = !directory;
    input.current.click();
  }

  return (
    <div className="drop-zone" aria-disabled={disabled || undefined}>
      {file && <span className="drop-file"><b title={file.name}>{file.name}</b><span>{formatBytes(file.size, locale)}</span></span>}
      <div className="drop-actions">
        <Button type="button" variant="outlined" disabled={disabled}
          onClick={() => pick(false)} startIcon={<Icon name="upload" size={18} />}>
          {t('uploadFiles')}
        </Button>
        {supportsFolderPicker && (
          <Button type="button" variant="outlined" disabled={disabled}
            onClick={() => pick(true)} startIcon={<Icon name="folder" size={18} />}>
            {t('uploadFolder')}
          </Button>
        )}
      </div>
      {!disabled && <p className="drop-hint">{t(supportsFolderPicker ? 'fileOrFolderDrop' : 'fileDrop')}</p>}
      <input ref={input} type="file" multiple hidden disabled={disabled} onChange={(event) => {
        const picker = event.currentTarget;
        const files = picker.files ?? [];
        const selection: UploadSelection | undefined = picker.webkitdirectory
          ? { kind: 'folder', files: Array.from(files, (file) => ({ file, path: file.webkitRelativePath })) }
          : selectFiles(files);
        picker.value = '';
        if (selection) onSelect(selection);
      }} />
    </div>
  );
}

import Button from '@mui/material/Button';
import { useRef } from 'react';
import { useBrowserLocale } from '../browserLocale.tsx';
import { formatBytes } from '../domain.ts';
import type { UploadSelection } from '../folderSelection.ts';
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
    input.current.click();
  }

  return (
    <div className="drop-zone" aria-disabled={disabled || undefined}>
      {file && <span className="drop-file"><b title={file.name}>{file.name}</b><span>{formatBytes(file.size, locale)}</span></span>}
      <div className="drop-actions">
        <Button type="button" variant="outlined" disabled={disabled}
          onClick={() => pick(false)} startIcon={<Icon name="upload" size={18} />}>
          {t('uploadFile')}
        </Button>
        {supportsFolderPicker && (
          <Button type="button" variant="outlined" disabled={disabled}
            onClick={() => pick(true)} startIcon={<Icon name="folder" size={18} />}>
            {t('uploadFolder')}
          </Button>
        )}
      </div>
      {!disabled && <p className="drop-hint">{t(supportsFolderPicker ? 'fileOrFolderDrop' : 'fileDrop')}</p>}
      <input ref={input} type="file" hidden disabled={disabled} onChange={(event) => {
        const picker = event.currentTarget;
        const files = Array.from(picker.files ?? []);
        picker.value = '';
        if (picker.webkitdirectory) onSelect(files.map((file) => ({ file, path: file.webkitRelativePath })));
        else if (files.length) onSelect(files[0]);
      }} />
    </div>
  );
}

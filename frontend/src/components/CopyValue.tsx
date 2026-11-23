import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useBrowserLocale } from '../browserLocale.tsx';
import { useId, useRef } from 'react';
import { Icon } from './Icon.tsx';
import { useCopyFeedback } from './useCopyFeedback.ts';

type Props = {
  label: string;
  value: string;
  actionLabel?: string;
  resetAfterCopy?: boolean;
};

export function CopyValue({ label, value, actionLabel, resetAfterCopy = false }: Props) {
  const { t } = useBrowserLocale();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useCopyFeedback(resetAfterCopy);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('copied');
    } catch {
      input.current?.focus();
      input.current?.select();
      setStatus('manual');
    }
  }

  const separateButton = actionLabel !== undefined;
  const copied = status === 'copied';
  const buttonLabel = actionLabel ?? t('copyField', { label });
  const icon = <Icon name={copied ? 'check' : 'copy'} size={17} />;
  const button = separateButton ? (
    <Button type="button" variant="outlined" startIcon={icon} aria-label={buttonLabel} onClick={copy}>
      {copied ? t('copied') : actionLabel}
    </Button>
  ) : (
    <IconButton type="button" color="primary" aria-label={buttonLabel}
      title={copied ? t('copied') : buttonLabel} onClick={copy}>
      {icon}
    </IconButton>
  );

  return (
    <Stack spacing={1}>
      {separateButton && button}
      {(!separateButton || status === 'manual') && (
        <TextField id={id} inputRef={input} label={label} value={value} variant="outlined"
          fullWidth autoFocus={separateButton} helperText={status === 'manual' ? t('manualCopy') : undefined}
          slotProps={{
            input: {
              readOnly: true,
              endAdornment: !separateButton && <InputAdornment position="end">{button}</InputAdornment>,
            },
            htmlInput: { spellCheck: false },
            formHelperText: { role: 'status' },
          }}
          onFocus={separateButton ? (event) => event.currentTarget.select() : undefined} />
      )}
      <span className="sr-only" role="status">
        {copied ? t('copiedField', { label }) : ''}
      </span>
    </Stack>
  );
}

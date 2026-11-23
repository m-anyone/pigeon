import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useId, useState } from 'react';
import { useBrowserLocale } from '../browserLocale.tsx';
import type { Locale } from '../i18n.ts';
import { Icon } from './Icon.tsx';

const languages: readonly { locale: Locale; label: string }[] = [
  { locale: 'zh-Hans', label: '简体中文' },
  { locale: 'zh-Hant', label: '繁體中文' },
  { locale: 'en', label: 'English' },
];

export function LanguageSwitcher() {
  const { locale, t, setLocale } = useBrowserLocale();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const triggerId = useId();
  const optionsId = useId();
  const open = anchor !== null;

  function close() {
    setAnchor(null);
  }

  return (
    <div className="language-switcher">
      <Button id={triggerId} type="button" variant="outlined" className="language-trigger"
        aria-label={t('switchLanguage')} title={t('switchLanguage')} aria-haspopup="menu"
        aria-expanded={open} aria-controls={open ? optionsId : undefined}
        onClick={(event) => {
          event.currentTarget.focus();
          setAnchor(event.currentTarget);
        }}>
        <Icon name="globe" size={18} />
      </Button>
      <Menu open={open} anchorEl={anchor} onClose={close} disableScrollLock
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ list: { id: optionsId, 'aria-labelledby': triggerId }, paper: { className: 'language-options' } }}>
        {languages.map(({ locale: option, label }) => (
          <MenuItem key={option} lang={option} selected={option === locale}
            role="menuitemradio" aria-checked={option === locale} onClick={() => {
              setLocale(option);
              close();
            }}>
            {label}
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}

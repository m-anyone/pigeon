import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { useBrowserLocale } from '../browserLocale.tsx';
import { BrandSymbol, PigeonArt, repositoryUrl } from './Brand.tsx';
import { LanguageSwitcher } from './LanguageSwitcher.tsx';

type Props = { title: string; linkTitle?: boolean; children: ReactNode };

export function EntryLayout({ title, linkTitle = false, children }: Props) {
  const { t } = useBrowserLocale();

  return (
    <Paper component="main" elevation={1} className="entry-grid">
      <div className="art-panel"><PigeonArt /></div>
      <section className="entry-panel">
        <div className="entry-language"><LanguageSwitcher /></div>
        <div className="entry-content">
          <div className="entry-heading">
            {!linkTitle && (
              <a className="entry-logo" href={repositoryUrl} aria-label={t('repositoryLink')}><BrandSymbol /></a>
            )}
            <Typography component="h1" variant="h4">
              {linkTitle ? <a className="entry-title-link" href={repositoryUrl}><BrandSymbol />{title}</a> : title}
            </Typography>
          </div>
          {children}
        </div>
      </section>
    </Paper>
  );
}

import logo from '../assets/pigeon-logo.png';
import mascot from '../assets/pigeon-mascot.webp';
import { useBrowserLocale } from '../browserLocale.tsx';

export const repositoryUrl = 'https://github.com/mebtte/pigeon';

export function BrandSymbol() {
  return <img className="brand-symbol" src={logo} alt="" width="96" height="96" />;
}

export function Brand() {
  const { t } = useBrowserLocale();
  return (
    <a className="brand" href={repositoryUrl} aria-label={t('repositoryLink')}>
      <BrandSymbol />
      <span>{t('brand')}</span>
    </a>
  );
}

export function PigeonArt() {
  return <img className="pigeon-art" src={mascot} alt="" width="768" height="512" draggable={false} />;
}

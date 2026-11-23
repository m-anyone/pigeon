import { useId } from 'react';
import { useBrowserLocale } from '../browserLocale.tsx';

export const repositoryUrl = 'https://github.com/mebtte/pigeon';

export function BrandSymbol() {
  return (
    <span className="brand-symbol" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none">
        <path fill="#dce6ec" d="M10 31c5 0 8-2 10-6-4-4-6-9-5-14 4 2 9 5 12 9 2-4 5-5 8-4l4 4-5 2c-1 9-7 15-17 15h-5l3-4z"/>
        <path d="M14.8 32.7c4.9-1.7 9.1-4.7 11.5-8.2" stroke="#415664" strokeWidth="1.3" strokeLinecap="round"/>
        <circle cx="33" cy="19.3" r="1.1" fill="#874b40"/>
      </svg>
    </span>
  );
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
  const id = useId();
  const neckGradient = `${id}-neck`;
  const eyeGradient = `${id}-eye`;

  return (
    <svg className="pigeon-art" width="520" height="470" viewBox="0 0 520 470" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={neckGradient} x1="379" y1="155" x2="347" y2="234" gradientUnits="userSpaceOnUse">
          <stop stopColor="#657989"/>
          <stop offset=".48" stopColor="#637786"/>
          <stop offset=".76" stopColor="#50776f"/>
          <stop offset="1" stopColor="#696a7f"/>
        </linearGradient>
        <radialGradient id={eyeGradient}>
          <stop offset=".51" stopColor="#22313b"/>
          <stop offset=".61" stopColor="#935246"/>
          <stop offset="1" stopColor="#c4815e"/>
        </radialGradient>
      </defs>
      <path d="M54 337c-11-42 50-117 118-177 60-53 161-88 214-54 53 34 72 113 42 176-28 60-87 97-154 107-88 14-210-14-220-52Z" fill="#e0e9ee"/>
      <circle cx="346" cy="127" r="76" fill="#f4eadc"/>
      <circle cx="441" cy="289" r="16" fill="#d7e5e9"/>
      <circle cx="85" cy="174" r="12" fill="#f4eadc"/>
      <circle cx="444" cy="164" r="4" fill="#a78476"/>
      <circle cx="141" cy="119" r="4" fill="#718996"/>
      <path d="M417 83v28m-14-14h28m11 21v16m-8-8h16M107 218v17m-8.5-8.5h17" stroke="#8ca5ac" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M49 316c14 42 62 66 130 48 58-15 118-51 104-73-17-25-75 1-61 40 13 36 95 63 187 28" stroke="#8199a4" strokeWidth="1.6" strokeDasharray="4 8" strokeLinecap="round"/>
      <ellipse cx="258" cy="411" rx="97" ry="13" fill="#a8bac6" opacity=".4"/>
      <path d="M247 282c-22 12-40 25-55 48l41 4 40-49-26-3Z" fill="#506573" stroke="#22313b" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M246 268c-14 21-39 44-59 51-9 3-15 1-23-2l71-58 11 9Z" fill="#8da0ad" stroke="#22313b" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M297 221c-20-29-21-68-9-106 17 27 24 58 22 87l-13 19Z" fill="#748898" stroke="#22313b" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M300 208c19-3 31-38 58-51 22-11 44 0 48 19 4 18-11 32-29 39-9 5-7 12-10 21-13 49-50 78-105 76-24-1-51-11-62-28-7-11 1-23 14-35 20-21 51-35 86-41Z" fill="#b4c1ca" stroke="#22313b" strokeWidth="2.2"/>
      <path d="M360 158c22-10 42 0 46 18 4 18-11 32-29 39-8 4-7 11-10 21-12-4-31-13-38-23 7-14 17-48 31-55Z" fill={`url(#${neckGradient})`}/>
      <path d="M402 179l25 11-28 8c5-6 6-12 3-19Z" fill="#ac9789" stroke="#22313b" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M371 218c4-4 12-5 21-10" stroke="#354956" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="386" cy="179" r="4.3" fill={`url(#${eyeGradient})`}/>
      <circle cx="387" cy="178" r="1.1" fill="#fcf5e9"/>
      <path d="M354 190c3 4 8 6 14 5" stroke="#9bb0aa" strokeWidth="2" strokeLinecap="round"/>
      <path d="M232 262c-27-11-52-29-71-53-24-31-34-63-27-89 27 24 70 40 111 44 31 2 52 17 65 39-28 4-46 18-53 35-5 13-12 21-25 24Z" fill="#9bafbe" stroke="#22313b" strokeWidth="2.2" strokeLinejoin="round"/>
      <path d="M137 139c16 36 54 58 102 63m-86-19c18 30 44 48 78 55m29-55c15 4 26 11 35 22" stroke="#425461" strokeWidth="2" strokeLinecap="round"/>
      <path d="M246 274c17 5 31 5 43-1m-38 10c12 4 23 4 33 0" stroke="#788e9e" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M298 306c-2 9-1 16 3 22m12-26c-1 9 0 14 4 19" stroke="#945a55" strokeWidth="2.1" strokeLinecap="round"/>
      <path d="M295 327l14 2m4-9 12 2" stroke="#945a55" strokeWidth="2.1" strokeLinecap="round"/>
      <g stroke="#685144" strokeWidth="2" strokeLinejoin="round">
        <path d="m209 352 29-17 69 15-29 17Z" fill="#efd7b4"/>
        <path d="m278 367 29-17v40l-29 17Z" fill="#b98560"/>
        <path d="m209 352 69 15v40l-69-15Z" fill="#d6a479"/>
      </g>
      <path d="m217 365 17 4v12l-17-4Z" fill="#fff2dc"/>
      <path d="m220 371 10 2" stroke="#b69a7f" strokeWidth="1.4" strokeLinecap="round"/>
      {/* The parcel's twine wraps around the box and loops around the pigeon's ankle. */}
      <g stroke="#795238" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m229 340 69 15v40M244 400v-40l29-17"/>
        <path d="M265 348q21-5 34-26m-4-4q4 2 8 0m-8 3q4 2 8 0"/>
        <path d="M265 348q-12 1-11-4 4-4 11 4 7-7 11-3 0 5-11 3Z" fill="#cfab7c"/>
      </g>
      <path d="M103 361h18m-11 8h17m293-44h20m-9 8h12" stroke="#849da7" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M79 270c12-9 26-13 41-12m230 80c9 3 19 4 29 3" stroke="#9bb0b8" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );
}

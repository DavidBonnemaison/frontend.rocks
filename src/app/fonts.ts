import { Newsreader, IBM_Plex_Mono } from 'next/font/google';
import localFont from 'next/font/local';

export const fontText = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
  display: 'swap',
  variable: '--nf-text',
  preload: true,
});

export const fontMeta = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--nf-meta',
  preload: false,
});

export const fontReadout = localFont({
  src: '../../node_modules/@fontsource/dseg7-classic/files/dseg7-classic-latin-400-normal.woff2',
  display: 'swap',
  variable: '--nf-readout',
  preload: false,
  adjustFontFallback: false,
});

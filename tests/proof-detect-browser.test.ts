import { describe, expect, it } from 'vitest';
import type { BrowserProofItem } from '@/lib/proof/browser-proof-payload';
import { detectBrowser, formatDetectedBrowser } from '@/lib/proof/detect-browser';
import { countRunnableItems } from '@/components/proof/RunProofsButton';

describe('detectBrowser', () => {
  it('classifies all 8 reference user agents into the expected engine', () => {
    const cases: Array<{
      name: string;
      ua: string;
      uaData?: { brands: { brand: string; version: string }[] };
      engine: 'Blink' | 'Gecko' | 'WebKit';
      brand: string | null;
    }> = [
      {
        name: 'Chrome desktop without uaData',
        ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        engine: 'Blink',
        brand: 'Chrome',
      },
      {
        name: 'Chrome desktop with uaData',
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36',
        uaData: {
          brands: [
            { brand: 'Not A(Brand', version: '99' },
            { brand: 'Chromium', version: '143' },
            { brand: 'Google Chrome', version: '143' },
          ],
        },
        engine: 'Blink',
        brand: 'Google Chrome',
      },
      {
        name: 'Edge desktop',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        engine: 'Blink',
        brand: 'Edge',
      },
      {
        name: 'Samsung Internet',
        ua: 'Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
        engine: 'Blink',
        brand: 'Samsung Internet',
      },
      {
        name: 'Firefox desktop',
        ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:146.0) Gecko/20100101 Firefox/146.0',
        engine: 'Gecko',
        brand: 'Firefox',
      },
      {
        name: 'Safari macOS',
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
        engine: 'WebKit',
        brand: 'Safari',
      },
      {
        name: 'Safari iOS',
        ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
        engine: 'WebKit',
        brand: null,
      },
      {
        name: 'Firefox iOS (must be WebKit)',
        ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/133.0 Mobile/15E148 Safari/605.1.15',
        engine: 'WebKit',
        brand: null,
      },
    ];

    for (const c of cases) {
      const detected = detectBrowser(c.ua, c.uaData);
      expect(detected.engine, c.name).toBe(c.engine);
      expect(detected.brand, c.name).toBe(c.brand);
    }
  });

  it('formats detected browser labels cleanly', () => {
    expect(formatDetectedBrowser({ engine: 'Gecko', brand: 'Firefox', version: '146.0' })).toBe(
      'Gecko, Firefox 146.0'
    );
    expect(formatDetectedBrowser({ engine: 'WebKit', brand: null, version: '18.2' })).toBe(
      'WebKit 18.2'
    );
  });
});

describe('countRunnableItems', () => {
  it('excludes items with a non-null notRunnable reason from the runnable count', () => {
    const items: BrowserProofItem[] = [
      {
        claimId: 'p/a',
        slug: 'a',
        type: 'observable',
        experimentId: 'exp-1',
        expectKeys: ['k1'],
        notRunnable: null,
        ciRatio: null,
      },
      {
        claimId: 'p/b',
        slug: 'b',
        type: 'measured',
        experimentId: 'exp-2',
        expectKeys: ['k2'],
        notRunnable: 'measured',
        ciRatio: 3.4,
      },
      {
        claimId: 'p/c',
        slug: 'c',
        type: 'observable',
        experimentId: 'exp-3',
        expectKeys: ['k3'],
        notRunnable: 'input',
        ciRatio: null,
      },
    ];
    expect(countRunnableItems(items)).toBe(1);
  });
});

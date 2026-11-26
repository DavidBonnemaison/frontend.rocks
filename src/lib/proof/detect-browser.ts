export interface DetectedBrowser {
  engine: 'Blink' | 'Gecko' | 'WebKit' | 'Unknown';
  /** Displayed only on the "Your browser" line of in-browser proof verification. */
  brand: string | null;
  version: string | null;
}

export type UaData = { brands: { brand: string; version: string }[] } | undefined;

export function detectBrowser(ua: string, uaData?: UaData): DetectedBrowser {
  if (uaData?.brands?.length) {
    const b =
      uaData.brands.find((x) => !/not.?a.?brand/i.test(x.brand) && x.brand !== 'Chromium') ??
      uaData.brands[0];
    return { engine: 'Blink', brand: b.brand, version: b.version };
  }
  // iOS: every browser uses WebKit regardless of brand.
  if (/\b(iPhone|iPad|iPod)\b/.test(ua)) {
    const v = /Version\/(\d+(?:\.\d+)?)/.exec(ua) ?? /OS (\d+)_/.exec(ua);
    return { engine: 'WebKit', brand: null, version: v ? v[1] : null };
  }
  const blinkDerived = /\b(Edg|OPR|SamsungBrowser)\/(\d+(?:\.\d+)?)/.exec(ua);
  const blink = blinkDerived ?? /\b(Chrome)\/(\d+(?:\.\d+)?)/.exec(ua);
  if (blink) {
    const brandMap: Record<string, string> = {
      Edg: 'Edge',
      OPR: 'Opera',
      SamsungBrowser: 'Samsung Internet',
      Chrome: 'Chrome',
    };
    return { engine: 'Blink', brand: brandMap[blink[1]] ?? null, version: blink[2] };
  }
  const ff = /Firefox\/(\d+(?:\.\d+)?)/.exec(ua);
  if (ff) return { engine: 'Gecko', brand: 'Firefox', version: ff[1] };
  const sf = /Version\/(\d+(?:\.\d+)?).*Safari\//.exec(ua);
  if (sf) return { engine: 'WebKit', brand: 'Safari', version: sf[1] };
  if (/AppleWebKit/.test(ua)) return { engine: 'WebKit', brand: null, version: null };
  return { engine: 'Unknown', brand: null, version: null };
}

export function formatDetectedBrowser(info: DetectedBrowser): string {
  const parts: string[] = [info.engine];
  if (info.brand && info.version) {
    parts.push(`${info.brand} ${info.version}`);
  } else if (info.brand) {
    parts.push(info.brand);
  } else if (info.version) {
    return `${info.engine} ${info.version}`;
  }
  return parts.join(', ');
}

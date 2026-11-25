'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { whenActivated } from '@/lib/activation';
import { flushAnalyticsQueue, trackPageview } from '@/lib/analytics';

const ENDPOINT = process.env.NEXT_PUBLIC_GOATCOUNTER_ENDPOINT;

export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    whenActivated(() => trackPageview(pathname));
  }, [pathname]);

  if (!ENDPOINT) return null;

  return (
    <Script
      id="goatcounter"
      src="https://gc.zgo.at/count.js"
      strategy="afterInteractive"
      data-goatcounter={ENDPOINT}
      data-goatcounter-settings='{"no_onload": true}'
      onLoad={() => whenActivated(flushAnalyticsQueue)}
    />
  );
}

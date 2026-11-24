import React from 'react';
import Script from 'next/script';
import { SiteHeader } from '@/components/layout/SiteHeader';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="container">{children}</main>
      <footer className="site-footer">
        <div className="container site-footer-inner">
          <span className="site-footer-tagline">
            frontend.rocks: Browser-internals knowledge graph.
          </span>
          <nav className="site-footer-links" aria-label="Machine-readable feeds">
            <a href="/vs/">Compare Primitives</a>
            <span aria-hidden="true">·</span>
            <a href="/symptoms/">Symptoms</a>
            <span aria-hidden="true">·</span>
            <a href="/agents/">Agents</a>
            <span aria-hidden="true">·</span>
            <a href="/llms.txt">llms.txt</a>
            <span aria-hidden="true">·</span>
            <a href="/llms-full.txt">llms-full.txt</a>
            <span aria-hidden="true">·</span>
            <a href="/graph.json">graph.json</a>
            <span aria-hidden="true">·</span>
            <a href="/rss.xml">RSS</a>
          </nav>
        </div>
      </footer>
      {/* Cloudflare Web Analytics */}
      <Script
        type="module"
        src="https://static.cloudflareinsights.com/beacon.min.js"
        data-cf-beacon='{"token": "55e76ac3f88645ca9bb4d3fc8d2ac9f1"}'
        strategy="afterInteractive"
      />
    </>
  );
}

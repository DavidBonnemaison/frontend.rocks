import React from 'react';
import type { Metadata } from 'next';
import { ArrowRight, Check } from 'lucide-react';
import {
  Breadcrumb,
  Button,
  Callout,
  Card,
  Chip,
  CodeBlock,
  DataTable,
  DomainLabel,
  Figure,
  Kbd,
  MetaBlock,
  PieceBlock,
  Schematic,
  Toc,
  VisuallyHidden,
} from '@/components/ui';
import { ProofChip } from '@/components/proof/ProofChip';
import { ProofDegradedBanner } from '@/components/proof/ProofDegradedBanner';
import { ProofPanel } from '@/components/proof/ProofPanel';
import { PIECE_COLORS } from '@/lib/design/piece-colors';
import { getSnapshot } from '@/lib/design/schematics-loader';
import type { PageProofSummary } from '@/lib/proof/page-proof.types';
import {
  ClaimMarkerDemo,
  DialogDemo,
  InstrumentDemo,
  NavPrimitivesDemo,
  PopoverDemo,
  SearchFieldDemo,
  SidenoteDemo,
  TabsDemo,
  ThemeToggleDemo,
} from './GalleryDemos';
import './dev-components.css';

export const metadata: Metadata = {
  title: 'Component Gallery (Dev) · frontend.rocks',
  description: 'Internal design system gallery for visual regression and interaction testing.',
  robots: { index: false, follow: false },
};

const DEMO_SUMMARY: PageProofSummary = {
  pageId: 'css-container-queries',
  effectiveStatus: 'degraded',
  degradedSince: '2026-11-24T02:17:00Z',
  unverifiedOn: '2026-12-01T02:17:00Z',
  total: 2,
  byStatus: { pending: 0, proven: 1, diverges: 1, failed: 0, stale: 0 },
  byType: { observable: 1, measured: 0, normative: 1, implementation: 0, support: 0, derived: 0 },
  engines: { chromium: '143.0', firefox: '145.0', webkit: '26.0' },
  lastCheckedAt: '2026-11-25T02:17:00Z',
  rows: [
    {
      claimId: 'css-container-queries/applies-at-container-width',
      slug: 'applies-at-container-width',
      type: 'observable',
      statement: 'Demo data: @container matches slot width independent of viewport.',
      status: 'proven',
      engines: { chromium: 'pass', firefox: 'pass', webkit: 'pass' },
      proofKind: 'experiment',
      proofHref: '/claims/css-container-queries/applies-at-container-width/',
      externalHref: null,
      checkedAt: '2026-11-25T02:17:00Z',
    },
    {
      claimId: 'css-container-queries/inline-size-containment',
      slug: 'inline-size-containment',
      type: 'normative',
      statement: 'Demo data: inline-size containment isolates inline dimensions.',
      status: 'diverges',
      engines: {},
      proofKind: 'spec-quote',
      proofHref: '/claims/css-container-queries/inline-size-containment/',
      externalHref: 'https://drafts.csswg.org/css-contain-3/',
      checkedAt: '2026-11-25T02:17:00Z',
    },
  ],
  hasExperiments: true,
  experimentIds: ['container-query-inline-size'],
};

function ThemePair({
  id,
  title,
  render,
}: {
  id: string;
  title: string;
  render: (theme: 'light' | 'dark') => React.ReactNode;
}) {
  return (
    <section id={id} className="dev-gallery-section">
      <h2>{title}</h2>
      <div className="dev-gallery-pair">
        <div className="dev-gallery-col" data-theme="light">
          <span className="dev-gallery-col-tag caps">LIGHT · Demo data</span>
          {render('light')}
        </div>
        <div className="dev-gallery-col" data-theme="dark">
          <span className="dev-gallery-col-tag caps">DARK · Demo data</span>
          {render('dark')}
        </div>
      </div>
    </section>
  );
}

export default async function DevComponentsPage() {
  const cq480 = getSnapshot('cq-480');
  const cq300 = getSnapshot('cq-300');

  const codeSample = `.slot {\n  container-type: inline-size;\n}\n@container (min-width: 420px) {\n  .card { grid-template-columns: 160px 1fr; }\n}`;
  const codeBlockNode = await CodeBlock({ code: codeSample, lang: 'css' });

  return (
    <div className="dev-gallery">
      <header className="dev-gallery-header">
        <span className="caps">DESIGN SYSTEM · REVUE · DEMO DATA</span>
        <h1>Component Gallery</h1>
        <p className="meta">
          Every UI primitive rendered side by side in light and dark themes. All entries use Demo
          data.
        </p>
      </header>

      <ThemePair
        id="button"
        title="Button"
        render={() => (
          <div className="stack">
            <div className="cluster">
              <Button variant="primary" iconEnd={<ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />}>
                Primary
              </Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link" href="#button">
                Link variant
              </Button>
            </div>
            <div className="cluster">
              <Button variant="primary" size="sm">
                Small Primary
              </Button>
              <Button variant="secondary" size="sm" disabled>
                Disabled
              </Button>
            </div>
          </div>
        )}
      />

      <ThemePair
        id="chip"
        title="Chip & DomainLabel & Kbd"
        render={() => (
          <div className="stack">
            <div className="cluster">
              <Chip tone="neutral">Neutral</Chip>
              <Chip tone="ok" icon={<Check size={12} strokeWidth={1.5} aria-hidden="true" />}>
                Proven
              </Chip>
              <Chip tone="warn">Diverges</Chip>
              <Chip tone="fail">Failed</Chip>
              <Chip tone="inverse" href="#chip">
                For agents
              </Chip>
            </div>
            <div className="cluster">
              <DomainLabel domain="css-layout" />
              <DomainLabel domain="rendering-pipeline" href="#chip" />
              <Kbd>⌘K</Kbd>
              <VisuallyHidden>Demo data screen reader text</VisuallyHidden>
            </div>
          </div>
        )}
      />

      <ThemePair
        id="meta-block"
        title="MetaBlock & Breadcrumb"
        render={() => (
          <div className="stack">
            <Breadcrumb
              items={[
                { label: 'Home', href: '/' },
                { label: 'Concepts', href: '/concepts/' },
                { label: 'CSS Container Queries' },
              ]}
            />
            <MetaBlock
              rows={[
                { key: 'Domain', value: <DomainLabel domain="css-layout" /> },
                { key: 'Reading time', value: '8 min' },
                { key: 'Claims', value: '12 proven' },
              ]}
            />
            <MetaBlock
              compact
              rows={[
                { key: 'Domain', value: 'CSS & LAYOUT' },
                { key: 'Time', value: '8 MIN' },
                { key: 'Status', value: 'PROVEN' },
              ]}
            />
          </div>
        )}
      />

      <ThemePair
        id="card"
        title="Card & Callout"
        render={() => (
          <div className="stack">
            <Card
              href="#card"
              eyebrow={<DomainLabel domain="css-layout" />}
              title="CSS Container Queries"
              description="Demo data: style elements based on their parent container inline size rather than the global viewport."
              meta={<Chip tone="ok">Proven</Chip>}
              media={cq300 ? <Schematic snapshot={cq300} width={320} label="Demo data container schematic" /> : null}
            />
            <Callout kind="advice">Demo data: prefer inline-size containment over full size containment.</Callout>
            <Callout kind="warning">Demo data: avoid container queries on elements whose size depends on their children.</Callout>
            <Callout kind="note">Demo data: measured in Chromium, Firefox, and WebKit.</Callout>
            <Callout kind="composite">Demo data: composite incident reconstructed from production patterns.</Callout>
          </div>
        )}
      />

      <ThemePair
        id="sidenote"
        title="Sidenote"
        render={(theme) => <SidenoteDemo prefix={theme} />}
      />

      <ThemePair
        id="code-block"
        title="CodeBlock & DataTable"
        render={() => (
          <div className="stack">
            {codeBlockNode}
            <DataTable
              caption="Demo data: engine verification summary"
              columns={[
                { key: 'engine', label: 'Engine' },
                { key: 'version', label: 'Version', mono: true },
                { key: 'columns', label: 'Columns', align: 'end', mono: true },
              ]}
              rows={[
                { engine: 'Chromium', version: '143.0', columns: '2' },
                { engine: 'Firefox', version: '145.0', columns: '2' },
                { engine: 'WebKit', version: '26.0', columns: '2' },
              ]}
            />
          </div>
        )}
      />

      <ThemePair
        id="tabs"
        title="Tabs & Toc"
        render={(theme) => (
          <div className="stack">
            <TabsDemo prefix={theme} />
            <Toc
              items={[
                { id: 'button', label: 'Button', level: 2 },
                { id: 'chip', label: 'Chip', level: 2 },
                { id: 'sidenote', label: 'Sidenote', level: 3 },
              ]}
            />
          </div>
        )}
      />

      <ThemePair
        id="theme-toggle"
        title="ThemeToggle"
        render={() => <ThemeToggleDemo />}
      />

      <ThemePair
        id="overlays"
        title="Popover, Dialog, NavMenu, MobileNav, SearchField"
        render={(theme) => (
          <div className="stack">
            <div className="cluster">
              <PopoverDemo prefix={theme} />
              <DialogDemo prefix={theme} />
              <NavPrimitivesDemo />
            </div>
            <SearchFieldDemo prefix={theme} />
          </div>
        )}
      />

      <ThemePair
        id="proof-visuals"
        title="ClaimMarker, ProofChip, ProofDegradedBanner, ProofPanel"
        render={(theme) => (
          <div className="stack">
            <ClaimMarkerDemo prefix={theme} />
            <div className="cluster">
              <ProofChip summary={DEMO_SUMMARY} />
            </div>
            <ProofDegradedBanner summary={DEMO_SUMMARY} />
            <ProofPanel summary={DEMO_SUMMARY} />
          </div>
        )}
      />

      <ThemePair
        id="instrument-panel"
        title="InstrumentPanel & Controls"
        render={(theme) => <InstrumentDemo prefix={theme} />}
      />

      <ThemePair
        id="schematic"
        title="Figure & Schematic"
        render={() =>
          cq480 ? (
            <Figure
              number={1}
              question="Demo data: How does @container reflow the card at 480 px?"
              caption="Demo data · container-query-inline-size"
            >
              <Schematic snapshot={cq480} width={640} figureNumber={1} label="Demo data schematic cq-480" />
            </Figure>
          ) : (
            <p className="meta">Demo data: run npm run design:snapshots to render cq-480.</p>
          )
        }
      />

      <ThemePair
        id="piece-block"
        title="PieceBlock (Hero + 12 Piece Colors)"
        render={() => (
          <div className="stack">
            <PieceBlock
              color="vermilion"
              number="#01"
              kicker="CASE"
              title="Double Payment Race Condition"
              dek="Demo data: two clicks trigger two non-idempotent charges before the button disables."
              schematic={cq480}
              size="hero"
              titleAs="h3"
            />
            <div className="tiles">
              {PIECE_COLORS.map((color, idx) => (
                <PieceBlock
                  key={color}
                  color={color}
                  number={`#${String(idx + 1).padStart(2, '0')}`}
                  kicker={color.toUpperCase()}
                  title={`Demo data: ${color} piece`}
                  dek="Demo data tile preview."
                  schematic={idx === 0 ? cq300 : null}
                  size="tile"
                  href="#piece-block"
                />
              ))}
            </div>
          </div>
        )}
      />
    </div>
  );
}

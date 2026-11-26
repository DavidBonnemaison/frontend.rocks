'use client';

import React, { useState } from 'react';
import {
  Button,
  ClaimMarker,
  ClaimPopover,
  Dialog,
  InstrumentPanel,
  MobileNav,
  ModeSelector,
  NavMenu,
  Popover,
  RangeControl,
  Readout,
  SearchField,
  SelectControl,
  Sidenote,
  SlideSwitch,
  StatusLed,
  Tabs,
  ThemeToggle,
} from '@/components/ui';
import type { ClaimProofRow } from '@/lib/proof/page-proof.types';

const DEMO_CLAIM_ROWS: ClaimProofRow[] = [
  {
    claimId: 'css-container-queries/applies-at-container-width',
    slug: 'applies-at-container-width',
    type: 'observable',
    statement: 'Demo data: @container evaluates against the nearest size container, not the viewport.',
    status: 'proven',
    engines: { chromium: 'pass', firefox: 'pass', webkit: 'pass' },
    proofKind: 'experiment',
    proofHref: '/claims/css-container-queries/applies-at-container-width/',
    externalHref: null,
    checkedAt: '2026-11-25T02:00:00Z',
  },
  {
    claimId: 'css-container-queries/inline-size-containment',
    slug: 'inline-size-containment',
    type: 'normative',
    statement: 'Demo data: container-type: inline-size establishes inline-axis size containment.',
    status: 'diverges',
    engines: { chromium: 'pass', firefox: 'pass', webkit: 'fail' },
    proofKind: 'experiment',
    proofHref: '/claims/css-container-queries/inline-size-containment/',
    externalHref: null,
    checkedAt: '2026-11-25T02:00:00Z',
  },
];

const DEMO_NAV_ITEMS = [
  {
    href: '/concepts/css-container-queries/',
    title: 'CSS Container Queries',
    description: 'Demo data: layout containment and @container rules',
  },
  {
    href: '/autopsies/double-payment-race-condition/',
    title: 'Double Payment Race Condition',
    description: 'Demo data: cross-layer post-mortem',
  },
];

export function TabsDemo({ prefix }: { prefix: string }) {
  return (
    <Tabs
      label={`Demo tabs ${prefix}`}
      tabs={[
        { id: 'overview', label: 'Overview', content: <p>Demo data: overview panel content.</p> },
        { id: 'proof', label: 'Proof', content: <p>Demo data: proof panel content.</p> },
        { id: 'source', label: 'Source', content: <p>Demo data: source panel content.</p> },
      ]}
    />
  );
}

export function SidenoteDemo({ prefix }: { prefix: string }) {
  return (
    <p>
      Demo data: CSS containment isolates layout work within a subtree.
      <Sidenote id={`${prefix}-contain`}>
        Demo data: CSS Containment Module Level 3, §2.1 Size Containment.
      </Sidenote>
    </p>
  );
}

export function DialogDemo({ prefix }: { prefix: string }) {
  const [open, setOpen] = useState(false);
  const titleId = `dialog-title-${prefix}`;
  return (
    <div>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open Dialog
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <h3 id={titleId}>Demo data: Modal Dialog</h3>
        <p>Press Escape or click Close to restore focus to the trigger button.</p>
      </Dialog>
    </div>
  );
}

export function PopoverDemo({ prefix }: { prefix: string }) {
  return (
    <Popover
      id={`demo-pop-${prefix}`}
      anchorName={`--demo-pop-${prefix}`}
      trigger="Open Popover"
      placement="bottom"
    >
      <p className="meta">Demo data: popover body anchored to trigger.</p>
    </Popover>
  );
}

export function NavPrimitivesDemo() {
  return (
    <div className="cluster">
      <NavMenu label="Learn" items={DEMO_NAV_ITEMS} hubHref="/concepts/" active />
      <MobileNav
        sections={[{ label: 'Learn', hubHref: '/concepts/', items: DEMO_NAV_ITEMS }]}
        footer={<span className="meta">Demo data</span>}
      />
    </div>
  );
}

export function SearchFieldDemo({ prefix }: { prefix: string }) {
  const [lastQuery, setLastQuery] = useState('');
  return (
    <div className="stack">
      <SearchField
        id={`search-md-${prefix}`}
        label="Search documentation"
        placeholder="Search concepts, APIs..."
        onSubmit={setLastQuery}
      />
      <SearchField
        id={`search-lg-${prefix}`}
        label="What's broken?"
        placeholder="Paste a symptom or error..."
        size="lg"
        prompt
        onSubmit={setLastQuery}
      />
      {lastQuery ? <span className="meta">Demo data query: {lastQuery}</span> : null}
    </div>
  );
}

export function ClaimMarkerDemo({ prefix }: { prefix: string }) {
  const popId = `claim-pop-${prefix}`;
  const anchor = `--claim-anchor-${prefix}`;
  return (
    <div>
      <p>
        Demo data: container queries match the inline size of the nearest containment ancestor.
        <ClaimMarker popoverId={popId} anchorName={anchor} count={DEMO_CLAIM_ROWS.length} worst="proven" />
      </p>
      <ClaimPopover id={popId} anchorName={anchor} rows={DEMO_CLAIM_ROWS} />
      <div className="cluster">
        <ClaimMarker popoverId={`${popId}-warn`} anchorName={`${anchor}-w`} count={1} worst="diverges" />
        <ClaimMarker popoverId={`${popId}-fail`} anchorName={`${anchor}-f`} count={1} worst="failed" />
      </div>
    </div>
  );
}

export function InstrumentDemo({ prefix }: { prefix: string }) {
  const [width, setWidth] = useState(480);
  const [mode, setMode] = useState<'treatment' | 'control'>('treatment');
  const [containEnabled, setContainEnabled] = useState(true);
  const [preset, setPreset] = useState('inline-size');

  const columns = mode === 'treatment' && containEnabled && width >= 420 ? 2 : 1;

  return (
    <InstrumentPanel
      experimentId="container-query-inline-size"
      status="proven"
      question="Demo data: Does the card switch to two columns when its slot is wide, while the viewport never changes?"
      figureNumber={1}
      caption="Demo data · Live fixture container-query-inline-size"
      stage={
        <div
          className="dev-gallery-cq-slot"
          style={{
            width: `${Math.min(width, 480)}px`,
            containerType: mode === 'treatment' && containEnabled ? 'inline-size' : 'normal',
          }}
        >
          <article className="dev-gallery-cq-card">
            <div className="dev-gallery-cq-media caps">IMG</div>
            <p className="meta">Body copy ({columns} col)</p>
          </article>
        </div>
      }
      controls={
        <>
          <RangeControl
            id={`cq-width-${prefix}`}
            label="Slot width"
            min={220}
            max={640}
            step={20}
            value={width}
            unit="px"
            onChange={setWidth}
          />
          <ModeSelector<'treatment' | 'control'>
            id={`cq-mode-${prefix}`}
            label="Variant"
            options={[
              { value: 'treatment', label: 'Treatment' },
              { value: 'control', label: 'Control' },
            ]}
            value={mode}
            onChange={setMode}
          />
          <SlideSwitch
            id={`cq-contain-${prefix}`}
            label="Container containment"
            offLabel="OFF"
            onLabel="ON"
            checked={containEnabled}
            onChange={setContainEnabled}
          />
          <SelectControl
            id={`cq-preset-${prefix}`}
            label="Container type"
            options={['inline-size', 'size', 'normal']}
            value={preset}
            onChange={setPreset}
          />
        </>
      }
      readouts={
        <div className="cluster">
          <Readout label="Columns" value={columns} tone="ok" digits={2} />
          <Readout label="Mode" value={preset} />
          <Readout label="Expected" value={2} tone={columns === 2 ? 'ok' : 'fail'} />
          <StatusLed status="diverges" label="DIVERGES" />
        </div>
      }
      footer={
        <>
          <Button variant="primary" size="sm">
            Don&apos;t take our word for it
          </Button>
          <span className="caps">Demo data · CHROMIUM ✓ FIREFOX ✓ WEBKIT ✓</span>
        </>
      }
    />
  );
}

export function ThemeToggleDemo() {
  return (
    <div className="cluster">
      <ThemeToggle />
      <ThemeToggle compact />
    </div>
  );
}

import React from 'react';
import {
  buildDemoHistoryRows,
  ClaimProofView,
} from '@/components/article/ClaimProofView';
import { Support } from '@/components/proof/Support';
import type { Claim } from '@/lib/proof/claim-schema';

const DEMO_CLAIMS: Claim[] = [
  {
    id: 'css-container-queries/demo-experiment',
    type: 'observable',
    statement: 'Demo data: @container matches the slot width independent of the viewport.',
    proof: {
      kind: 'experiment',
      experimentId: 'container-query-inline-size',
      expectKeys: ['applies-at-480'],
    },
  },
  {
    id: 'css-container-queries/demo-spec-quote',
    type: 'normative',
    statement: 'Demo data: inline-size containment isolates inline dimensions from descendants.',
    proof: {
      kind: 'spec-quote',
      url: 'https://drafts.csswg.org/css-conditional-5/',
      anchor: 'container-queries',
      quote: 'Demo data: Container queries allow authors to style elements according to the size of a container.',
    },
  },
  {
    id: 'css-container-queries/demo-source-quote',
    type: 'implementation',
    statement: 'Demo data: Blink checks container query evaluators during style recalc.',
    proof: {
      kind: 'source-quote',
      repo: 'chromium/chromium',
      commit: '0'.repeat(40),
      path: 'third_party/blink/renderer/core/css/container_query_evaluator.cc',
      lines: [42, 48],
      quote: '// Demo data excerpt\nbool ContainerQueryEvaluator::EvalAndAdd(const ContainerQuery& query) {\n  return Eval(query);\n}',
    },
  },
  {
    id: 'css-container-queries/demo-bcd',
    type: 'support',
    statement: 'Demo data: CSS container queries have Baseline Widely Available support.',
    proof: {
      kind: 'bcd',
      bcdKey: 'css.at-rules.container',
      webFeatureId: 'container-queries',
    },
  },
  {
    id: 'css-container-queries/demo-derived',
    type: 'derived',
    statement: 'Demo data: A component can switch layout based on its parent slot without ResizeObserver.',
    proof: {
      kind: 'derived',
      from: [
        'css-container-queries/demo-experiment',
        'css-container-queries/demo-spec-quote',
      ],
      reasoning:
        'Demo data: Because inline-size containment isolates the slot and @container queries evaluate against it, CSS handles responsive card layout natively.',
    },
  },
];

export async function ClaimPermalinksDemo({ prefix }: { prefix: string }) {
  const historyRows = buildDemoHistoryRows();
  const usedOn = [
    {
      pageId: 'css-container-queries',
      title: 'Demo data: CSS Container Queries',
      href: '/concepts/css-container-queries/',
    },
  ];

  const views = await Promise.all(
    DEMO_CLAIMS.map((claim, idx) =>
      ClaimProofView({
        parentTitle: 'Demo data: CSS Container Queries',
        parentHref: '/concepts/css-container-queries/',
        slug: `${prefix}-${claim.proof.kind}-${idx}`,
        claim,
        status: idx === 1 ? 'diverges' : 'proven',
        checkedAt: '2026-11-25T02:17:00Z',
        externalHref:
          claim.proof.kind === 'spec-quote'
            ? 'https://drafts.csswg.org/css-conditional-5/#container-queries:~:text=Container%20queries'
            : claim.proof.kind === 'source-quote'
              ? 'https://github.com/chromium/chromium'
              : null,
        specLabel:
          claim.proof.kind === 'spec-quote'
            ? 'CSS Conditional Rules Level 5 § Container Queries'
            : null,
        experimentSlot:
          claim.proof.kind === 'experiment' ? (
            <p className="meta">Demo data: ExperimentLab embeds here in production.</p>
          ) : undefined,
        experimentRows:
          claim.proof.kind === 'experiment'
            ? [
                {
                  engine: 'chromium',
                  version: '159.0',
                  status: 'pass',
                  treatment: '{"columns":2}',
                  control: '{"columns":1}',
                },
                {
                  engine: 'firefox',
                  version: '159.0',
                  status: 'pass',
                  treatment: '{"columns":2}',
                  control: '{"columns":1}',
                },
                {
                  engine: 'webkit',
                  version: '27.2',
                  status: 'pass',
                  treatment: '{"columns":2}',
                  control: '{"columns":1}',
                },
              ]
            : [],
        bcdSlot:
          claim.proof.kind === 'bcd' ? (
            <Support feature={claim.proof.bcdKey} variant="table" />
          ) : undefined,
        derivedParents:
          claim.proof.kind === 'derived'
            ? [
                {
                  claimId: 'css-container-queries/demo-experiment',
                  href: '#claim-permalinks',
                  status: 'proven',
                },
                {
                  claimId: 'css-container-queries/demo-spec-quote',
                  href: '#claim-permalinks',
                  status: 'proven',
                },
              ]
            : [],
        usedOn,
        historyRows: idx === 0 ? historyRows : [],
      })
    )
  );

  return (
    <div className="stack">
      {views.map((node, i) => (
        <div key={DEMO_CLAIMS[i].id} data-demo-proof-kind={DEMO_CLAIMS[i].proof.kind}>
          {node}
        </div>
      ))}
    </div>
  );
}

'use client';

import React from 'react';
import type { ClaimStatus } from '@/lib/proof/claim-schema';
import type { ClaimProofRow, EngineCellStatus } from '@/lib/proof/page-proof.types';
import { ENGINE_ORDER, ENGINE_LABELS } from '@/lib/proof/engine-labels';
import { UI_STRINGS } from '@/lib/ui-strings';
import './ClaimMarker.css';

export interface ClaimMarkerProps {
  popoverId: string;
  anchorName: string;
  count: number;
  worst: ClaimStatus;
}

export interface ClaimPopoverProps {
  id: string;
  anchorName: string;
  rows: ClaimProofRow[];
}

const ENGINE_SYMBOL: Record<EngineCellStatus, string> = {
  pass: '✓',
  fail: '✗',
  error: '!',
  missing: '—',
  'not-run': '·',
};

export function ClaimMarker({ popoverId, anchorName, count, worst }: ClaimMarkerProps) {
  const style = { anchorName } as React.CSSProperties & Record<string, string>;

  return (
    <button
      type="button"
      className="claim-marker"
      popoverTarget={popoverId}
      style={style}
      aria-label={`Proof for this paragraph: ${count} ${count === 1 ? 'claim' : 'claims'}`}
      data-status={worst}
    >
      <span className="claim-marker-dot" aria-hidden="true" />
    </button>
  );
}

export function ClaimPopover({ id, anchorName, rows }: ClaimPopoverProps) {
  const style = { positionAnchor: anchorName } as React.CSSProperties & Record<string, string>;
  const s = UI_STRINGS.PROOF;

  return (
    <div popover="auto" id={id} className="claim-popover" style={style}>
      <ul className="claim-popover-list">
        {rows.map((row) => (
          <li key={row.claimId} className="claim-popover-item">
            <p className="claim-popover-statement">{row.statement}</p>
            <div className="claim-popover-meta meta">
              <span className="caps">{s.type[row.type]}</span>
              <span className="claim-popover-status caps" data-status={row.status}>
                {s.status[row.status]}
              </span>
              {row.proofKind === 'experiment' ? (
                <span className="claim-popover-engines caps">
                  {ENGINE_ORDER.map((eng) => {
                    const res: EngineCellStatus = row.engines[eng] ?? 'not-run';
                    return (
                      <span key={eng} className="claim-popover-engine" data-result={res}>
                        {ENGINE_LABELS[eng].toUpperCase()} {ENGINE_SYMBOL[res]}
                      </span>
                    );
                  })}
                </span>
              ) : null}
              <a href={row.proofHref} className="caps">
                Proof →
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

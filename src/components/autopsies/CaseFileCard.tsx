import React from 'react';
import { ShieldCheck } from 'lucide-react';
import type { AutopsyCaseFile } from '@/lib/schemas';

function renderInlineCode(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return <code key={idx}>{part.slice(1, -1)}</code>;
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export function CaseFileCard({ caseFile }: { caseFile: AutopsyCaseFile }) {
  return (
    <section
      id="architectural-fix"
      className="autopsy-fix-card autopsy-case-file"
      aria-labelledby="sec-fix"
      data-testid="architectural-fix-section"
    >
      <div data-testid="case-file-card">
        <h2
          id="sec-fix"
          className="autopsy-section-heading autopsy-section-heading--flush"
        >
          <ShieldCheck size={20} color="var(--accent)" aria-hidden="true" />
          <span>Case file</span>
        </h2>

        <dl className="autopsy-case-file-grid">
          <div className="autopsy-case-file-row">
            <dt>Trigger</dt>
            <dd>{renderInlineCode(caseFile.trigger)}</dd>
          </div>
          <div className="autopsy-case-file-row">
            <dt>Symptom</dt>
            <dd>{renderInlineCode(caseFile.symptom)}</dd>
          </div>
          <div className="autopsy-case-file-row">
            <dt>Root cause</dt>
            <dd>{renderInlineCode(caseFile.root_cause)}</dd>
          </div>
          {caseFile.bad_fixes.map((badFix, idx) => (
            <div key={`${badFix.label}-${idx}`} className="autopsy-case-file-row">
              <dt>Bad fix #{idx + 1}</dt>
              <dd>
                <strong>{renderInlineCode(badFix.label)}</strong> — {renderInlineCode(badFix.outcome)}
              </dd>
            </div>
          ))}
          <div className="autopsy-case-file-row">
            <dt>Fix</dt>
            <dd>{renderInlineCode(caseFile.fix)}</dd>
          </div>
          <div className="autopsy-case-file-row">
            <dt>How to spot it</dt>
            <dd>{renderInlineCode(caseFile.how_to_spot)}</dd>
          </div>
          {caseFile.deleted && (
            <div className="autopsy-case-file-row">
              <dt>Deleted / Replaced</dt>
              <dd>{renderInlineCode(caseFile.deleted)}</dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}

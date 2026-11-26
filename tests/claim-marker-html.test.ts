import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HtmlValidate } from 'html-validate';
import { describe, expect, it } from 'vitest';
import { ClaimMarker, ClaimPopover } from '@/components/ui/ClaimMarker/ClaimMarker';
import type { ClaimProofRow } from '@/lib/proof/page-proof.types';

const DEMO_ROWS: ClaimProofRow[] = [
  {
    claimId: 'css-container-queries/applies-at-container-width',
    slug: 'applies-at-container-width',
    type: 'observable',
    statement:
      'Container queries evaluate against the nearest containment ancestor, not the viewport.',
    status: 'proven',
    engines: { chromium: 'pass', firefox: 'pass', webkit: 'pass' },
    proofKind: 'experiment',
    proofHref: '/claims/css-container-queries/applies-at-container-width/',
    externalHref: null,
    checkedAt: '2026-11-25T02:00:00Z',
  },
];

describe('ClaimMarker + ClaimPopover HTML validity', () => {
  it('passes html-validate element-permitted-content when ClaimMarker is in <p> and ClaimPopover is sibling', async () => {
    const html = renderToStaticMarkup(
      React.createElement(
        'div',
        null,
        React.createElement(
          'p',
          null,
          'Demo data: container queries respond to the inline size of their containment context.',
          React.createElement(ClaimMarker, {
            popoverId: 'claim-pop-demo',
            anchorName: '--claim-demo',
            count: 1,
            worst: 'proven',
          })
        ),
        React.createElement(ClaimPopover, {
          id: 'claim-pop-demo',
          anchorName: '--claim-demo',
          rows: DEMO_ROWS,
        })
      )
    );

    const validator = new HtmlValidate({
      rules: {
        'element-permitted-content': 'error',
      },
    });
    const report = await validator.validateString(html);
    expect(report.valid, JSON.stringify(report.results, null, 2)).toBe(true);
  });

  it('fails element-permitted-content if ClaimPopover is nested inside <p>', async () => {
    const badHtml = renderToStaticMarkup(
      React.createElement(
        'p',
        null,
        'Invalid nesting',
        React.createElement(ClaimPopover, {
          id: 'claim-pop-bad',
          anchorName: '--claim-bad',
          rows: DEMO_ROWS,
        })
      )
    );

    const validator = new HtmlValidate({
      rules: {
        'element-permitted-content': 'error',
        'close-order': 'error',
      },
    });
    const report = await validator.validateString(badHtml);
    expect(report.valid).toBe(false);
  });
});

import React from 'react';
import type { RecertSummary } from '@/lib/recertification/summary-schema';
import { UI_STRINGS } from '@/lib/ui-strings';

const monthYearFmt = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDropRatePercent(dropRate: number): string {
  const pct = dropRate * 100;
  return `${Number(pct.toFixed(1))}%`;
}

export function RecertificationStats({ summary }: { summary: RecertSummary | null }) {
  if (!summary) return null;

  const monthYear = monthYearFmt.format(new Date(summary.generatedAt));
  const survived = summary.claims.proven + summary.claims.narrowed;
  const dropPercent = formatDropRatePercent(summary.dropRate);

  return (
    <section
      aria-labelledby="recertification-heading"
      className="proof-panel"
      data-testid="recertification-stats"
    >
      <h2 id="recertification-heading">{UI_STRINGS.RECERTIFICATION.heading}</h2>
      <p>{UI_STRINGS.RECERTIFICATION.rerunLine(monthYear)}</p>
      <p>{UI_STRINGS.RECERTIFICATION.survivedLine(survived, summary.claims.narrowed)}</p>
      <p>{UI_STRINGS.RECERTIFICATION.deletedLine(summary.claims.dropped, dropPercent)}</p>
      <p style={{ marginBottom: 0 }}>
        {UI_STRINGS.RECERTIFICATION.pagesLine(summary.pagesMerged, summary.pagesDeleted)}
      </p>
    </section>
  );
}

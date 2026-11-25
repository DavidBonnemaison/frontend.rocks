import React from 'react';
import { getSupportEventDate, type SupportEvent } from '@/lib/proof/support/dates';
import './support.css';

export type SupportDateFormat = 'year' | 'date';

export interface SupportDateViewModel {
  isoDate: string;
  display: string;
}

const US_SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function buildSupportDateViewModel(input: {
  feature?: string;
  webFeature?: string;
  event: SupportEvent;
  format?: SupportDateFormat;
  pageId?: string;
}): SupportDateViewModel {
  const hasFeature = Boolean(input.feature && input.feature.trim().length > 0);
  const hasWebFeature = Boolean(input.webFeature && input.webFeature.trim().length > 0);
  const where = input.pageId ? ` on page "${input.pageId}"` : '';

  if (hasFeature === hasWebFeature) {
    throw new Error(
      `<SupportDate event="${input.event}">${where}: provide exactly one of "feature" or "webFeature".`
    );
  }

  const keyLabel = hasFeature ? `feature="${input.feature}"` : `webFeature="${input.webFeature}"`;
  const isoDate = getSupportEventDate(
    {
      bcdKey: hasFeature ? input.feature!.trim() : undefined,
      webFeatureId: hasWebFeature ? input.webFeature!.trim() : undefined,
    },
    input.event
  );

  if (!isoDate) {
    throw new Error(
      `<SupportDate ${keyLabel} event="${input.event}">${where}: no exact date available for this event.`
    );
  }

  const format = input.format ?? 'year';
  const display =
    format === 'date'
      ? US_SHORT_DATE_FORMATTER.format(new Date(`${isoDate}T00:00:00Z`))
      : isoDate.slice(0, 4);

  return { isoDate, display };
}

export interface SupportDateProps {
  feature?: string;
  webFeature?: string;
  event: SupportEvent;
  format?: SupportDateFormat;
  pageId?: string;
}

export function SupportDate({
  feature,
  webFeature,
  event,
  format = 'year',
  pageId,
}: SupportDateProps) {
  const vm = buildSupportDateViewModel({ feature, webFeature, event, format, pageId });
  return (
    <time className="support-date" dateTime={vm.isoDate}>
      {vm.display}
    </time>
  );
}

import type { ClaimType } from './claim-schema';

export interface ClaimTypeDescription {
  label: string;
  description: string;
  verification: string;
}

export const CLAIM_TYPE_DESCRIPTIONS: Record<ClaimType, ClaimTypeDescription> = {
  observable: {
    label: 'Experiment',
    description:
      'A DOM, CSS, layout, event, or web API behavior that can be observed directly inside a browser engine.',
    verification:
      'Executed by Playwright in Chromium, Firefox, and WebKit against both treatment and control variants, with anti-vacuity mutation checks.',
  },
  measured: {
    label: 'Measurement',
    description:
      'A relative cost comparison stating that one mechanism takes measurably longer than another.',
    verification:
      'Repeated in CI across engines and checked with median ratios and a Mann-Whitney significance test.',
  },
  normative: {
    label: 'Spec quote',
    description:
      'A requirement or definition stated by a W3C, WHATWG, TC39, or IETF specification.',
    verification:
      'Matched word for word against the anchored section of the primary specification and linked via text fragment.',
  },
  implementation: {
    label: 'Engine source',
    description:
      'An internal behavior specific to an engine, runtime, or library implementation.',
    verification:
      'Checked verbatim against a pinned commit and line range in the public upstream repository.',
  },
  support: {
    label: 'Compat data',
    description:
      'Browser version availability or Baseline status for a web platform feature.',
    verification:
      'Computed directly from MDN browser-compat-data and web-features packages.',
  },
  derived: {
    label: 'Derived',
    description:
      'A conclusion that follows logically from one or more already-proven claims.',
    verification:
      'Automatically inherits the worst status of its source claims; if any source regresses, the derived claim degrades with it.',
  },
};

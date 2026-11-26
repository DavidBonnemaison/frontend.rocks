import type { Json } from './define-experiment';
import { jsonEqual } from './runtime/canonical-json';

/** Strict deep JSON equality: object key order ignored, array order significant, 0 === -0. */
export const jsonEquals: (a: Json, b: Json) => boolean = jsonEqual;

export interface LocalExpectResult {
  expectKey: string;
  pass: boolean;
  observed: { treatment: Json; control: Json } | null;
  error: string | null;
}

export interface LocalClaimResult {
  claimId: string;
  pass: boolean;
  results: LocalExpectResult[];
}

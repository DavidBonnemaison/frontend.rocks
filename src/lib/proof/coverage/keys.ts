import crypto from 'node:crypto';

function sha1(input: string): string {
  return crypto.createHash('sha1').update(input).digest('hex');
}

export interface OverreachKeyClaim {
  id: string;
  statement: string;
  engines: string[] | null;
  proofKind: string;
  bcdKey?: string | null;
}

/** Deterministic cache key for an unlinked sentence. */
export function classifierKey(epoch: string, sentenceText: string): string {
  return sha1(['classifier', epoch, sentenceText].join('\u0000'));
}

/**
 * Deterministic cache key for a linked claim unit.
 * Claims enter the key so updating a claim statement invalidates the label.
 * Exception: `bcd` claims have generated statements updated by the support check;
 * their `bcdKey` and `engines` enter the key instead of `statement`.
 */
export function overreachKey(
  epoch: string,
  unitText: string,
  claims: OverreachKeyClaim[]
): string {
  const parts = [...claims]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) =>
      c.proofKind === 'bcd'
        ? `${c.id}\u0001bcd:${c.bcdKey ?? ''}\u0001${(c.engines ?? []).join(',')}`
        : `${c.id}\u0001${c.statement}\u0001${(c.engines ?? []).join(',')}`
    );
  return sha1(['overreach', epoch, unitText, ...parts].join('\u0000'));
}

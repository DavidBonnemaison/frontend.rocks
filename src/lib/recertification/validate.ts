import { RecertSummarySchema, type RecertSummary } from './summary-schema';

export function validateRecertSummary(
  raw: unknown,
  provenConceptCount: number,
): { ok: true; summary: RecertSummary } | { ok: false; errors: string[] } {
  const parsed = RecertSummarySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `[recertification/summary.json] ${i.path.join('.') || 'root'}: ${i.message}`,
      ),
    };
  }

  const summary = parsed.data;
  if (summary.pagesProven.concept !== provenConceptCount) {
    return {
      ok: false,
      errors: [
        `[recertification/summary.json] pagesProven.concept (${summary.pagesProven.concept}) does not match proven concepts on disk (${provenConceptCount})`,
      ],
    };
  }

  return { ok: true, summary };
}

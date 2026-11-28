import { describe, expect, it } from 'vitest';
import { buildAutopsyPageView } from '@/lib/pages/autopsy';
import { buildConceptPageView } from '@/lib/pages/concept';
import { computeReadingMinutes } from '@/lib/pages/reading-time';
import { buildSymptomPageView } from '@/lib/pages/symptom';

describe('Page view models', () => {
  it('computeReadingMinutes excludes fenced code blocks and has a minimum of 1', () => {
    expect(computeReadingMinutes('')).toBe(1);
    const shortProseWithHugeCode = `Short intro.\n\n\`\`\`js\n${'const x = 1;\n'.repeat(500)}\`\`\``;
    expect(computeReadingMinutes(shortProseWithHugeCode)).toBe(1);
    const prose500Words = Array.from({ length: 500 }, (_, i) => `word${i}`).join(' ');
    expect(computeReadingMinutes(prose500Words)).toBe(3); // ceil(500 / 230) = 3
  });

  it('buildConceptPageView returns all required fields without inventing proof data', () => {
    const view = buildConceptPageView('css-container-queries');
    expect(view).not.toBeNull();
    expect(view!.id).toBe('css-container-queries');
    expect(view!.title).toBeTruthy();
    expect(view!.domain).toBe('css-layout');
    expect(view!.tldr).toBeTruthy();
    expect(view!.sections.length).toBeGreaterThan(0);
    expect(view!.readingMinutes).toBeGreaterThanOrEqual(1);
    expect(view!.sources.length).toBeGreaterThan(0);
    // Unverified concept with no claims or unverified status must never invent proven status
    if (view!.proofStatus === 'unverified') {
      expect(view!.proof === null || view!.proof.effectiveStatus === 'unverified').toBe(true);
    }
    expect(buildConceptPageView('non-existent-concept-xyz')).toBeNull();
  });

  it('buildAutopsyPageView returns required fields, chapters, case file, and prev/next navigation', () => {
    const view = buildAutopsyPageView('double-payment-race-condition');
    expect(view).not.toBeNull();
    expect(view!.id).toBe('double-payment-race-condition');
    expect(view!.number).toMatch(/^#\d{2,}$/);
    expect(view!.pieceColor).toBeTruthy();
    expect(view!.caseFile.length).toBeGreaterThanOrEqual(5);
    expect(view!.badFixes.length).toBeGreaterThan(0);
    expect(view!.chapters.length).toBeGreaterThan(0);
    expect(view!.causalSteps.length).toBeGreaterThan(0);
    expect(view!.readingMinutes).toBeGreaterThanOrEqual(1);
    // No legacy inline widget tags left in chapter MDX
    for (const ch of view!.chapters) {
      expect(ch.mdx).not.toContain('<CaseFile');
      expect(ch.mdx).not.toContain('<CausalChainStepper');
      expect(ch.mdx).not.toContain('<FailureSimulator');
    }
    expect(buildAutopsyPageView('non-existent-autopsy-xyz')).toBeNull();
  });

  it('buildSymptomPageView returns required fields and never invents engine data', () => {
    const view = buildSymptomPageView('z-index-ignored');
    expect(view).not.toBeNull();
    expect(view!.slug).toBe('z-index-ignored');
    expect(view!.title).toBeTruthy();
    // Unverified migrated symptoms carry no invented signature until Wave 6 proves them
    expect(view!.signature).toBe('');
    expect(view!.signatureEngines).toBeNull();
    expect(view!.causes.length).toBeGreaterThan(0);
    expect(view!.causes[0].rank).toBe(1);
    expect(view!.related.length).toBeLessThanOrEqual(3);
    expect(view!.related.every((r) => r.slug !== 'z-index-ignored')).toBe(true);
    expect(buildSymptomPageView('non-existent-symptom-xyz')).toBeNull();
  });
});

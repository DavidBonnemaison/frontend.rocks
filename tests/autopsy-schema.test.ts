import { describe, expect, it } from 'vitest';
import { AutopsyFrontmatterSchema } from '@/lib/schemas';
import {
  findUnbackedNumbers,
  numbersInExpect,
  validateAutopsyNumberRule,
  validateAutopsyReferences,
} from '@/lib/validators/debug-content-validator';
import { validateAutopsyCaseNumberContiguity } from '@/lib/validators/autopsy-validator';

function step(n: number, extra: Record<string, unknown> = {}) {
  return {
    concept_id: `concept-${n}`,
    step_order: n,
    role_in_chain: 'This step explains the mechanical role in the chain.',
    ...extra,
  };
}

function frontmatter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sample-case',
    case_number: 1,
    piece_color: 'saffron',
    title: 'A sample autopsy title',
    symptom: 'Something looks wrong in production',
    failure_mode: 'silent-data-corruption',
    cast: ['julie', 'karim'],
    traversed_concepts: [step(1), step(2), step(3), step(4)],
    case_file: {
      trigger: 'A customer clicked twice in a hurry.',
      symptom: 'Two charges appeared on the statement.',
      root_cause: 'The lock was set after an await, not before.',
      bad_fixes: [{ label: 'Disable the button', outcome: 'Still two requests on slow networks.' }],
      fix: 'Set the lock synchronously before any await.',
      how_to_spot: 'Two POST requests share one idempotency key.',
    },
    reading_time_min: 8,
    sources: ['https://example.com/spec'],
    last_verified_at: '2026-11-01',
    proof_status: 'unverified',
    ...overrides,
  };
}

function provenFrontmatter(overrides: Record<string, unknown> = {}) {
  const base = frontmatter();
  return frontmatter({
    proof_status: 'proven',
    repro_experiment_id: 'repro-sample-case',
    traversed_concepts: [1, 2, 3, 4].map((n) => step(n, { claim_ids: [`concept-${n}/claim`] })),
    case_file: {
      ...base.case_file,
      root_cause_claims: ['sample-case/root'],
      fix_claims: ['sample-case/fix'],
      how_to_spot_claims: ['sample-case/spot'],
    },
    ...overrides,
  });
}

describe('AutopsyFrontmatterSchema (extended)', () => {
  it('accepts an unverified autopsy without claim links or repro', () => {
    expect(AutopsyFrontmatterSchema.safeParse(frontmatter()).success).toBe(true);
  });

  it('accepts a fully linked proven autopsy', () => {
    const res = AutopsyFrontmatterSchema.safeParse(provenFrontmatter());
    expect(res.success).toBe(true);
  });

  it('rejects a proven autopsy without repro_experiment_id and names the field', () => {
    const fm = provenFrontmatter();
    delete (fm as Record<string, unknown>).repro_experiment_id;
    const res = AutopsyFrontmatterSchema.safeParse(fm);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join('.') === 'repro_experiment_id')).toBe(true);
    }
  });

  it('rejects a proven autopsy with a step lacking claim_ids', () => {
    const fm = provenFrontmatter({
      traversed_concepts: [step(1, { claim_ids: ['a/b'] }), step(2), step(3), step(4)].map((s, i) =>
        i === 0 ? s : { ...s, claim_ids: i === 1 ? undefined : ['a/b'] }
      ),
    });
    const res = AutopsyFrontmatterSchema.safeParse(fm);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join('.') === 'traversed_concepts.1.claim_ids')).toBe(true);
    }
  });

  it('rejects a proven autopsy missing case_file claim lists', () => {
    const fm = provenFrontmatter();
    const cf = { ...(fm.case_file as Record<string, unknown>) };
    delete cf.fix_claims;
    const res = AutopsyFrontmatterSchema.safeParse({ ...fm, case_file: cf });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join('.') === 'case_file.fix_claims')).toBe(true);
    }
  });

  it('requires 4 to 6 steps when proven and 1 to 6 otherwise', () => {
    expect(
      AutopsyFrontmatterSchema.safeParse(frontmatter({ traversed_concepts: [step(1)] })).success
    ).toBe(true);
    expect(
      AutopsyFrontmatterSchema.safeParse(frontmatter({ traversed_concepts: [] })).success
    ).toBe(false);
    const three = [1, 2, 3].map((n) => step(n, { claim_ids: ['a/b'] }));
    expect(AutopsyFrontmatterSchema.safeParse(provenFrontmatter({ traversed_concepts: three })).success).toBe(
      false
    );
  });

  it('keeps piece_color mandatory', () => {
    const fm = frontmatter();
    delete (fm as Record<string, unknown>).piece_color;
    expect(AutopsyFrontmatterSchema.safeParse(fm).success).toBe(false);
  });
});

describe('autopsy references', () => {
  const fm = AutopsyFrontmatterSchema.parse(provenFrontmatter());
  const ids = new Set([
    'concept-1/claim',
    'concept-2/claim',
    'concept-3/claim',
    'concept-4/claim',
    'sample-case/root',
    'sample-case/fix',
    'sample-case/spot',
  ]);

  it('passes when every claim and the repro exist', () => {
    expect(validateAutopsyReferences(fm, { claimIds: ids, experimentIds: new Set(['repro-sample-case']) })).toEqual(
      []
    );
  });

  it('reports unknown claims and a missing repro folder', () => {
    const errors = validateAutopsyReferences(fm, {
      claimIds: new Set(['concept-1/claim']),
      experimentIds: new Set(),
    });
    expect(errors.some((e) => e.includes('unknown claim "sample-case/root"'))).toBe(true);
    expect(errors.some((e) => e.includes('repro_experiment_id'))).toBe(true);
  });
});

describe('number rule', () => {
  const expectBlock = { 'bug-reproduces': { treatment: { requests: 2 }, control: { requests: 1, gap: 38 } } };

  it('collects numbers of the expect block', () => {
    expect([...numbersInExpect(expectBlock)].sort()).toEqual(['1', '2', '38']);
  });

  it('flags numbers with units that the repro does not expect', () => {
    expect(findUnbackedNumbers('A Long Task of 180 ms and 400MB and 35%', new Set())).toEqual([
      '180 ms',
      '400 MB',
      '35%',
    ]);
    expect(findUnbackedNumbers('A Long Task of 38 ms', new Set(['38']))).toEqual([]);
    expect(findUnbackedNumbers('Two requests, 3 servers, 5 seconds apart', new Set())).toEqual([]);
  });

  it('applies to proven autopsies only', () => {
    const proven = AutopsyFrontmatterSchema.parse(
      provenFrontmatter({
        case_file: {
          ...frontmatter().case_file,
          how_to_spot: 'A Long Task of 180 ms blocks the click handler.',
          root_cause_claims: ['a/b'],
          fix_claims: ['a/b'],
          how_to_spot_claims: ['a/b'],
        },
      })
    );
    expect(validateAutopsyNumberRule(proven, expectBlock)).toHaveLength(1);
    expect(validateAutopsyNumberRule({ ...proven, proof_status: 'unverified' }, expectBlock)).toEqual([]);
  });
});

describe('case number contiguity', () => {
  it('counts every autopsy on disk, published or not', () => {
    const present = [
      { id: 'a', case_number: 1 },
      { id: 'b', case_number: 3 },
    ];
    const res = validateAutopsyCaseNumberContiguity(present);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Missing autopsy case_number #2'))).toBe(true);
    expect(
      validateAutopsyCaseNumberContiguity([
        { id: 'a', case_number: 1 },
        { id: 'b', case_number: 2 },
      ]).valid
    ).toBe(true);
  });
});

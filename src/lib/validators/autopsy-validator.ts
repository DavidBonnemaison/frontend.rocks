import matter from 'gray-matter';
import {
  AutopsyFrontmatterSchema,
  type AutopsyCastMember,
  type AutopsyFrontmatter,
} from '../schemas';

export type AutopsySectionKey =
  | 'incident_report'
  | 'red_herring'
  | 'causal_chain'
  | 'failure_simulator'
  | 'layer_dissection'
  | 'architectural_fix';

export interface AutopsyChapter {
  heading: string;
  body: string;
}

export const FORBIDDEN_UNIFORM_H2_PATTERN =
  /^(?:incident[_ ]report|the\s+red\s+herring|red[_ ]herring|causal[_ ]chain|failure[_ ]simulator|layer[_ ]dissection|architectural[_ ]fix(?:\s*(?:&|and)\s*invariants)?|case[_ ]file|conclusion|summary|tl;?\s*dr)$/i;

const CAST_FIRST_NAME_PATTERNS: Record<AutopsyCastMember, RegExp> = {
  julie: /\bJulie\b/,
  karim: /\bKarim\b/,
  nadia: /\bNadia\b/,
  marc: /\bMarc\b/,
  ines: /\bIn[eè]s\b/,
  thomas: /\bThomas\b/,
};

export function stripFencedCodeBlocks(body: string): string {
  const lines = body.split(/\r?\n/);
  const kept: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) {
      kept.push(line);
    }
  }
  return kept.join('\n');
}

export function extractAutopsyChapters(body: string): {
  chapters: AutopsyChapter[];
} {
  const lines = body.split(/\r?\n/);
  const chapters: AutopsyChapter[] = [];
  let inFence = false;
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      if (currentHeading !== null) currentLines.push(line);
      continue;
    }

    if (!inFence && /^##\s+/.test(line)) {
      if (currentHeading !== null) {
        chapters.push({
          heading: currentHeading,
          body: currentLines.join('\n').trim(),
        });
      }
      currentHeading = line
        .replace(/^##\s+/, '')
        .replace(/^0?\d+\s*\/\/\s*/, '')
        .trim();
      currentLines = [];
      continue;
    }

    if (currentHeading !== null) {
      currentLines.push(line);
    }
  }

  if (currentHeading !== null) {
    chapters.push({
      heading: currentHeading,
      body: currentLines.join('\n').trim(),
    });
  }

  return { chapters };
}

export interface AutopsyValidationResult {
  valid: boolean;
  frontmatter?: AutopsyFrontmatter;
  body?: string;
  errors: string[];
}

export function validateAutopsyMdx(
  rawContent: string,
  expectedId?: string,
  validConceptIds?: Set<string>
): AutopsyValidationResult {
  const errors: string[] = [];
  const parsed = matter(rawContent);

  const fmResult = AutopsyFrontmatterSchema.safeParse(parsed.data);
  if (!fmResult.success) {
    for (const issue of fmResult.error.issues) {
      errors.push(`Frontmatter [${issue.path.join('.')}]: ${issue.message}`);
    }
    return { valid: false, errors };
  }

  const frontmatter = fmResult.data;
  if (expectedId && frontmatter.id !== expectedId) {
    errors.push(`Filename id "${expectedId}" does not match frontmatter id "${frontmatter.id}".`);
  }

  // Validate traversed_concepts sequential step_order 1..N and concept existence
  const sortedSteps = [...frontmatter.traversed_concepts].sort(
    (a, b) => a.step_order - b.step_order
  );
  const seenConcepts = new Set<string>();
  sortedSteps.forEach((step, idx) => {
    if (step.step_order !== idx + 1) {
      errors.push(
        `traversed_concepts step_order must be sequential 1..N (got ${step.step_order} at index ${idx}).`
      );
    }
    if (seenConcepts.has(step.concept_id)) {
      errors.push(`Duplicate concept_id "${step.concept_id}" in traversed_concepts.`);
    }
    seenConcepts.add(step.concept_id);
    if (validConceptIds && !validConceptIds.has(step.concept_id)) {
      errors.push(
        `traversed_concepts references unknown concept_id "${step.concept_id}".`
      );
    }
  });

  // 3. Free-form ## chapters bounded between 6 and 10
  const { chapters } = extractAutopsyChapters(parsed.content);
  if (chapters.length < 6 || chapters.length > 10) {
    errors.push(
      `Autopsy must have between 6 and 10 top-level ## narrative chapters (found ${chapters.length}).`
    );
  }
  for (const ch of chapters) {
    if (ch.body.length < 40) {
      errors.push(`Narrative chapter "## ${ch.heading}" is too short (${ch.body.length} chars < 40).`);
    }
    if (FORBIDDEN_UNIFORM_H2_PATTERN.test(ch.heading)) {
      errors.push(
        `Generic uniform h2 heading "${ch.heading}" is forbidden. Use a custom narrative chapter title specific to this incident.`
      );
    }
  }

  const proseWithoutCode = stripFencedCodeBlocks(parsed.content);

  // 4. Mandatory presence of the 3 MDX components outside code blocks (exact count = 1 each)
  const requiredComponents = [
    { name: 'CausalChainStepper', regex: /<CausalChainStepper\s*\/>/g },
    { name: 'FailureSimulator', regex: /<FailureSimulator\s*\/>/g },
    { name: 'CaseFile', regex: /<CaseFile\s*\/>/g },
  ];
  for (const comp of requiredComponents) {
    const matches = proseWithoutCode.match(comp.regex) ?? [];
    if (matches.length !== 1) {
      errors.push(
        `Autopsy body must contain <${comp.name} /> exactly once outside code blocks (found ${matches.length}).`
      );
    }
  }

  // 5. Forbidden legacy remnants
  if (/^\s*-\s+(?:\*\*|`)?T\+\d{2}:\d{2}/m.test(proseWithoutCode)) {
    errors.push('Forbidden legacy timeline marker "- **T+00:00**:" found in autopsy body.');
  }
  if (/^###\s+(?:Step\s+)?0?\d+\s*(?:→|->)/im.test(proseWithoutCode)) {
    errors.push('Forbidden legacy dissection subheading "### 01 → 02:" found in autopsy body.');
  }
  if (/\*\*Architectural Invariants:\*\*/i.test(proseWithoutCode)) {
    errors.push('Forbidden legacy marker "**Architectural Invariants:**" found in autopsy body.');
  }
  if (/\*\*Golden Rule:\*\*/i.test(proseWithoutCode)) {
    errors.push('Forbidden legacy marker "**Golden Rule:**" found in autopsy body.');
  }
  if (/^[^\S\r\n]*\*?Archetype\s*:/im.test(proseWithoutCode)) {
    errors.push(
      'Forbidden internal metadata "Archetype:" found in autopsy body. Remove all Archetype labels from prose.'
    );
  }

  // 6. Cast presence in narrative
  for (const member of frontmatter.cast) {
    const nameRegex = CAST_FIRST_NAME_PATTERNS[member];
    if (!nameRegex.test(proseWithoutCode)) {
      errors.push(
        `Declared cast member "${member}" does not appear by first name in the autopsy narrative.`
      );
    }
  }

  // 7. First-person plural narrator (we / our) >= 4 occurrences outside code
  const weOurMatches = proseWithoutCode.match(/\b(we|our)\b/gi) ?? [];
  if (weOurMatches.length < 4) {
    errors.push(
      `Narrative must use first-person plural narrator ("we"/"our") at least 4 times outside code (found ${weOurMatches.length}).`
    );
  }

  // 8. Target word count (750 to 1650 words outside code blocks)
  const proseWords = proseWithoutCode
    .replace(/<[A-Z][A-Za-z0-9]*\s*\/>/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (proseWords.length < 750 || proseWords.length > 1650) {
    errors.push(
      `Autopsy prose word count outside code blocks must be between 750 and 1650 words (found ${proseWords.length}).`
    );
  }

  return {
    valid: errors.length === 0,
    frontmatter,
    body: parsed.content,
    errors,
  };
}

export function validateAutopsyCastDiversity(
  autopsies: ReadonlyArray<Pick<AutopsyFrontmatter, 'id' | 'case_number' | 'cast'>>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const sorted = [...autopsies].sort((a, b) => a.case_number - b.case_number);
  const byCaseNumber = new Map<number, Pick<AutopsyFrontmatter, 'id' | 'case_number' | 'cast'>>();
  for (const a of sorted) {
    byCaseNumber.set(a.case_number, a);
  }

  for (const current of sorted) {
    const prev = byCaseNumber.get(current.case_number - 1);
    if (!prev) continue;
    const currentKey = [...new Set(current.cast)].sort().join(',');
    const prevKey = [...new Set(prev.cast)].sort().join(',');
    if (currentKey === prevKey) {
      errors.push(
        `Autopsy #${current.case_number} ("${current.id}") has the exact same cast combination [${currentKey}] as previous episode #${prev.case_number} ("${prev.id}").`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateAutopsyCaseNumberContiguity(
  autopsies: ReadonlyArray<Pick<AutopsyFrontmatter, 'id' | 'case_number'>>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (autopsies.length === 0) {
    return { valid: true, errors };
  }

  const byCaseNumber = new Map<number, string[]>();
  for (const a of autopsies) {
    const list = byCaseNumber.get(a.case_number) ?? [];
    list.push(a.id);
    byCaseNumber.set(a.case_number, list);
  }

  for (const [caseNumber, ids] of [...byCaseNumber.entries()].sort((a, b) => a[0] - b[0])) {
    if (ids.length > 1) {
      errors.push(
        `Duplicate autopsy case_number #${caseNumber} shared by: ${ids.join(', ')}.`
      );
    }
  }

  const expectedCount = autopsies.length;
  for (let expected = 1; expected <= expectedCount; expected++) {
    if (!byCaseNumber.has(expected)) {
      errors.push(
        `Missing autopsy case_number #${expected} (expected contiguous sequence 1..${expectedCount}).`
      );
    }
  }

  for (const [caseNumber, ids] of [...byCaseNumber.entries()].sort((a, b) => a[0] - b[0])) {
    if (caseNumber < 1 || caseNumber > expectedCount) {
      errors.push(
        `Out-of-range autopsy case_number #${caseNumber} on "${ids.join(', ')}" (expected contiguous sequence 1..${expectedCount}).`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

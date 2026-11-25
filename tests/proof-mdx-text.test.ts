import { describe, expect, it } from 'vitest';
import { collectProseText, parseMdx } from '@/lib/proof/mdx-text';

describe('parseMdx and collectProseText', () => {
  it('computes lineOffset accurately for frontmatter and assigns absolute line numbers', () => {
    const raw = [
      '---',
      'id: sample',
      'title: Sample',
      'domain: css-layout',
      'summary_tldr: "Short summary text."',
      'relations: []',
      'sources:',
      '  - "https://example.org/"',
      'last_verified_at: "2026-11-25"',
      '---',
      '',
      'First paragraph.',
      '',
      'Second paragraph on line 14.',
    ].join('\n');

    const parsed = parseMdx(raw);
    expect(parsed.lineOffset).toBe(10);

    const { nodes } = collectProseText(parsed);
    const second = nodes.find((n) => n.value.includes('line 14'));
    expect(second).toBeDefined();
    expect(second?.line).toBe(14);
    expect(second?.column).toBe(1);
    expect(second?.contexts).toEqual(['prose']);
  });

  it('tracks heading, table, nested story + claim, and both flow and inline Advice contexts', () => {
    const raw = [
      '## Heading text',
      '',
      '| Col | Val |',
      '| --- | --- |',
      '| Cell A | Cell B |',
      '',
      '<Story>',
      '',
      'Narrative lead <C id="local-slug">fact inside story</C>.',
      '',
      '</Story>',
      '',
      '<Advice>',
      '',
      'Flow advice block.',
      '',
      '</Advice>',
      '',
      'Before <Advice>inline advice note</Advice> after.',
      '',
      'Cross-page <C id="other-page/remote-slug">linked claim</C>.',
    ].join('\n');

    const { nodes } = collectProseText(parseMdx(raw));

    expect(nodes.find((n) => n.value === 'Heading text')?.contexts).toEqual(['heading']);
    expect(nodes.find((n) => n.value === 'Cell A')?.contexts).toEqual(['table']);

    const storyFact = nodes.find((n) => n.value === 'fact inside story');
    expect(storyFact?.contexts).toEqual(['story', 'claim']);
    expect(storyFact?.claimRef).toBe('local-slug');

    const flowAdvice = nodes.find((n) => n.value === 'Flow advice block.');
    expect(flowAdvice?.contexts).toEqual(['advice']);

    const inlineAdvice = nodes.find((n) => n.value === 'inline advice note');
    expect(inlineAdvice?.contexts).toEqual(['advice']);

    const remoteClaim = nodes.find((n) => n.value === 'linked claim');
    expect(remoteClaim?.contexts).toEqual(['claim']);
    expect(remoteClaim?.claimRef).toBe('other-page/remote-slug');
  });

  it('excludes code, inlineCode, html, esm, expressions, images, JSX attributes, link URLs, and computed components', () => {
    const raw = [
      'import Foo from "./foo";',
      '',
      'Check `Chrome 105` inline and {2023} expr.',
      '',
      '```js',
      '// Chrome 105+ in fenced code',
      '```',
      '',
      '![Safari 16 alt text](https://example.org/img.png)',
      '',
      '<div data-note="Chrome 105">Visible text</div>',
      '',
      '[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@container#chrome_105)',
      '',
      '<Support feature="css.at-rules.container">Chrome 105</Support>',
      '<SupportDate feature="css.at-rules.container" event="baseline-low" />',
      '<SpecQuote claim="s">Safari 16</SpecQuote>',
      '<SourceQuote claim="src">Chrome 105</SourceQuote>',
      '<Experiment id="exp">Firefox 110</Experiment>',
    ].join('\n');

    const { nodes } = collectProseText(parseMdx(raw));
    const joined = nodes.map((n) => n.value).join(' | ');

    expect(joined).toContain('Visible text');
    expect(joined).toContain('MDN');
    expect(joined).not.toContain('Chrome 105');
    expect(joined).not.toContain('Safari 16');
    expect(joined).not.toContain('Firefox 110');
    expect(joined).not.toContain('chrome_105');
    expect(joined).not.toContain('2023');
    expect(joined).not.toContain('import Foo');
  });

  it('attaches support-lint-ignore directives only to the next top-level block', () => {
    const raw = [
      '{/* support-lint-ignore dated-history: product name contains a year */}',
      '',
      'Office 2019 renders it this way.',
      '',
      'Another paragraph mentioning 2019.',
      '',
      '{/* support-lint-ignore dated-history: short */}',
      '',
      'Ignored reason too short for 2019.',
    ].join('\n');

    const { nodes, ignores } = collectProseText(parseMdx(raw));
    expect(ignores).toHaveLength(1);
    expect(ignores[0].rule).toBe('dated-history');
    expect(ignores[0].reason).toBe('product name contains a year');

    const officeNode = nodes.find((n) => n.value.includes('Office 2019'));
    const otherNode = nodes.find((n) => n.value.includes('Another paragraph'));
    expect(ignores[0].blockIndex).toBe(officeNode?.blockIndex);
    expect(ignores[0].blockIndex).not.toBe(otherNode?.blockIndex);
  });
});

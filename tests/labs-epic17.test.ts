import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ConstraintSimulatorLabSchema,
  InteractivePrimitiveSchema,
  LiveSandboxLabSchema,
  type LiveSandboxLabConfig,
} from '@/lib/schemas';
import {
  buildSandboxSrcDoc,
  getInitialSandboxValues,
  SANDBOX_IFRAME_POLICY,
} from '@/components/labs/LiveSandboxLab';
import { computeSimulation } from '@/components/labs/ConstraintSimulatorLab';

const LABS_DIR = path.join(process.cwd(), 'content', 'labs');

describe('EPIC-17 US-17.1: Eradication of generic-metrics & LiveSandboxLab', () => {
  it('rejects presetMode: "generic-metrics" in ConstraintSimulatorLabSchema and InteractivePrimitiveSchema', () => {
    const legacyLab = {
      type: 'constraint-simulator',
      id: 'legacy-fake-sim',
      title: 'Legacy Fake Simulator',
      presetMode: 'generic-metrics',
      controls: [
        {
          key: 'count',
          label: 'Count',
          kind: 'range',
          min: 1,
          max: 10,
          defaultValue: 5,
        },
      ],
    };

    expect(ConstraintSimulatorLabSchema.safeParse(legacyLab).success).toBe(false);
    expect(InteractivePrimitiveSchema.safeParse(legacyLab).success).toBe(false);
  });

  it('validates LiveSandboxLabSchema and rejects malformed cssVar', () => {
    const validSandbox: LiveSandboxLabConfig = {
      type: 'live-sandbox',
      id: 'test-sandbox',
      title: 'Test Sandbox',
      description: 'Validates CSS custom properties and class toggles.',
      html: '<div class="box">Box</div>',
      css: '.box { width: var(--box-w, 100px); }',
      js: 'document.querySelector(".box").setAttribute("data-ready", "1");',
      controls: [
        {
          key: 'width',
          label: 'Width',
          kind: 'range',
          target: 'css-var',
          cssVar: '--box-w',
          min: 50,
          max: 200,
          unit: 'px',
          defaultValue: 120,
        },
        {
          key: 'active',
          label: 'Active',
          kind: 'toggle',
          target: 'class',
          className: 'is-active',
          defaultValue: true,
        },
      ],
      expectedObservation: 'The box width updates live via --box-w and toggles is-active.',
    };

    expect(LiveSandboxLabSchema.safeParse(validSandbox).success).toBe(true);
    expect(InteractivePrimitiveSchema.safeParse(validSandbox).success).toBe(true);

    const invalidCssVar = {
      ...validSandbox,
      controls: [
        {
          key: 'width',
          label: 'Width',
          kind: 'range',
          target: 'css-var',
          cssVar: 'box-w',
          defaultValue: 120,
        },
      ],
    };
    expect(LiveSandboxLabSchema.safeParse(invalidCssVar).success).toBe(false);
  });

  it('enforces strict iframe sandbox policy without allow-same-origin', () => {
    expect(SANDBOX_IFRAME_POLICY).toBe('allow-scripts');
    expect(SANDBOX_IFRAME_POLICY).not.toContain('allow-same-origin');
  });

  it('generates deterministic srcDoc with CSS variables, toggled classes, and no external assets', () => {
    const config: LiveSandboxLabConfig = {
      type: 'live-sandbox',
      id: 'deterministic-test',
      title: 'Deterministic Sandbox',
      html: '<div class="item">Hello</div>',
      css: '.item { height: var(--h); }',
      js: 'var x = "</script>";',
      controls: [
        {
          key: 'height',
          label: 'Height',
          kind: 'range',
          target: 'css-var',
          cssVar: '--h',
          unit: 'px',
          defaultValue: 80,
        },
        {
          key: 'enabled',
          label: 'Enabled',
          kind: 'toggle',
          target: 'class',
          className: 'is-on',
          defaultValue: true,
        },
        {
          key: 'mode',
          label: 'Mode',
          kind: 'select',
          target: 'class',
          classPrefix: 'mode-',
          options: ['a', 'b'],
          defaultValue: 'b',
        },
      ],
      expectedObservation: 'Height and mode classes appear deterministically in srcDoc.',
    };

    const values = getInitialSandboxValues(config);
    const doc1 = buildSandboxSrcDoc(config, values);
    const doc2 = buildSandboxSrcDoc(config, values);

    expect(doc1).toBe(doc2);
    expect(doc1).toContain('--h: 80px;');
    expect(doc1).toContain('class="sandbox-root is-on mode-b"');
    expect(doc1).not.toMatch(/<(?:script|link)\b[^>]+https?:\/\//i);
    // Closing script tag inside JS payload must be escaped
    expect(doc1).toContain('<\\/script>');
  });

  it('validates all content/labs/*.json with zero generic-metrics and at least 5 live-sandbox labs', () => {
    const files = fs.readdirSync(LABS_DIR).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(20);

    let liveSandboxCount = 0;

    for (const file of files) {
      const fullPath = path.join(LABS_DIR, file);
      const rawText = fs.readFileSync(fullPath, 'utf-8');
      expect(rawText).not.toContain('generic-metrics');

      const parsed = InteractivePrimitiveSchema.parse(JSON.parse(rawText));

      if (parsed.type === 'live-sandbox') {
        liveSandboxCount += 1;
        const srcDoc = buildSandboxSrcDoc(parsed, getInitialSandboxValues(parsed));
        expect(srcDoc).toContain('<!DOCTYPE html>');
        expect(srcDoc).not.toMatch(/<(?:script|link)\b[^>]+https?:\/\//i);
      }

      if (parsed.type === 'constraint-simulator') {
        const initValues: Record<string, number | boolean | string> = {};
        for (const ctrl of parsed.controls) {
          initValues[ctrl.key] = ctrl.defaultValue;
        }
        const sim = computeSimulation(parsed.presetMode, initValues);
        expect(sim.metrics.length).toBeGreaterThanOrEqual(2);
        expect(sim.summary.length).toBeGreaterThan(20);
      }
    }

    expect(liveSandboxCount).toBeGreaterThanOrEqual(5);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCTION_SYMPTOMS } from '@/config/symptoms';
import { analyzeDiagnosticPayload } from '@/lib/diagnose/analyze';
import { DEMO_TRACES } from '@/lib/diagnose/demo-traces';
import { DETECTOR_PRESCRIPTIONS } from '@/lib/diagnose/prescriptions';
import { MAX_DIAGNOSE_FILE_BYTES } from '@/lib/diagnose/types';

describe('US-18.1: Client-Side Diagnostic Tool (/diagnose)', () => {
  describe('Chrome DevTools Trace (.json) detectors', () => {
    it('detects Long Tasks > 50 ms and marks > 200 ms as critical', () => {
      const payload = JSON.stringify({
        traceEvents: [
          { name: 'RunTask', ph: 'X', ts: 1000, dur: 65000 }, // 65 ms
          { name: 'RunTask', ph: 'X', ts: 80000, dur: 245000 }, // 245 ms critical
        ],
      });

      const result = analyzeDiagnosticPayload(payload, 'long-task.json');
      expect(result.format).toBe('chrome-trace');
      const finding = result.findings.find((f) => f.detector === 'long-tasks');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('critical');
      expect(finding?.occurrences).toBe(2);
      expect(finding?.worstDurationMs).toBe(245);
      expect(finding?.prescriptions.map((p) => p.slug)).toEqual(
        expect.arrayContaining([
          'event-loop-tasks-microtasks',
          'long-tasks-and-inp',
          'scheduler-api-yield',
          'main-thread-freeze',
        ])
      );
    });

    it('detects Forced Synchronous Reflows with synchronous stack traces', () => {
      const payload = JSON.stringify([
        {
          name: 'UpdateLayoutTree',
          ph: 'X',
          ts: 1000,
          dur: 12000,
          args: {
            beginData: {
              stackTrace: [{ functionName: 'syncMeasure', url: 'https://app.test/ui.js', lineNumber: 42 }],
            },
          },
        },
        {
          name: 'Layout',
          ph: 'X',
          ts: 15000,
          dur: 18500,
          args: {
            beginData: {
              stackTrace: [{ functionName: 'syncMeasure', url: 'https://app.test/ui.js', lineNumber: 44 }],
            },
          },
        },
      ]);

      const result = analyzeDiagnosticPayload(payload, 'reflow.json');
      const finding = result.findings.find((f) => f.detector === 'forced-reflow');
      expect(finding).toBeDefined();
      expect(finding?.occurrences).toBe(2);
      expect(finding?.worstDurationMs).toBe(18.5);
      expect(finding?.prescriptions.map((p) => p.slug)).toEqual(
        expect.arrayContaining([
          'layout-thrashing',
          'render-tree-layout',
          'forced-layout-reflow',
          'fourteen-rerenders-one-click',
        ])
      );
    });

    it('detects Paint and CompositeLayers exceeding 16.6 ms frame budget', () => {
      const payload = JSON.stringify({
        traceEvents: [
          { name: 'Paint', ph: 'X', ts: 1000, dur: 22400 },
          { name: 'CompositeLayers', ph: 'X', ts: 30000, dur: 38000 },
        ],
      });

      const result = analyzeDiagnosticPayload(payload, 'paint.json');
      const finding = result.findings.find((f) => f.detector === 'paint-compositor');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('critical');
      expect(finding?.occurrences).toBe(2);
      expect(finding?.worstDurationMs).toBe(38);
      expect(finding?.prescriptions.map((p) => p.slug)).toEqual(
        expect.arrayContaining([
          'gpu-compositor-layers',
          'css-containment',
          'mobile-scroll-jank-vram-explosion',
        ])
      );
    });

    it('detects MajorGC / MinorGC pauses > 20 ms', () => {
      const payload = JSON.stringify({
        traceEvents: [
          { name: 'MajorGC', ph: 'X', ts: 1000, dur: 54000 },
          { name: 'MinorGC', ph: 'X', ts: 70000, dur: 8000 },
        ],
      });

      const result = analyzeDiagnosticPayload(payload, 'gc.json');
      const finding = result.findings.find((f) => f.detector === 'gc-pauses');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('critical');
      expect(finding?.occurrences).toBe(2);
      expect(finding?.worstDurationMs).toBe(54);
      expect(finding?.prescriptions.map((p) => p.slug)).toEqual(
        expect.arrayContaining([
          'js-garbage-collection',
          'js-memory-leaks-retainers',
          'eight-hour-spa-memory-leak',
        ])
      );
    });
  });

  describe('HTTP Archive (.har) detectors', () => {
    it('detects sequential Request Waterfalls > 3 levels, Cache Miss / no-store, and Duplicate Concurrent Mutations', () => {
      const har = {
        log: {
          version: '1.2',
          entries: [
            {
              startedDateTime: '2026-04-01T10:00:00.000Z',
              time: 100,
              request: { method: 'GET', url: 'https://example.com/' },
              response: { status: 200, headers: [] },
            },
            {
              startedDateTime: '2026-04-01T10:00:00.110Z',
              time: 120,
              request: { method: 'GET', url: 'https://example.com/app.js' },
              response: {
                status: 200,
                headers: [{ name: 'Cache-Control', value: 'no-store' }],
                content: { mimeType: 'application/javascript' },
              },
              _initiator: { url: 'https://example.com/' },
            },
            {
              startedDateTime: '2026-04-01T10:00:00.240Z',
              time: 140,
              request: { method: 'GET', url: 'https://example.com/styles.css' },
              response: {
                status: 200,
                headers: [{ name: 'Cache-Control', value: 'no-cache' }],
                content: { mimeType: 'text/css' },
              },
              _initiator: { url: 'https://example.com/app.js' },
            },
            {
              startedDateTime: '2026-04-01T10:00:00.390Z',
              time: 160,
              request: { method: 'GET', url: 'https://example.com/api/data' },
              response: { status: 200, headers: [] },
              _initiator: { url: 'https://example.com/styles.css' },
            },
            {
              startedDateTime: '2026-04-01T10:00:01.000Z',
              time: 90,
              request: { method: 'POST', url: 'https://example.com/api/pay' },
              response: { status: 200, headers: [] },
            },
            {
              startedDateTime: '2026-04-01T10:00:01.050Z',
              time: 95,
              request: { method: 'POST', url: 'https://example.com/api/pay' },
              response: { status: 200, headers: [] },
            },
          ],
        },
      };

      const result = analyzeDiagnosticPayload(JSON.stringify(har), 'capture.har');
      expect(result.format).toBe('har');

      const waterfall = result.findings.find((f) => f.detector === 'request-waterfall');
      expect(waterfall).toBeDefined();
      expect(waterfall?.occurrences).toBe(4);
      expect(waterfall?.prescriptions.map((p) => p.slug)).toEqual(
        expect.arrayContaining([
          'preload-scanner-hints',
          'early-hints-103',
          'http2-http3-multiplexing',
        ])
      );

      const cacheMiss = result.findings.find((f) => f.detector === 'cache-miss');
      expect(cacheMiss).toBeDefined();
      expect(cacheMiss?.severity).toBe('critical');
      expect(cacheMiss?.occurrences).toBe(2);
      expect(cacheMiss?.prescriptions.map((p) => p.slug)).toEqual(
        expect.arrayContaining([
          'http-caching-directives',
          'bfcache-navigation',
          'zombie-bundle-after-deploy',
        ])
      );

      const duplicate = result.findings.find((f) => f.detector === 'duplicate-mutations');
      expect(duplicate).toBeDefined();
      expect(duplicate?.severity).toBe('critical');
      expect(duplicate?.occurrences).toBe(1);
      expect(duplicate?.prescriptions.map((p) => p.slug)).toEqual(
        expect.arrayContaining([
          'idempotency-optimistic-queues',
          'double-payment-race-condition',
        ])
      );
    });
  });

  describe('Embedded demo traces & validation guards', () => {
    it('analyzes all 3 embedded demo traces with non-empty findings', () => {
      expect(DEMO_TRACES).toHaveLength(3);
      for (const preset of DEMO_TRACES) {
        const result = analyzeDiagnosticPayload(preset.payload, preset.fileName);
        expect(result.format).toBe(preset.format);
        expect(result.findings.length).toBeGreaterThan(0);
      }
    });

    it('rejects files larger than 50 MB and invalid JSON', () => {
      expect(() =>
        analyzeDiagnosticPayload('{}', 'huge.json', MAX_DIAGNOSE_FILE_BYTES + 1)
      ).toThrow(/50 MB/);
      expect(() => analyzeDiagnosticPayload('not-json', 'broken.json')).toThrow(/Invalid JSON/);
      expect(() => analyzeDiagnosticPayload('{"foo": 1}', 'unknown.json')).toThrow(
        /Unrecognized file structure/
      );
    });

    it('verifies every prescribed slug exists in the real repository corpus', () => {
      const root = process.cwd();
      const conceptFiles = new Set(
        fs
          .readdirSync(path.join(root, 'content/concepts'))
          .filter((f) => f.endsWith('.mdx'))
          .map((f) => f.replace(/\.mdx$/, ''))
      );
      const autopsyFiles = new Set(
        fs
          .readdirSync(path.join(root, 'content/autopsies'))
          .filter((f) => f.endsWith('.mdx'))
          .map((f) => f.replace(/\.mdx$/, ''))
      );
      const symptomSlugs = new Set(PRODUCTION_SYMPTOMS.map((s) => s.slug));

      for (const links of Object.values(DETECTOR_PRESCRIPTIONS)) {
        for (const link of links) {
          if (link.type === 'concept') {
            expect(conceptFiles.has(link.slug), `Missing concept: ${link.slug}`).toBe(true);
          } else if (link.type === 'autopsy') {
            expect(autopsyFiles.has(link.slug), `Missing autopsy: ${link.slug}`).toBe(true);
          } else if (link.type === 'symptom') {
            expect(symptomSlugs.has(link.slug), `Missing symptom: ${link.slug}`).toBe(true);
          }
        }
      }
    });
  });
});

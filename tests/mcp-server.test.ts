import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  createFrontendRocksMcpServer,
  MCP_SERVER_NAME,
} from '../packages/mcp-server/src/server.js';
import { FrontendRocksDataSource } from '../packages/mcp-server/src/data-source.js';
import { handleMcpHttpRequest } from '../packages/mcp-server/src/http.js';
import {
  CheckPatternObsolescenceOutputSchema,
  DiagnoseSymptomOutputSchema,
  FindRelatedAutopsyOutputSchema,
  GetConceptInternalsOutputSchema,
} from '../packages/mcp-server/src/tools.js';

// Synthetic artifacts (see tests/fixtures/build-public-fixtures.ts): the real public/ is generated and filtered at build time.
const PUBLIC_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'public');
const MCP_PACKAGE_DIR = path.join(process.cwd(), 'packages', 'mcp-server');

function extractStructuredResult(response: {
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: string; text?: string }>;
}): unknown {
  if (response.structuredContent) {
    return response.structuredContent;
  }
  const textBlock = response.content?.find((item) => item.type === 'text');
  if (!textBlock?.text) {
    throw new Error('MCP tool response contained neither structuredContent nor text content');
  }
  return JSON.parse(textBlock.text);
}

describe('@frontend-rocks/mcp server (US-19.2)', () => {
  let client: Client;
  let closeAll: () => Promise<void>;

  beforeAll(async () => {
    const { server } = createFrontendRocksMcpServer({
      localPublicDir: PUBLIC_DIR,
      preferLocal: true,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({
      name: 'frontend-rocks-mcp-test-client',
      version: '1.0.0',
    });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    closeAll = async () => {
      await client.close();
      await server.close();
    };
  });

  afterAll(async () => {
    await closeAll();
  });

  it('exposes the 4 official MCP tools over protocol listTools()', async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();

    expect(names).toEqual([
      'check_pattern_obsolescence',
      'diagnose_symptom',
      'find_related_autopsy',
      'get_concept_internals',
    ]);

    for (const tool of result.tools) {
      expect(tool.description?.length ?? 0).toBeGreaterThan(20);
      expect(tool.inputSchema).toBeDefined();
    }
  });

  describe('diagnose_symptom', () => {
    it('diagnoses a blocked open with causal chain and canonical links', async () => {
      const raw = await client.callTool({
        name: 'diagnose_symptom',
        arguments: {
          query: 'fixture open blocked without version handler',
          devtools_error: 'onblocked pending request after upgrade',
        },
      });

      const parsed = DiagnoseSymptomOutputSchema.parse(
        extractStructuredResult(raw as never)
      );

      expect(parsed.matched_rules.length).toBeGreaterThan(0);
      expect(parsed.matched_rules[0].id).toBe('fixture-blocked-open-without-handler');
      expect(parsed.probable_causal_chain.length).toBeGreaterThan(0);
      expect(parsed.probable_causal_chain[0].lab_url).toMatch(/#lab$/);
      expect(parsed.related_autopsies.some((a) => a.id === 'fixture-autopsy')).toBe(true);
      expect(parsed.related_autopsies[0].failure_simulator_url).toMatch(
        /#failure-simulator$/
      );
    });

    it('diagnoses a value trapped in an isolated context', async () => {
      const raw = await client.callTool({
        name: 'diagnose_symptom',
        arguments: {
          query: 'fixture layer value trapped in isolated parent context',
        },
      });

      const parsed = DiagnoseSymptomOutputSchema.parse(
        extractStructuredResult(raw as never)
      );

      expect(parsed.matched_rules.length).toBeGreaterThan(0);
      expect(parsed.matched_rules[0].id).toBe('fixture-layer-trapped-in-context');
      expect(parsed.related_symptoms.some((s) => s.slug === 'fixture-symptom')).toBe(true);
    });

    it('says there is no proven match yet when nothing matches', async () => {
      const raw = await client.callTool({
        name: 'diagnose_symptom',
        arguments: { query: 'zzqx unmatched query' },
      });

      const parsed = DiagnoseSymptomOutputSchema.parse(
        extractStructuredResult(raw as never)
      );

      expect(parsed.matched_rules).toEqual([]);
      expect(parsed.summary).toContain('No proven match yet');
    });
  });

  describe('get_concept_internals', () => {
    it('returns full Markdown twin and graph neighbors for fixture-concept-a', async () => {
      const raw = await client.callTool({
        name: 'get_concept_internals',
        arguments: { concept_id: 'fixture-concept-a' },
      });

      const parsed = GetConceptInternalsOutputSchema.parse(
        extractStructuredResult(raw as never)
      );

      expect(parsed.found).toBe(true);
      expect(parsed.title).toContain('Fixture Concept A');
      expect(parsed.markdown).toContain('# Fixture Concept A');
      expect(parsed.canonical_url).toBe('https://frontend.rocks/concepts/fixture-concept-a/');
      expect(parsed.neighbors.requires.map((n) => n.id)).toEqual(['fixture-concept-c']);
      expect(parsed.neighbors.replaces.map((n) => n.id)).toEqual(['fixture-concept-b']);
    });

    it('returns incoming neighbors for fixture-concept-b', async () => {
      const raw = await client.callTool({
        name: 'get_concept_internals',
        arguments: { concept_id: 'fixture-concept-b' },
      });

      const parsed = GetConceptInternalsOutputSchema.parse(
        extractStructuredResult(raw as never)
      );

      expect(parsed.found).toBe(true);
      expect(parsed.markdown?.length ?? 0).toBeGreaterThan(100);
      expect(parsed.neighbors.replaced_by.map((n) => n.id)).toEqual(['fixture-concept-a']);
    });

    it('handles unknown concept_id cleanly with closest suggestions and a clear message', async () => {
      const raw = await client.callTool({
        name: 'get_concept_internals',
        arguments: { concept_id: 'fixture-concept' },
      });

      const parsed = GetConceptInternalsOutputSchema.parse(
        extractStructuredResult(raw as never)
      );

      expect(parsed.found).toBe(false);
      expect(parsed.error).toContain('not found');
      expect(parsed.message).toContain('not available');
      expect(parsed.suggestions.some((s) => s.id === 'fixture-concept-a')).toBe(true);
    });

    it('returns found: false instead of throwing when the twin of a graph node is missing', async () => {
      const raw = await client.callTool({
        name: 'get_concept_internals',
        arguments: { concept_id: 'fixture-concept-c' },
      });

      const parsed = GetConceptInternalsOutputSchema.parse(
        extractStructuredResult(raw as never)
      );

      expect(parsed.found).toBe(false);
      expect(parsed.message).toContain('not available');
    });
  });

  describe('check_pattern_obsolescence', () => {
    it('flags a superseded legacy pattern with its replacement and /vs/ link', async () => {
      const raw = await client.callTool({
        name: 'check_pattern_obsolescence',
        arguments: { pattern_or_api: 'fixture-concept-b' },
      });

      const parsed = CheckPatternObsolescenceOutputSchema.parse(
        extractStructuredResult(raw as never)
      );

      expect(parsed.found).toBe(true);
      expect(parsed.is_obsolete).toBe(true);
      expect(parsed.maturity_status).toBe('superseded');
      expect(parsed.replacement_primitives.some((r) => r.id === 'fixture-concept-a')).toBe(true);
      expect(
        parsed.vs_comparisons.some(
          (v) =>
            v.slug === 'fixture-concept-a-vs-fixture-concept-b' &&
            v.canonical_url ===
              'https://frontend.rocks/vs/fixture-concept-a-vs-fixture-concept-b/'
        )
      ).toBe(true);
    });

    it('recognizes a baseline-widely concept as active and non-obsolete', async () => {
      const raw = await client.callTool({
        name: 'check_pattern_obsolescence',
        arguments: { pattern_or_api: 'fixture-concept-c' },
      });

      const parsed = CheckPatternObsolescenceOutputSchema.parse(
        extractStructuredResult(raw as never)
      );

      expect(parsed.found).toBe(true);
      expect(parsed.is_obsolete).toBe(false);
      expect(parsed.maturity_status).toBe('baseline-widely');
      expect(parsed.replacement_primitives).toEqual([]);
    });

    it('returns found: false with a clear message for an unknown pattern', async () => {
      const raw = await client.callTool({
        name: 'check_pattern_obsolescence',
        arguments: { pattern_or_api: 'zzqx-unknown-pattern' },
      });

      const parsed = CheckPatternObsolescenceOutputSchema.parse(
        extractStructuredResult(raw as never)
      );

      expect(parsed.found).toBe(false);
      expect(parsed.message).toContain('not available');
    });

    it('handles null maturity_status as not a platform feature', async () => {
      const os = await import('node:os');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-null-maturity-'));
      try {
        fs.writeFileSync(
          path.join(tmpDir, 'graph.json'),
          JSON.stringify({
            nodes: [
              {
                id: 'hexagonal-ports-adapters-ui',
                title: 'Hexagonal Architecture',
                domain: 'software-architecture',
                maturity_status: null,
                superseded_by: [],
                summary_tldr: 'Decouple domain logic from UI adapters via ports.',
              },
            ],
            edges: [],
          })
        );
        const { server } = createFrontendRocksMcpServer({
          localPublicDir: tmpDir,
          preferLocal: true,
        });
        const [ct, st] = InMemoryTransport.createLinkedPair();
        const localClient = new Client({ name: 'test-null-maturity', version: '1.0.0' });
        await Promise.all([server.connect(st), localClient.connect(ct)]);
        try {
          const raw = await localClient.callTool({
            name: 'check_pattern_obsolescence',
            arguments: { pattern_or_api: 'hexagonal-ports-adapters-ui' },
          });
          const parsed = CheckPatternObsolescenceOutputSchema.parse(
            extractStructuredResult(raw as never)
          );
          expect(parsed.found).toBe(true);
          expect(parsed.is_obsolete).toBe(false);
          expect(parsed.maturity_status).toBeNull();
          expect(parsed.verdict).toContain('not a platform feature');
        } finally {
          await localClient.close();
          await server.close();
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('find_related_autopsy', () => {
    it('finds the fixture autopsy by concept keyword with full CaseFile summary', async () => {
      const raw = await client.callTool({
        name: 'find_related_autopsy',
        arguments: { concept_id_or_failure_mode: 'fixture-concept-a' },
      });

      const parsed = FindRelatedAutopsyOutputSchema.parse(
        extractStructuredResult(raw as never)
      );

      expect(parsed.total_matches).toBeGreaterThan(0);
      const autopsy = parsed.matches.find((m) => m.id === 'fixture-autopsy');
      expect(autopsy).toBeDefined();
      expect(autopsy!.trigger.length).toBeGreaterThan(10);
      expect(autopsy!.root_cause.length).toBeGreaterThan(10);
      expect(autopsy!.bad_fixes.length).toBeGreaterThanOrEqual(2);
      expect(autopsy!.fix).toContain('onversionchange');
      expect(autopsy!.how_to_spot).toContain('DevTools');
    });

    it('finds autopsies by failure mode string', async () => {
      const raw = await client.callTool({
        name: 'find_related_autopsy',
        arguments: { concept_id_or_failure_mode: 'Cascading Latency' },
      });

      const parsed = FindRelatedAutopsyOutputSchema.parse(
        extractStructuredResult(raw as never)
      );

      expect(parsed.total_matches).toBeGreaterThan(0);
      expect(
        parsed.matches.some((m) => m.failure_mode.toLowerCase().includes('cascading latency'))
      ).toBe(true);
    });

    it('returns an empty result with a clear message when nothing matches', async () => {
      const raw = await client.callTool({
        name: 'find_related_autopsy',
        arguments: { concept_id_or_failure_mode: 'zzqx-unknown' },
      });

      const parsed = FindRelatedAutopsyOutputSchema.parse(
        extractStructuredResult(raw as never)
      );

      expect(parsed.total_matches).toBe(0);
      expect(parsed.message).toContain('not available');
    });
  });

  describe('warm-cache latency & zero-secret guarantees', () => {
    it('serves all 4 MCP tools in < 200 ms on warm cache', async () => {
      const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [
        {
          name: 'diagnose_symptom',
          arguments: { query: 'fixture open blocked without version handler' },
        },
        {
          name: 'get_concept_internals',
          arguments: { concept_id: 'fixture-concept-a' },
        },
        {
          name: 'check_pattern_obsolescence',
          arguments: { pattern_or_api: 'fixture-concept-b' },
        },
        {
          name: 'find_related_autopsy',
          arguments: { concept_id_or_failure_mode: 'fixture-concept-a' },
        },
      ];

      // Ensure warm cache first
      for (const call of calls) {
        await client.callTool(call);
      }

      // Measure each warm-cache roundtrip
      for (const call of calls) {
        const start = performance.now();
        await client.callTool(call);
        const elapsedMs = performance.now() - start;
        expect(elapsedMs).toBeLessThan(200);
      }
    });

    it('has zero dependency on secrets, API keys, or private repo files', () => {
      const pkgJson = JSON.parse(
        fs.readFileSync(path.join(MCP_PACKAGE_DIR, 'package.json'), 'utf-8')
      ) as {
        name: string;
        license: string;
        dependencies: Record<string, string>;
      };

      expect(pkgJson.name).toBe(MCP_SERVER_NAME);
      expect(pkgJson.license).toBe('MIT');
      expect(Object.keys(pkgJson.dependencies).sort()).toEqual([
        '@modelcontextprotocol/sdk',
        'zod',
      ]);

      const srcDir = path.join(MCP_PACKAGE_DIR, 'src');
      const srcFiles = fs
        .readdirSync(srcDir)
        .filter((f) => f.endsWith('.ts'))
        .map((f) => fs.readFileSync(path.join(srcDir, f), 'utf-8'))
        .join('\n');

      const forbiddenPatterns = [
        /API_KEY/i,
        /AUTH_TOKEN/i,
        /SECRET/i,
        /Authorization:/i,
        /dotenv|['"]\.env\b/i,
        /src\/lib\//,
        /content\/concepts\//,
      ];

      for (const pattern of forbiddenPatterns) {
        expect(srcFiles).not.toMatch(pattern);
      }
    });
  });

  describe('Hosted Streamable HTTP MCP Endpoint (/mcp)', () => {
    const sharedDataSource = new FrontendRocksDataSource({
      localPublicDir: PUBLIC_DIR,
      preferLocal: true,
    });

    async function postJsonRpc(body: Record<string, unknown>) {
      const req = new Request('https://frontend.rocks/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(body),
      });
      const res = await handleMcpHttpRequest(req, { dataSource: sharedDataSource });
      const json = (await res.json()) as Record<string, unknown>;
      return { res, json };
    }

    it('handles CORS OPTIONS preflight and GET discovery metadata', async () => {
      const preflight = await handleMcpHttpRequest(
        new Request('https://frontend.rocks/mcp', { method: 'OPTIONS' }),
        { dataSource: sharedDataSource }
      );
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('*');

      const discovery = await handleMcpHttpRequest(
        new Request('https://frontend.rocks/mcp', { method: 'GET' }),
        { dataSource: sharedDataSource }
      );
      expect(discovery.status).toBe(200);
      const body = (await discovery.json()) as {
        name: string;
        transport: string;
        endpoint: string;
        tools: string[];
      };
      expect(body.name).toBe(MCP_SERVER_NAME);
      expect(body.transport).toBe('streamable-http');
      expect(body.endpoint).toBe('https://frontend.rocks/mcp');
      expect(body.tools).toEqual([
        'diagnose_symptom',
        'get_concept_internals',
        'check_pattern_obsolescence',
        'find_related_autopsy',
      ]);
    });

    it('responds to stateless MCP initialize, tools/list, and tools/call over POST /mcp', async () => {
      const init = await postJsonRpc({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'vitest-http-client', version: '1.0.0' },
        },
      });
      expect(init.res.status).toBe(200);
      expect(init.res.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect((init.json.result as { serverInfo: { name: string } }).serverInfo.name).toBe(
        MCP_SERVER_NAME
      );

      const listed = await postJsonRpc({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      });
      expect(listed.res.status).toBe(200);
      const tools = (listed.json.result as { tools: Array<{ name: string }> }).tools
        .map((t) => t.name)
        .sort();
      expect(tools).toEqual([
        'check_pattern_obsolescence',
        'diagnose_symptom',
        'find_related_autopsy',
        'get_concept_internals',
      ]);

      const called = await postJsonRpc({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'diagnose_symptom',
          arguments: { query: 'fixture open blocked without version handler' },
        },
      });
      expect(called.res.status).toBe(200);
      const result = DiagnoseSymptomOutputSchema.parse(
        extractStructuredResult(
          called.json.result as {
            structuredContent?: Record<string, unknown>;
            content?: Array<{ type: string; text?: string }>;
          }
        )
      );
      expect(result.matched_rules.length).toBeGreaterThan(0);
      expect(
        result.matched_rules.some((m) =>
          m.canonical_urls.autopsies.some((u) => u.includes('fixture-autopsy'))
        )
      ).toBe(true);
    });
  });
});

describe('MCP tools on quarantined (empty or missing) artifacts', () => {
  function emptyArtifactsFetch(): typeof fetch {
    return (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/graph.json')) {
        return new Response(JSON.stringify({ nodes: [], edges: [] }), { status: 200 });
      }
      if (url.endsWith('/audit-rules.json')) {
        return new Response(JSON.stringify({ rule_count: 0, rules: [] }), { status: 200 });
      }
      return new Response('', { status: 404 });
    }) as typeof fetch;
  }

  async function connect(): Promise<{ client: Client; close: () => Promise<void> }> {
    const { server } = createFrontendRocksMcpServer({
      localPublicDir: path.join(process.cwd(), 'tests', 'fixtures', 'does-not-exist'),
      fetchImpl: emptyArtifactsFetch(),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const c = new Client({ name: 'quarantine-test-client', version: '1.0.0' });
    await Promise.all([server.connect(serverTransport), c.connect(clientTransport)]);
    return {
      client: c,
      close: async () => {
        await c.close();
        await server.close();
      },
    };
  }

  it('get_concept_internals returns found: false with a message, not an error', async () => {
    const { client: c, close } = await connect();
    try {
      const raw = await c.callTool({ name: 'get_concept_internals', arguments: { concept_id: 'x' } });
      const parsed = GetConceptInternalsOutputSchema.parse(extractStructuredResult(raw as never));
      expect(parsed.found).toBe(false);
      expect(parsed.message).toContain('not available');
    } finally {
      await close();
    }
  });

  it('diagnose_symptom does not throw on an empty catalog', async () => {
    const { client: c, close } = await connect();
    try {
      const raw = await c.callTool({ name: 'diagnose_symptom', arguments: { query: 'z-index' } });
      expect(raw.isError).not.toBe(true);
      const parsed = DiagnoseSymptomOutputSchema.parse(extractStructuredResult(raw as never));
      expect(parsed.matched_rules).toEqual([]);
      expect(parsed.summary).toContain('No proven match yet');
    } finally {
      await close();
    }
  });

  it('check_pattern_obsolescence and find_related_autopsy answer cleanly on an empty graph', async () => {
    const { client: c, close } = await connect();
    try {
      const obs = CheckPatternObsolescenceOutputSchema.parse(
        extractStructuredResult(
          (await c.callTool({
            name: 'check_pattern_obsolescence',
            arguments: { pattern_or_api: 'z-index' },
          })) as never
        )
      );
      expect(obs.found).toBe(false);
      expect(obs.message).toContain('not available');

      const autopsy = FindRelatedAutopsyOutputSchema.parse(
        extractStructuredResult(
          (await c.callTool({
            name: 'find_related_autopsy',
            arguments: { concept_id_or_failure_mode: 'z-index' },
          })) as never
        )
      );
      expect(autopsy.total_matches).toBe(0);
    } finally {
      await close();
    }
  });
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  FrontendRocksDataSource,
  type FrontendRocksDataSourceOptions,
} from './data-source.js';
import {
  CheckPatternObsolescenceInputSchema,
  CheckPatternObsolescenceOutputSchema,
  DiagnoseSymptomInputSchema,
  DiagnoseSymptomOutputSchema,
  FindRelatedAutopsyInputSchema,
  FindRelatedAutopsyOutputSchema,
  GetConceptInternalsInputSchema,
  GetConceptInternalsOutputSchema,
  checkPatternObsolescence,
  diagnoseSymptom,
  findRelatedAutopsy,
  getConceptInternals,
} from './tools.js';

export const MCP_SERVER_NAME = '@frontend-rocks/mcp';
export const MCP_SERVER_VERSION = '1.0.0';

export interface CreateFrontendRocksMcpServerOptions extends FrontendRocksDataSourceOptions {
  dataSource?: FrontendRocksDataSource;
}

export interface CreateFrontendRocksMcpServerResult {
  server: McpServer;
  dataSource: FrontendRocksDataSource;
}

export function createFrontendRocksMcpServer(
  options: CreateFrontendRocksMcpServerOptions = {}
): CreateFrontendRocksMcpServerResult {
  const dataSource = options.dataSource ?? new FrontendRocksDataSource(options);

  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  server.registerTool(
    'diagnose_symptom',
    {
      title: 'Diagnose Production Symptom',
      description:
        'Diagnose a frontend production bug, browser anomaly, or DevTools error by querying frontend.rocks audit rules and knowledge graph. Returns ranked root causes, probable causal chain concepts, canonical autopsy links, and interactive lab/simulator URLs.',
      inputSchema: DiagnoseSymptomInputSchema,
      outputSchema: DiagnoseSymptomOutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const result = await diagnoseSymptom(dataSource, args);
      return {
        structuredContent: result,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    'get_concept_internals',
    {
      title: 'Get Browser Concept Internals',
      description:
        'Fetch the full canonical Markdown technical reference for a frontend.rocks concept along with its immediate knowledge-graph neighbors (requires, required_by, replaces, replaced_by, contrasts_with, under_the_hood).',
      inputSchema: GetConceptInternalsInputSchema,
      outputSchema: GetConceptInternalsOutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const result = await getConceptInternals(dataSource, args);
      return {
        structuredContent: result,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    'check_pattern_obsolescence',
    {
      title: 'Check Pattern or API Obsolescence',
      description:
        'Evaluate whether a frontend pattern, legacy workaround, or Web Platform API is superseded by native Baseline primitives, returning maturity status, replacement primitives, and canonical /vs/ comparison links.',
      inputSchema: CheckPatternObsolescenceInputSchema,
      outputSchema: CheckPatternObsolescenceOutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const result = await checkPatternObsolescence(dataSource, args);
      return {
        structuredContent: result,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    'find_related_autopsy',
    {
      title: 'Find Related Architecture Autopsy',
      description:
        'Find frontend.rocks Architecture Autopsies matching a concept ID, failure mode, or bug keyword, returning structured CaseFile summaries (trigger, root_cause, bad_fixes, fix, how_to_spot, canonical_url).',
      inputSchema: FindRelatedAutopsyInputSchema,
      outputSchema: FindRelatedAutopsyOutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const result = await findRelatedAutopsy(dataSource, args);
      return {
        structuredContent: result,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  return { server, dataSource };
}

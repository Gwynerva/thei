import type {
  CallToolResult,
  McpServer,
  ToolAnnotations,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { McpCallContext } from './context';
import { mayEdit } from './scope';
import { registerChangesTool } from './tools/changes';
import { registerCheckTools } from './tools/checks';
import { registerDigestTools } from './tools/digests';
import { registerFileTools } from './tools/files';
import { registerLibraryTools } from './tools/library';
import { registerLinkTools } from './tools/links';
import { registerListTool } from './tools/list';
import { registerMemoryTool } from './tools/memory';
import { registerOverviewTool } from './tools/overview';
import { registerReadTool } from './tools/read';
import { registerSearchTool } from './tools/search';
import { registerSessionTools } from './tools/sessions';
import { registerTagCandidatesTool } from './tools/tag-candidates';
import { registerTimelineTool } from './tools/timeline';

/**
 * The site's tools, in one list: what an MCP client is offered over the
 * network, and what Thei's own model calls in the process — the same tools,
 * the same scopes, the same refusals, without a round of JSON-RPC between.
 */

/** Registers every tool a context's scopes allow on `server`. */
export function registerTheiTools(server: McpServer, context: McpCallContext) {
  registerOverviewTool(server, context);
  registerSearchTool(server, context);
  registerListTool(server, context);
  registerReadTool(server, context);
  registerChangesTool(server, context);
  registerDigestTools(server, context);
  registerMemoryTool(server, context);
  registerTimelineTool(server, context);
  registerTagCandidatesTool(server, context);
  registerLinkTools(server, context);
  registerLibraryTools(server, context);
  registerSessionTools(server, context);
  registerCheckTools(server, context);
  if (mayEdit(context.principal.scopes)) registerFileTools(server, context);
}

/** A tool as Thei's own model calls it. */
export interface DirectTool {
  name: string;
  description: string;
  /** Its arguments as JSON Schema, for the model's service. */
  inputSchema: Record<string, unknown>;
  annotations?: ToolAnnotations;
  /**
   * Checks the arguments as the MCP server would, then runs it. A tool that
   * can stop midway listens to `signal`, as it does to a client's.
   */
  call(
    args: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<CallToolResult>;
}

type Callback = (
  ...args: unknown[]
) => CallToolResult | Promise<CallToolResult>;

/** The tools a context may call, ready to be called in the process. */
export function directTools(context: McpCallContext): DirectTool[] {
  const tools: DirectTool[] = [];
  const collector = {
    registerTool(
      name: string,
      config: {
        description?: string;
        inputSchema?: z.ZodType;
        annotations?: ToolAnnotations;
      },
      callback: Callback,
    ) {
      const schema = config.inputSchema;
      const { $schema: _schema, ...json } = schema
        ? (z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>)
        : { type: 'object', properties: {} };
      tools.push({
        name,
        description: config.description ?? '',
        inputSchema: json,
        annotations: config.annotations,
        async call(args, { signal = new AbortController().signal } = {}) {
          // A tool hears it was stopped where it hears a client cancel.
          const extra = { mcpReq: { signal } };
          if (!schema) return callback(extra);
          const parsed = schema.safeParse(args ?? {});
          if (!parsed.success)
            return {
              content: [
                {
                  type: 'text',
                  text: `The arguments do not fit ${name}: ${parsed.error.issues
                    .map((issue) =>
                      issue.path.length
                        ? `${issue.path.map(String).join('.')}: ${issue.message}`
                        : issue.message,
                    )
                    .join('; ')}`,
                },
              ],
              isError: true,
            };
          return callback(parsed.data, extra);
        },
      });
    },
  };
  registerTheiTools(collector as unknown as McpServer, context);
  return tools;
}

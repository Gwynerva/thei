import type {
  CallToolResult,
  McpServer,
  ToolAnnotations,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import { lostLettersProblem } from '../lost-letters';
import { zodProblem } from '../ai/refusals';
import type { McpCallContext } from './context';
import { toolError } from './result';
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

/**
 * The server as tools register on it, with every call's arguments read
 * first: text that lost its letters to an encoding on the way is sent back
 * before any tool keeps it — a title, a digest, a memory, a proposal.
 */
function wholeTextOnly(server: McpServer): McpServer {
  const registerTool = server.registerTool.bind(server) as (
    name: string,
    config: { inputSchema?: unknown },
    callback: Callback,
  ) => unknown;
  return Object.assign(Object.create(server) as McpServer, {
    registerTool(
      name: string,
      config: { inputSchema?: unknown },
      callback: Callback,
    ) {
      return registerTool(
        name,
        config,
        config.inputSchema
          ? (args: unknown, ...rest: unknown[]) => {
              const problem = lostLettersProblem(args);
              return problem ? toolError(problem) : callback(args, ...rest);
            }
          : callback,
      );
    },
  });
}

/** Registers every tool a context's scopes allow on `server`. */
export function registerTheiTools(
  registerOn: McpServer,
  context: McpCallContext,
) {
  const server = wholeTextOnly(registerOn);
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

/**
 * Tools only an app has a use for: an address it fetches itself. Thei's own
 * model, working in a session, has no means to, and is not offered them.
 */
const APP_ONLY_TOOLS = new Set(['download_file']);

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
      if (context.session && APP_ONLY_TOOLS.has(name)) return;
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
                  text: `The arguments do not fit ${name}: ${zodProblem(parsed.error)}`,
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

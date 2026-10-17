import { siteOrigin } from '../site-url';
import type { McpCallContext } from './context';
import { serveMcp } from './handler';

/**
 * A client of the site's own MCP server called in the process rather than
 * over the network — the connection check and Thei's own model — so they
 * reach it exactly as any client does: the same tools, the same scopes, the
 * same refusals.
 */

const PROTOCOL = '2026-07-28';

interface McpAnswer {
  result?: Record<string, any>;
  error?: { message?: string };
}

/** A JSON-RPC answer, plain or as the single event of a stream. */
async function answerOf(response: Response): Promise<McpAnswer | undefined> {
  const text = await response.text();
  const data = text.trim().startsWith('{')
    ? text
    : text
        .split('\n')
        .find((line) => line.startsWith('data:'))
        ?.slice(5);
  return data ? (JSON.parse(data) as McpAnswer) : undefined;
}

/**
 * Calls the server as `client` with the context's token. The 2026 protocol
 * by default; `legacy` sends the request as a 2025 client would, without the
 * metadata that names it.
 */
export function inProcessMcp(context: McpCallContext, client: string) {
  const url = `${siteOrigin(context.event)}/api/mcp`;
  return async (
    method: string,
    params: Record<string, unknown> = {},
    legacy = false,
  ): Promise<McpAnswer | undefined> => {
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method,
      params: legacy
        ? params
        : {
            ...params,
            _meta: {
              'io.modelcontextprotocol/protocolVersion': PROTOCOL,
              'io.modelcontextprotocol/clientInfo': {
                name: client,
                version: '1',
              },
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
    };
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    if (!legacy) {
      headers['mcp-protocol-version'] = PROTOCOL;
      headers['mcp-method'] = method;
      if (typeof params.name === 'string') headers['mcp-name'] = params.name;
    }
    const response = await serveMcp(
      new Request(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
      context,
      body,
    );
    return answerOf(response);
  };
}

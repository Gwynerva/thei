import { createMcpHandler } from '@modelcontextprotocol/server';
import type { McpCallContext } from './context';
import { createTheiMcpServer } from './server';

/**
 * The one MCP handler of the site. Each request brings its own context — the
 * token it was checked with — and gets a server with the tools that token
 * allows.
 */
const handler = createMcpHandler(
  (request) => {
    const context = request.authInfo?.extra?.context as
      McpCallContext | undefined;
    if (!context)
      throw new Error('An MCP request reached the server unchecked');
    return createTheiMcpServer(context);
  },
  {
    onerror: (error) =>
      THEI_SERVER.console.error('[MCP]', error.message ?? error),
  },
);

/** Serves one checked request; `parsedBody` when the body was read already. */
export function serveMcp(
  request: Request,
  context: McpCallContext,
  parsedBody?: unknown,
): Promise<Response> {
  return handler.fetch(request, {
    authInfo: {
      token: '',
      clientId: context.principal.tokenUuid,
      scopes: context.principal.scopes,
      extra: { context },
    },
    ...(parsedBody === undefined ? {} : { parsedBody }),
  });
}

/**
 * The client a request comes from, as it introduces itself: in the handshake
 * of the 2025 protocol, or in every request of the 2026 one.
 */
export function mcpClientOf(body: unknown): string | undefined {
  const message = (Array.isArray(body) ? body[0] : body) as
    { method?: unknown; params?: Record<string, any> } | undefined;
  const info =
    message?.method === 'initialize'
      ? message.params?.clientInfo
      : message?.params?._meta?.['io.modelcontextprotocol/clientInfo'];
  if (!info || typeof info.name !== 'string') return undefined;
  const version = typeof info.version === 'string' ? ` ${info.version}` : '';
  return `${info.name}${version}`.slice(0, 100);
}

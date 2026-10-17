import { McpServer } from '@modelcontextprotocol/server';
import { siteUrl } from '../site-url';
import type { McpCallContext } from './context';
import { MCP_INSTRUCTIONS } from './instructions';
import { registerTheiTools } from './registry';

/** What some clients keep of the instructions, with room to spare. */
const INSTRUCTIONS_ROOM = 4000;

/**
 * The site's instructions, then the owner's own: how they write, what every
 * client should mind. A client reads them before its first call. When the
 * owner's are too long to fit where some clients cut them, they are left to
 * site_overview, which always holds them, and the model is sent there.
 */
export function withOwnerInstructions(base: string): string {
  const own = THEI_SERVER.config.mcp.instructions.trim();
  if (!own) return base;
  const joined = `${base}\n\nThe owner's own instructions to you:\n${own}`;
  return joined.length <= INSTRUCTIONS_ROOM
    ? joined
    : `${base}\n\nThe owner has instructions for you, too long to give here: read them in site_overview before anything else.`;
}

/**
 * The MCP server for one request: the tools this token's scopes allow, and
 * nothing it may not call, so a client never offers its model a tool that
 * would only be refused.
 */
export function createTheiMcpServer(context: McpCallContext): McpServer {
  // A client shows the site by its own icon and address, the one its owner
  // knows it by.
  const server = new McpServer(
    {
      name: 'thei',
      title: 'Thei',
      version: THEI_SERVER.version,
      websiteUrl: siteUrl(context.event, '/'),
      icons: [
        {
          src: siteUrl(context.event, '/apple-touch-icon.png'),
          mimeType: 'image/png',
          sizes: ['180x180'],
        },
      ],
    },
    { instructions: withOwnerInstructions(MCP_INSTRUCTIONS) },
  );
  registerTheiTools(server, context);
  return server;
}

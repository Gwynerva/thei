import type { H3Event } from 'h3';
import type { ApiTokenPrincipal } from '../api-tokens';

/**
 * What one MCP request runs with: the HTTP request it came in on, for
 * addresses and for marking a write, and the token it carries.
 */
export interface McpCallContext {
  event: H3Event;
  principal: ApiTokenPrincipal;
  /** The app's own name for itself, when it gave one. */
  client?: string;
  /**
   * The session a call belongs to: Thei's own model works in one, and what
   * it proposes lands there, under the message it is writing.
   */
  session?: { sessionUuid: string; messageUuid?: string };
}

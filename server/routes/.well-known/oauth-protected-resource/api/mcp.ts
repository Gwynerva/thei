import {
  answeredPreflight,
  discoveryAnswer,
  requireOAuth,
} from '../../../../thei/oauth/http';
import { protectedResourceMetadata } from '../../../../thei/oauth/metadata';

/**
 * The MCP endpoint's own description (RFC 9728): the address every refusal
 * of `/api/mcp` points an app to.
 */
export default defineEventHandler((event) => {
  requireOAuth(event);
  if (answeredPreflight(event)) return null;
  return discoveryAnswer(event, protectedResourceMetadata(event));
});

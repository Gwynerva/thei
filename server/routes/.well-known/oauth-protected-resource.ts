import {
  answeredPreflight,
  discoveryAnswer,
  requireOAuth,
} from '../../thei/oauth/http';
import { protectedResourceMetadata } from '../../thei/oauth/metadata';

/**
 * Where the MCP endpoint says which server an app signs in at (RFC 9728),
 * for an app that looks at the host's root.
 */
export default defineEventHandler((event) => {
  requireOAuth(event);
  if (answeredPreflight(event)) return null;
  return discoveryAnswer(event, protectedResourceMetadata(event));
});

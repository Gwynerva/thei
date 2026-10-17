import {
  answeredPreflight,
  discoveryAnswer,
  requireOAuth,
} from '../../thei/oauth/http';
import { authorizationServerMetadata } from '../../thei/oauth/metadata';

/**
 * How an app signs in at the site (RFC 8414). A site in a subfolder is
 * asked for this at the host's root with its path after it; the owner's
 * proxy sends that here (see `docs/mcp.md`).
 */
export default defineEventHandler((event) => {
  requireOAuth(event);
  if (answeredPreflight(event)) return null;
  return discoveryAnswer(event, authorizationServerMetadata(event));
});

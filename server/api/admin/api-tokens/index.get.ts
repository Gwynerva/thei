import type { ApiTokenListResponse } from '#layers/thei/shared/api-token';
import { listApiTokens } from '../../../thei/api-tokens';
import { mcpResource, oauthAvailable } from '../../../thei/oauth/base';
import { siteBasePath } from '../../../thei/site-url';

/**
 * The access keys and connections, with what the page needs to tell an app
 * how to connect: the address, whether it may sign in, and — for a site in
 * a subfolder — the one rule the owner's proxy needs for that.
 */
export default defineEventHandler((event): ApiTokenListResponse => {
  const base = siteBasePath().replace(/\/$/, '');
  return {
    enabled: THEI_SERVER.config.mcp.enabled,
    tokens: listApiTokens(),
    connect: {
      endpoint: mcpResource(event),
      signIn: oauthAvailable(event),
      ...(base
        ? {
            proxyRule: {
              from: `/.well-known/oauth-authorization-server${base}`,
              to: `${base}/.well-known/oauth-authorization-server`,
            },
          }
        : {}),
    },
  };
});

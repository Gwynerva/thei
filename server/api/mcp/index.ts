import {
  authenticateMcpRequest,
  isApiTokenFailureLimited,
  recordApiTokenClient,
  recordApiTokenFailure,
  spendApiTokenBudget,
  touchApiToken,
} from '../../thei/api-tokens';
import type { McpCallContext } from '../../thei/mcp/context';
import { mcpClientOf, serveMcp } from '../../thei/mcp/handler';
import { markReadOnlyRequest } from '../../thei/read-only-request';
import { readLimitedText } from '../../thei/request';
import { siteOrigin } from '../../thei/site-url';
import {
  mcpResource,
  oauthAvailable,
  resourceMetadataUrl,
} from '../../thei/oauth/base';

/** Large enough for a long text with every block, small enough to refuse junk. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** A body that is no JSON-RPC message at all, answered as JSON-RPC says. */
const PARSE_ERROR = {
  jsonrpc: '2.0',
  id: null,
  error: { code: -32700, message: 'Parse error: the body is no JSON.' },
};

/**
 * The MCP endpoint: an AI client's way in, with a token instead of a session.
 *
 * Every call reads unless a tool says it wrote: reading never drops the
 * indexes built over the content.
 */
export default defineEventHandler(async (event) => {
  markReadOnlyRequest(event);

  // Turned off, there is no endpoint at all — not even one that says no.
  if (!THEI_SERVER.config.mcp.enabled) throw createError({ statusCode: 404 });

  const auth = authenticateMcpRequest(event, mcpResource(event));
  if ('refused' in auth) {
    // A token is far too long to guess, so a right one is never held up.
    // Only wrong ones are slowed down — a misconfigured client hammering the
    // site, not a guesser. A request with no token at all is a client
    // finding out how to connect, and is answered every time.
    if (auth.refused === 'unknown') {
      if (isApiTokenFailureLimited(event))
        throw createError({
          statusCode: 429,
          statusMessage: 'Too Many Requests',
        });
      recordApiTokenFailure(event);
    }
    // Where to sign in, for an app that can (RFC 9728): with no key, the
    // challenge alone; with a key that does not open, why (RFC 6750).
    const challenge = [
      'Bearer realm="thei"',
      ...(auth.refused === 'missing' ? [] : ['error="invalid_token"']),
      ...(oauthAvailable(event)
        ? [`resource_metadata="${resourceMetadataUrl(event)}"`]
        : []),
    ].join(', ');
    setResponseHeader(event, 'WWW-Authenticate', challenge);
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }
  const { principal } = auth;

  // A browser page on another site must not drive the owner's token.
  const origin = getRequestHeader(event, 'origin');
  if (origin && origin !== siteOrigin(event))
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' });

  const wait = spendApiTokenBudget(principal.tokenUuid, 'call');
  if (wait) {
    setResponseHeader(event, 'Retry-After', wait);
    throw createError({ statusCode: 429, statusMessage: 'Too Many Requests' });
  }

  // Read here once: it names the client, which the owner sees by the token.
  let body: unknown;
  if (event.method === 'POST') {
    const text = await readLimitedText(event, MAX_BODY_BYTES);
    if (text === undefined)
      throw createError({
        statusCode: 413,
        statusMessage: 'Payload Too Large',
      });
    // An empty body too: handed on, the server would wait for one forever.
    try {
      body = JSON.parse(text);
    } catch {
      setResponseStatus(event, 400);
      return PARSE_ERROR;
    }
  }
  touchApiToken(principal.tokenUuid);
  const client = mcpClientOf(body);
  if (client) recordApiTokenClient(principal.tokenUuid, client);

  const context: McpCallContext = { event, principal, client };
  return sendWebResponse(
    event,
    await serveMcp(toWebRequest(event), context, body),
  );
});

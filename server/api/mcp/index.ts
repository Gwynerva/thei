import type { H3Event } from 'h3';
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
import { siteOrigin } from '../../thei/site-url';
import {
  mcpResource,
  oauthAvailable,
  resourceMetadataUrl,
} from '../../thei/oauth/base';

/** Large enough for a long text with every block, small enough to refuse junk. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * The body as JSON, read no further than the limit: a chunked request that
 * names no length is cut off as soon as it passes it.
 */
async function readLimitedJson(event: H3Event): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of event.node.req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES)
      throw createError({
        statusCode: 413,
        statusMessage: 'Payload Too Large',
      });
    chunks.push(chunk as Buffer);
  }
  if (!size) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' });
  }
}

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

  const length = Number(getRequestHeader(event, 'content-length') ?? 0);
  if (length > MAX_BODY_BYTES)
    throw createError({ statusCode: 413, statusMessage: 'Payload Too Large' });

  const wait = spendApiTokenBudget(principal.tokenUuid, 'call');
  if (wait) {
    setResponseHeader(event, 'Retry-After', wait);
    throw createError({ statusCode: 429, statusMessage: 'Too Many Requests' });
  }

  // Read here once: it names the client, which the owner sees by the token.
  const body =
    event.method === 'POST' ? await readLimitedJson(event) : undefined;
  touchApiToken(principal.tokenUuid);
  const client = mcpClientOf(body);
  if (client) recordApiTokenClient(principal.tokenUuid, client);

  const context: McpCallContext = { event, principal, client };
  return sendWebResponse(
    event,
    await serveMcp(toWebRequest(event), context, body),
  );
});

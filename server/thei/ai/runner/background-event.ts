import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { createEvent, getRequestURL, type H3Event } from 'h3';

/**
 * Where the owner last reached the site from, for a site with no address
 * of its own: the addresses a turn's tools write point there.
 */
let heardOrigin: string | undefined;

/** Remembers where the owner's request came from: called as one asks for a turn. */
export function rememberOrigin(event: H3Event) {
  heardOrigin = getRequestURL(event).origin;
}

/**
 * Where the site answers when nobody said: the port this process listens
 * on, as the installer and the dev server give it, on this computer.
 */
function listeningOrigin(): string {
  const port = process.env.NITRO_PORT || process.env.PORT || '3000';
  return `http://localhost:${port}`;
}

/**
 * A request that came from nowhere: a turn runs outside any visit. It comes
 * to the site's own address, else to the one the owner was last heard on,
 * else to where this process listens.
 */
export function backgroundEvent(): H3Event {
  const origin = new URL(
    THEI_SERVER.config.siteUrl || heardOrigin || listeningOrigin(),
  );
  const request = new IncomingMessage(new Socket());
  request.method = 'POST';
  request.url = '/api/mcp';
  request.headers = { host: origin.host };
  // A site behind a proxy is reached over HTTPS: said as a proxy says it.
  if (origin.protocol === 'https:')
    request.headers['x-forwarded-proto'] = 'https';
  return createEvent(request, new ServerResponse(request));
}

import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { createEvent, type H3Event } from 'h3';

/** A request that came from nowhere: a turn runs outside any visit. */
export function backgroundEvent(): H3Event {
  const request = new IncomingMessage(new Socket());
  request.method = 'POST';
  request.url = '/api/mcp';
  const configured = THEI_SERVER.config.siteUrl;
  request.headers = {
    host: configured ? new URL(configured).host : 'localhost',
  };
  return createEvent(request, new ServerResponse(request));
}

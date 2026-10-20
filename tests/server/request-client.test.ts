import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createApp,
  createRouter,
  defineEventHandler,
  fetchWithEvent,
  toNodeListener,
} from 'h3';
import { fetchNodeRequestHandler } from 'node-mock-http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  rememberRequestClient,
  requestClient,
  type RequestClient,
} from '../../server/thei/request';

/**
 * A page rendered on the server fetches the API as Nitro does, through
 * `node-mock-http`: no socket address, the page's context as `__unenv__`.
 * Played here on the real carrier, so a change of it in Nitro fails loudly
 * rather than turning every visitor into one.
 */
let server: Server;
let base: string;

beforeAll(async () => {
  const app = createApp({ onRequest: rememberRequestClient });
  const router = createRouter();
  const handler = toNodeListener(app);
  router.get(
    '/inner',
    defineEventHandler((event) => requestClient(event)),
  );
  router.get(
    '/page',
    defineEventHandler(async (event) => {
      const response = await fetchWithEvent(
        event,
        '/inner',
        // A forged header rides along: it must not be believed.
        { headers: { 'x-real-ip': '198.51.100.66' } },
        {
          fetch: ((input: string, init: RequestInit) =>
            fetchNodeRequestHandler(
              handler,
              input,
              init as never,
            )) as typeof fetch,
        },
      );
      return {
        page: requestClient(event),
        inner: (await response.json()) as RequestClient,
      };
    }),
  );
  app.use(router);
  server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('a request a page makes on the real carrier', () => {
  it('stands for the page’s visitor, whatever it says', async () => {
    const read = async (address: string) =>
      (await (
        await fetch(`${base}/page`, { headers: { 'x-real-ip': address } })
      ).json()) as { page: RequestClient; inner: RequestClient };
    expect(await read('203.0.113.7')).toEqual({
      page: { address: '203.0.113.7', rendering: false },
      inner: { address: '203.0.113.7', rendering: true },
    });
    // Two visitors, two addresses: renders never share one.
    expect((await read('203.0.113.8')).inner.address).toBe('203.0.113.8');
  });
});

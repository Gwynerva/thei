import type { H3Event } from 'h3';
import { describe, expect, it } from 'vitest';
import {
  getRequestIp,
  isPrivateIp,
  rememberRequestClient,
  requestClient,
} from '../../server/thei/request';

/**
 * The address every limit per address counts by. A client writes whatever
 * it likes into `X-Forwarded-For`; only the proxy in front of the site, on
 * the same computer, is believed — and only for what it adds itself.
 */
function request(peer: string, headers: Record<string, string> = {}) {
  return {
    node: { req: { headers, socket: { remoteAddress: peer } } },
    context: {},
  } as unknown as H3Event;
}

describe('the address of a request', () => {
  it('is the connection’s own when it comes from outside', () => {
    expect(
      getRequestIp(
        request('203.0.113.7', {
          'x-forwarded-for': '198.51.100.1',
          'x-real-ip': '198.51.100.2',
        }),
      ),
    ).toBe('203.0.113.7');
  });

  it('is the one the proxy on this computer names', () => {
    expect(
      getRequestIp(
        request('127.0.0.1', {
          'x-real-ip': '203.0.113.7',
          'x-forwarded-for': '198.51.100.1, 203.0.113.7',
        }),
      ),
    ).toBe('203.0.113.7');
    expect(
      getRequestIp(request('::ffff:127.0.0.1', { 'x-real-ip': '203.0.113.7' })),
    ).toBe('203.0.113.7');
  });

  it('takes the hop the proxy added, never the ones a client wrote', () => {
    expect(
      getRequestIp(
        request('::1', { 'x-forwarded-for': '198.51.100.1, 203.0.113.7' }),
      ),
    ).toBe('203.0.113.7');
    expect(getRequestIp(request('127.0.0.1'))).toBe('127.0.0.1');
  });
});

describe('a request a page makes while it is rendered', () => {
  const internal = (
    page: { theiClient?: { address: string | undefined } } | undefined,
    headers: Record<string, string> = {},
  ) =>
    ({
      node: {
        req: { headers, socket: { remoteAddress: '' }, __unenv__: page },
      },
      context: {},
    }) as unknown as H3Event;

  it('stands for the page’s own visitor', () => {
    expect(
      requestClient(internal({ theiClient: { address: '203.0.113.7' } })),
    ).toEqual({ address: '203.0.113.7', rendering: true });
  });

  it('believes no header, none of which came from the network', () => {
    const forged = internal(
      { theiClient: { address: '203.0.113.7' } },
      { 'x-real-ip': '198.51.100.1', 'x-forwarded-for': '198.51.100.2' },
    );
    expect(getRequestIp(forged)).toBe('203.0.113.7');
    // Fetched with no page behind it: nobody, never a header's word.
    expect(
      getRequestIp(internal(undefined, { 'x-real-ip': '198.51.100.1' })),
    ).toBeUndefined();
  });

  it('is told the visitor before it runs, by the page’s own request', () => {
    const page = request('127.0.0.1', { 'x-real-ip': '203.0.113.7' });
    rememberRequestClient(page);
    expect(page.context).toMatchObject({
      theiClient: { address: '203.0.113.7' },
    });
    // An internal request keeps the page's.
    const inner = internal({ theiClient: { address: '203.0.113.7' } });
    rememberRequestClient(inner);
    expect(inner.context).toEqual({});
  });
});

describe('a private address', () => {
  it('is any of a private or local network, IPv4 and IPv6', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.0.5',
      '172.20.0.2',
      '172.31.255.1',
      '169.254.1.1',
      '100.64.0.1',
      '::ffff:10.0.0.1',
      '::1',
      'fd12:3456::1',
      'fe80::1',
    ])
      expect(isPrivateIp(ip), ip).toBe(true);
  });

  it('is never a public one', () => {
    for (const ip of ['172.32.0.1', '8.8.8.8', '2001:db8::1', '100.128.0.1'])
      expect(isPrivateIp(ip), ip).toBe(false);
  });
});

import type { H3Event } from 'h3';
import { describe, expect, it } from 'vitest';
import { getRequestIp, isPrivateIp } from '../../server/thei/request';

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

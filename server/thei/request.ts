import { getRequestHeader, type H3Event } from 'h3';
import { UAParser } from 'ua-parser-js';

const locationCache = new Map<string, { country?: string; city?: string }>();

/**
 * An address of this computer or of a private network: one no service
 * outside could place on a map, so it is never sent to one.
 */
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const [a, b] = v4.split('.').map(Number);
  if (v4.includes('.'))
    return (
      a === 127 ||
      a === 10 ||
      (a === 192 && b === 168) ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 169 && b === 254) ||
      (a === 100 && b! >= 64 && b! <= 127)
    );
  // IPv6: loopback, unique local (fc00::/7) and link-local (fe80::/10).
  const lower = ip.toLowerCase();
  return lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
}

/** Whether an address is this computer's own, IPv4 or IPv6. */
function isLoopbackIp(ip: string): boolean {
  return ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.');
}

/**
 * The address a request comes from, as far as it can be trusted: what every
 * limit per address counts by. A proxy on this computer — the nginx of
 * `update/instance/nginx.conf.example` — names the address it took the
 * request from in `X-Real-IP`, and adds it as the last hop of
 * `X-Forwarded-For`; the hops before it are whatever the client wrote. Any
 * other request is known by the address of its connection, which no header
 * a client sends can move.
 */
export function getRequestIp(event: H3Event): string | undefined {
  const peer: string | undefined =
    event.context?.clientAddress ?? event.node.req.socket?.remoteAddress;
  if (!peer || !isLoopbackIp(peer)) return peer;
  const real = getRequestHeader(event, 'x-real-ip')?.trim();
  if (real) return real;
  const last = getRequestHeader(event, 'x-forwarded-for')
    ?.split(',')
    .pop()
    ?.trim();
  return last || peer;
}

/**
 * The body as text, read no further than `max` bytes; undefined past it.
 * A request that names a larger length is not read at all, and a chunked
 * one that names none is cut off as soon as it passes the limit.
 */
export async function readLimitedText(
  event: H3Event,
  max: number,
): Promise<string | undefined> {
  if (Number(getRequestHeader(event, 'content-length') ?? 0) > max)
    return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of event.node.req) {
    size += (chunk as Buffer).length;
    if (size > max) return undefined;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export interface RequestMeta {
  country?: string;
  city?: string;
  device?: string;
  deviceVendor?: string;
  os?: string;
  browser?: string;
}

export async function getRequestMeta(args: {
  ip?: string;
  ua?: string;
}): Promise<RequestMeta> {
  const ip = args.ip;
  const ua = args.ua;
  const meta: RequestMeta = {};

  try {
    const uaParser = new UAParser(ua || '');
    meta.device = uaParser.getDevice().type;
    meta.deviceVendor = uaParser.getDevice().vendor;
    meta.os = uaParser.getOS().name;
    meta.browser = uaParser.getBrowser().name;

    if (ip && !isPrivateIp(ip)) {
      if (locationCache.has(ip)) {
        const cached = locationCache.get(ip);
        if (cached) {
          meta.country = cached.country;
          meta.city = cached.city;
        }
      } else {
        const response = await fetch(`https://ipwho.is/${ip}`, {
          signal: AbortSignal.timeout(3000),
        });

        if (response.ok) {
          const data = await response.json();
          meta.country = data.country;
          meta.city = data.city;
          locationCache.set(ip, {
            country: data.country,
            city: data.city,
          });
        }
      }
    }
  } catch {
    // Ignore errors and return whatever meta we could gather
  }

  return meta;
}

/**
 * The request path every access check must be made against.
 *
 * `event.node.req.url` is the raw request target, while the router dispatches
 * on the decoded `event.path`. h3 keeps the two apart whenever they differ, so
 * a check written against the raw URL sees `/api/%61dmin/settings` while the
 * handler that runs is the one registered at `/api/admin/settings`.
 */
export function getRequestPath(event: H3Event): string {
  return (event.path || '/').split('?')[0] || '/';
}

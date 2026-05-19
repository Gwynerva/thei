import { H3Event } from 'h3';
import { UAParser } from 'ua-parser-js';

const locationCache = new Map<string, { country?: string; city?: string }>();

export function isPrivateIp(ip: string): boolean {
  const prefixes = ['127.', '10.', '192.168.', '172.16.', '::1'];
  return prefixes.some((prefix) => ip.startsWith(prefix));
}

export function getRequestIp(event: H3Event) {
  return getRequestIP(event, { xForwardedFor: true });
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

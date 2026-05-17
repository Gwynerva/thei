import { UAParser } from 'ua-parser-js';

export function isPrivateIp(ip: string): boolean {
  const prefixes = ['127.', '10.', '192.168.', '172.16.', '::1'];
  return prefixes.some((prefix) => ip.startsWith(prefix));
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
      const response = await fetch(`https://ipapi.co/${ip}/json/`, {
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        const data = await response.json();
        meta.country = data.country_name;
        meta.city = data.city;
      }
    }
  } catch {
    // Ignore errors and return whatever meta we could gather
  }

  return meta;
}

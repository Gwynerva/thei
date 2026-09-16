import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { H3Event } from 'h3';
import { describe, expect, it } from 'vitest';
import { getRequestPath } from '../../server/thei/request';
import { isAdminRequestPath } from '../../shared/public-view';

const root = resolve(import.meta.dirname, '../..');

/**
 * h3 decodes the request target before matching a route but leaves
 * `node.req.url` raw, so the two disagree for an encoded path. An access check
 * written against the raw target would let `/api/%61dmin/settings` through to
 * the handler registered at `/api/admin/settings`.
 */
function requestEvent(decodedPath: string, rawUrl: string): H3Event {
  return { path: decodedPath, node: { req: { url: rawUrl } } } as H3Event;
}

describe('request path', () => {
  it.each([
    ['/api/admin/settings', '/api/admin/settings'],
    ['/api/admin/settings?tab=1', '/api/admin/settings'],
    ['/', '/'],
  ])('reads the routed path %s', (path, expected) => {
    expect(getRequestPath(requestEvent(path, path))).toBe(expected);
  });

  it.each([
    ['/api/%61dmin/settings', '/api/admin/settings'],
    ['/%61pi/admin/settings', '/api/admin/settings'],
    ['/%61dmin/', '/admin/'],
  ])('classifies the encoded target %s as an admin request', (raw, decoded) => {
    const event = requestEvent(decoded, raw);
    expect(isAdminRequestPath(getRequestPath(event))).toBe(true);
    expect(isAdminRequestPath(raw)).toBe(false);
  });

  it('keeps access checks off the raw request target', () => {
    for (const file of typescriptFiles(resolve(root, 'server'))) {
      const code = readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
        .join('\n');
      expect(code, relative(root, file)).not.toMatch(/node\.req\.url/);
    }
  });
});

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isAdminRequestPath,
  publicViewGuestValue,
  resolveRequestAdminRole,
} from '../../shared/public-view';

const root = resolve(import.meta.dirname, '../..');

describe('public viewing role', () => {
  it.each([
    ['/admin/', true],
    ['/admin/projects/', true],
    ['/api/admin/projects', true],
    ['/projects/', false],
    ['/api/projects', false],
    ['/projects/example/content/file.pdf', false],
  ])('classifies %s as admin request=%s', (path, expected) => {
    expect(isAdminRequestPath(path)).toBe(expected);
  });

  it('uses the authenticated role when no guest mode is selected', () => {
    expect(
      resolveRequestAdminRole({
        isAuthenticatedAdmin: true,
        path: '/projects/',
      }),
    ).toBe(true);
  });

  it('downgrades an authenticated admin only on public requests', () => {
    expect(
      resolveRequestAdminRole({
        isAuthenticatedAdmin: true,
        path: '/projects/',
        publicViewCookie: publicViewGuestValue,
      }),
    ).toBe(false);
    expect(
      resolveRequestAdminRole({
        isAuthenticatedAdmin: true,
        path: '/api/admin/projects',
        publicViewCookie: publicViewGuestValue,
      }),
    ).toBe(true);
  });

  it('never grants access to a guest and ignores unknown cookie values', () => {
    expect(
      resolveRequestAdminRole({
        isAuthenticatedAdmin: false,
        path: '/api/admin/projects',
        publicViewCookie: 'admin',
      }),
    ).toBe(false);
    expect(
      resolveRequestAdminRole({
        isAuthenticatedAdmin: true,
        path: '/projects/',
        publicViewCookie: 'unexpected',
      }),
    ).toBe(true);
  });

  it('keeps real-session checks out of public route entry points', () => {
    const files = [
      ...typescriptFiles(resolve(root, 'server/api')).filter(
        (file) =>
          !relative(resolve(root, 'server/api'), file).startsWith('admin'),
      ),
      ...typescriptFiles(resolve(root, 'server/routes')),
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, relative(root, file)).not.toMatch(
        /getCurrentAdminSession|THEI_SERVER\.(?:getAdmin|isAuthenticatedAdmin)\s*\(/,
      );
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

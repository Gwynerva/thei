import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { freshTestDb } from '../helpers/fresh-db';
import {
  consumeSignInLink,
  createSignInLink,
  listSignInLinks,
  revokeSignInLink,
  signInLinkIsValid,
} from '../../server/thei/access-links/sign-in-links';
import {
  createShareLink,
  extendShareLink,
  listShareLinks,
  resolveShareToken,
  revokeShareLink,
  cleanupExpiredShareLinks,
} from '../../server/thei/access-links/share-links';
import { hashAccessToken } from '../../server/thei/access-links/token';

let context: Awaited<ReturnType<typeof freshTestDb>>;

const request = { node: { req: { headers: {}, socket: {} } } } as never;

beforeAll(async () => {
  // Nitro auto-imports these in the server bundle; here they are stubs, since
  // nothing under test depends on what a request reports about itself.
  vi.stubGlobal('getRequestIP', () => undefined);
  vi.stubGlobal('getHeader', () => undefined);
  vi.stubGlobal('createError', (options: { message?: string }) =>
    Object.assign(new Error(options.message ?? 'error'), options),
  );
  context = await freshTestDb();
  Object.assign(globalThis, {
    THEI_SERVER: {
      ...context.server,
      useDb: () => ({ db: context.db, schema: context.schema }),
    },
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await context.close();
});

describe('sign-in links', () => {
  it('works exactly once', async () => {
    const link = await createSignInLink(request);
    expect(link.token).toBeTruthy();
    expect(signInLinkIsValid(link.token!)).toBe(true);
    expect(consumeSignInLink(link.token!)).toBe(true);
    // The second attempt is what a copy of the link in a chat would do.
    expect(consumeSignInLink(link.token!)).toBe(false);
    expect(signInLinkIsValid(link.token!)).toBe(false);
  });

  it('stores only the hash, and can be revoked before use', async () => {
    const link = await createSignInLink(request);
    const rows = listSignInLinks();
    expect(rows.some((row) => row.tokenHash === link.tokenHash)).toBe(true);
    expect(rows.every((row) => !('token' in row))).toBe(true);
    expect(link.tokenHash).toBe(hashAccessToken(link.token!));

    expect(revokeSignInLink(link.tokenHash)).toBe(true);
    expect(consumeSignInLink(link.token!)).toBe(false);
  });

  it('refuses an expired link', async () => {
    const link = await createSignInLink(request);
    context.db.run(
      `UPDATE "sign-in-links" SET expiresAt = 1 WHERE tokenHash = '${link.tokenHash}'` as never,
    );
    expect(signInLinkIsValid(link.token!)).toBe(false);
    expect(consumeSignInLink(link.token!)).toBe(false);
  });
});

describe('share links', () => {
  it('opens exactly the entity it was made for', async () => {
    const link = await createShareLink('project', 'project-1', '1h');
    const resolved = resolveShareToken(link.token!);
    expect(resolved?.entityType).toBe('project');
    expect(resolved?.entityUuid).toBe('project-1');
    // Nothing in the stored row reveals the token itself.
    expect(listShareLinks('project', 'project-1')).toHaveLength(1);
    expect(listShareLinks('event', 'project-1')).toHaveLength(0);
  });

  it('extends from now and revokes at once', async () => {
    const link = await createShareLink('event', 'event-1', '30m');
    const before = link.expiresAt;
    const extended = extendShareLink(link.shareUuid, '24h');
    expect(extended!.expiresAt).toBeGreaterThan(before);

    expect(revokeShareLink(link.shareUuid)).toBe(true);
    expect(resolveShareToken(link.token!)).toBeUndefined();
    expect(listShareLinks('event', 'event-1')).toHaveLength(0);
  });

  it('forgets a link that has run out', async () => {
    const link = await createShareLink('project', 'project-2', '30m');
    context.db.run(
      `UPDATE "share-links" SET expiresAt = 1 WHERE shareUuid = '${link.shareUuid}'` as never,
    );
    expect(resolveShareToken(link.token!)).toBeUndefined();
    cleanupExpiredShareLinks();
    expect(listShareLinks('project', 'project-2')).toHaveLength(0);
  });
});

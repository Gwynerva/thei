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
  normalizeShareLinkLabel,
  resolveShareToken,
  revokeShareLink,
  cleanupExpiredShareLinks,
} from '../../server/thei/access-links/share-links';
import { SHARE_LINK_LABEL_MAX } from '../../shared/share-link';
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
    const resolved = resolveShareToken(link.token);
    expect(resolved?.entityType).toBe('project');
    expect(resolved?.entityUuid).toBe('project-1');
    // The token is kept, so the owner can copy the address again later.
    expect(listShareLinks('project', 'project-1')).toMatchObject([
      { token: link.token },
    ]);
    expect(listShareLinks('event', 'project-1')).toHaveLength(0);
    expect(resolveShareToken('x'.repeat(43))).toBeUndefined();
  });

  it('keeps who the link is for, as one short line', async () => {
    const link = await createShareLink(
      'page',
      'page-1',
      '1h',
      '  For\n  Anna\t ',
    );
    expect(link.label).toBe('For Anna');
    expect(listShareLinks('page', 'page-1')[0]!.label).toBe('For Anna');
    expect(normalizeShareLinkLabel('x'.repeat(200))).toHaveLength(
      SHARE_LINK_LABEL_MAX,
    );
    expect(normalizeShareLinkLabel(42)).toBe('');
  });

  it('extends by adding to what is left, and revokes at once', async () => {
    const link = await createShareLink('event', 'event-1', '30m');
    const extended = extendShareLink(link.shareUuid, '1h');
    // Half an hour left plus an hour — never counted from now alone.
    expect(extended!.expiresAt - link.expiresAt).toBeGreaterThanOrEqual(
      60 * 60 * 1000,
    );
    // The extension starts a new term, which the owner's countdown refills.
    expect(link.extendedAt).toBeNull();
    expect(extended!.extendedAt).toBeGreaterThanOrEqual(link.createdAt);
    expect(listShareLinks('event', 'event-1')[0]!.extendedAt).toBe(
      extended!.extendedAt,
    );

    expect(revokeShareLink(link.shareUuid)).toBe(true);
    expect(resolveShareToken(link.token)).toBeUndefined();
    expect(listShareLinks('event', 'event-1')).toHaveLength(0);
  });

  it('does not bring a closed link back', async () => {
    const link = await createShareLink('event', 'event-2', '30m');
    context.db.run(
      `UPDATE "share-links" SET expiresAt = 1 WHERE shareUuid = '${link.shareUuid}'` as never,
    );
    expect(extendShareLink(link.shareUuid, '24h')).toBeUndefined();
    expect(resolveShareToken(link.token)).toBeUndefined();
  });

  it('forgets a link that has run out', async () => {
    const link = await createShareLink('project', 'project-2', '30m');
    context.db.run(
      `UPDATE "share-links" SET expiresAt = 1 WHERE shareUuid = '${link.shareUuid}'` as never,
    );
    expect(resolveShareToken(link.token)).toBeUndefined();
    cleanupExpiredShareLinks();
    expect(listShareLinks('project', 'project-2')).toHaveLength(0);
  });
});

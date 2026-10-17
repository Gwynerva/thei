import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_TOKEN_LIMIT } from '../../shared/api-token';
import {
  apiTokenWaiting,
  authenticateMcpRequest,
  createApiToken,
  isApiTokenFailureLimited,
  listApiTokens,
  recordApiTokenFailure,
  revokeApiToken,
  spendApiTokenBudget,
  touchApiToken,
} from '../../server/thei/api-tokens';
import { freshTestDb } from '../helpers/fresh-db';

/**
 * A token is the only thing between an AI client and the owner's site: it
 * must open exactly while it exists, and nothing about it may be read back.
 */
let context: Awaited<ReturnType<typeof freshTestDb>>;

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, { useDb: () => context });
});

afterEach(async () => {
  await context.close();
});

function request(
  authorization?: string,
  address = '10.0.0.1',
  headers: Record<string, string> = {},
) {
  return {
    node: {
      req: {
        headers: { ...headers, ...(authorization ? { authorization } : {}) },
        socket: { remoteAddress: address },
      },
    },
    context: {},
  } as never;
}

describe('API tokens', () => {
  it('are shown once and kept only as a hash', async () => {
    const { token, item } = await createApiToken('Laptop', 'editor');
    expect(token).toMatch(/^thei_[A-Za-z0-9_-]{43}$/);
    expect(item.scopes).toEqual(['read', 'edit']);
    expect(listApiTokens()).toEqual([item]);
    const stored = context.rawDb
      .prepare('SELECT * FROM `api-tokens`')
      .all() as Record<string, unknown>[];
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('open the site while they exist, and not a moment after', async () => {
    const { token, item } = await createApiToken('Laptop', 'reader');
    expect(authenticateMcpRequest(request(`Bearer ${token}`))).toEqual({
      principal: {
        tokenUuid: item.tokenUuid,
        label: 'Laptop',
        scopes: ['read'],
      },
    });
    expect(authenticateMcpRequest(request(`bearer ${token}`))).toHaveProperty(
      'principal',
    );
    // A wrong token is a failure; none at all is a client finding its way.
    expect(authenticateMcpRequest(request(`Bearer ${token}x`))).toEqual({
      refused: 'unknown',
    });
    expect(authenticateMcpRequest(request(token))).toEqual({
      refused: 'missing',
    });
    expect(authenticateMcpRequest(request())).toEqual({ refused: 'missing' });

    expect(revokeApiToken(item.tokenUuid)).toBe(true);
    expect(authenticateMcpRequest(request(`Bearer ${token}`))).toEqual({
      refused: 'unknown',
    });
    expect(revokeApiToken(item.tokenUuid)).toBe(false);
  });

  it('note their last use at most once a minute', async () => {
    const { token, item } = await createApiToken('Laptop', 'reader');
    const lastUsed = () =>
      (
        context.rawDb
          .prepare('SELECT lastUsedAt FROM `api-tokens` WHERE tokenUuid = ?')
          .get(item.tokenUuid) as { lastUsedAt: number | null }
      ).lastUsedAt;
    expect(lastUsed()).toBeNull();
    touchApiToken(item.tokenUuid);
    const first = lastUsed();
    expect(first).toBeTypeOf('number');
    context.rawDb
      .prepare('UPDATE `api-tokens` SET lastUsedAt = ? WHERE tokenUuid = ?')
      .run(first! - 1000, item.tokenUuid);
    touchApiToken(item.tokenUuid);
    expect(lastUsed()).toBe(first! - 1000);
  });

  it('are limited in number', async () => {
    for (let index = 0; index < API_TOKEN_LIMIT; index++)
      await createApiToken(`Token ${index}`, 'reader');
    await expect(createApiToken('One more', 'reader')).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it('slow down a wrong guesser without slowing anyone else', () => {
    const guesser = request('Bearer nope', '10.0.0.7');
    expect(isApiTokenFailureLimited(guesser)).toBe(false);
    recordApiTokenFailure(guesser);
    expect(isApiTokenFailureLimited(guesser)).toBe(true);
    expect(isApiTokenFailureLimited(request(undefined, '10.0.0.8'))).toBe(
      false,
    );
  });

  it('slow a guesser down whatever address it claims to come from', () => {
    const claiming = (claim: string) =>
      request('Bearer nope', '10.0.0.9', { 'x-forwarded-for': claim });
    recordApiTokenFailure(claiming('198.51.100.1'));
    expect(isApiTokenFailureLimited(claiming('198.51.100.2'))).toBe(true);
  });

  it('count what waits in their sessions out of the archive', () => {
    const session = (
      sessionUuid: string,
      waiting: number,
      archivedAt: number | null = null,
    ) =>
      context.rawDb
        .prepare(
          "INSERT INTO `ai-sessions` (sessionUuid, origin, tokenUuid, waiting, archivedAt, createdAt, lastActiveAt) VALUES (?, 'app', 'tk-w', ?, ?, 1, 1)",
        )
        .run(sessionUuid, waiting, archivedAt);
    // More sessions than a page of the list holds.
    for (let index = 0; index < 60; index++) session(`as-${index}`, 1);
    session('as-archived', 5, 2);
    expect(apiTokenWaiting('tk-w')).toBe(60);
    expect(apiTokenWaiting('tk-other')).toBe(0);
  });

  it('spend a budget per token per minute', () => {
    for (let call = 0; call < 120; call++)
      expect(spendApiTokenBudget('tk-a', 'call')).toBe(0);
    expect(spendApiTokenBudget('tk-a', 'call')).toBeGreaterThan(0);
    expect(spendApiTokenBudget('tk-b', 'call')).toBe(0);
    expect(spendApiTokenBudget('tk-a', 'write')).toBe(0);
  });
});

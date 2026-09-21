import { and, eq, gt, lt } from 'drizzle-orm';
import type { H3Event } from 'h3';
import { getRequestMeta, getRequestIp } from '../request';
import {
  createAccessToken,
  hashAccessToken,
  isAccessTokenShape,
} from './token';

/**
 * One-time links that sign the owner in on another device.
 *
 * Typical use: generate one on the computer, open it on the phone — by
 * scanning the QR code with the camera, which hands the address to the phone's
 * browser — and the phone is signed in without typing the secret phrase.
 *
 * Two properties keep that safe. The link dies on first use, so a copy left in
 * a chat is worthless afterwards, and it dies on its own after a few minutes,
 * so a link nobody used is worthless too.
 */
export const SIGN_IN_LINK_LIFETIME_MS = 15 * 60 * 1000;

/** Only so many live at once; each one is a way in. */
const MAX_ACTIVE_LINKS = 5;

export interface SignInLinkRecord {
  /** The token itself, returned only when the link is created. */
  token?: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  createdFrom?: string;
}

export async function createSignInLink(
  event: H3Event,
): Promise<SignInLinkRecord> {
  const { db, schema } = THEI_SERVER.useDb();
  cleanupExpiredSignInLinks();
  const active = db.select().from(schema.signInLinks).all();
  if (active.length >= MAX_ACTIVE_LINKS)
    throw createError({
      statusCode: 429,
      message: THEI_SERVER.phrase.sign_in_link_too_many,
    });

  const ip = getRequestIp(event);
  const meta = await getRequestMeta({
    ip,
    ua: getHeader(event, 'user-agent'),
  });
  const createdFrom =
    [meta.browser, meta.os].filter(Boolean).join(' · ') || undefined;

  const token = createAccessToken();
  const now = Date.now();
  const row = {
    tokenHash: hashAccessToken(token),
    createdAt: now,
    expiresAt: now + SIGN_IN_LINK_LIFETIME_MS,
    createdFrom: createdFrom ?? null,
  };
  db.insert(schema.signInLinks).values(row).run();
  return { ...row, createdFrom: createdFrom, token };
}

export function listSignInLinks(): SignInLinkRecord[] {
  const { db, schema } = THEI_SERVER.useDb();
  cleanupExpiredSignInLinks();
  return db
    .select()
    .from(schema.signInLinks)
    .all()
    .map((row) => ({
      tokenHash: row.tokenHash,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      createdFrom: row.createdFrom ?? undefined,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function revokeSignInLink(tokenHash: string): boolean {
  const { db, schema } = THEI_SERVER.useDb();
  const result = db
    .delete(schema.signInLinks)
    .where(eq(schema.signInLinks.tokenHash, tokenHash))
    .run();
  return result.changes > 0;
}

/**
 * Spends a link: deletes the row and reports whether it was there.
 *
 * The delete is the check. Two requests racing for the same link cannot both
 * see a row removed, so a link can never sign in twice.
 */
export function consumeSignInLink(token: string): boolean {
  if (!isAccessTokenShape(token)) return false;
  const { db, schema } = THEI_SERVER.useDb();
  const result = db
    .delete(schema.signInLinks)
    .where(
      and(
        eq(schema.signInLinks.tokenHash, hashAccessToken(token)),
        gt(schema.signInLinks.expiresAt, Date.now()),
      ),
    )
    .run();
  return result.changes > 0;
}

/** Whether a token still opens a valid link, without spending it. */
export function signInLinkIsValid(token: string): boolean {
  if (!isAccessTokenShape(token)) return false;
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select()
    .from(schema.signInLinks)
    .where(eq(schema.signInLinks.tokenHash, hashAccessToken(token)))
    .get();
  return Boolean(row && row.expiresAt > Date.now());
}

export function cleanupExpiredSignInLinks(): void {
  const { db, schema } = THEI_SERVER.useDb();
  db.delete(schema.signInLinks)
    .where(lt(schema.signInLinks.expiresAt, Date.now()))
    .run();
}

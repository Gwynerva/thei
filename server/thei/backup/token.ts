import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { H3Event } from 'h3';
import { BACKUP_TOKEN_HEADER } from '#layers/thei/shared/backup';
import { hashAccessToken } from '../access-links/token';
import { updateTheiConfig } from '../config/write';

const TOKEN_BYTES = 32;

export function backupTokenConfigured(): boolean {
  return Boolean(THEI_SERVER.config.backup?.tokenHash);
}

/**
 * Replace the backup token, returning the new one.
 *
 * Shown to the operator once, at generation time. Only its hash is kept, so
 * neither the config nor a backup copy of it can be used to download the
 * site.
 */
export async function rotateBackupToken(): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  await updateTheiConfig((config) => ({
    ...config,
    backup: {
      tokenHash: hashAccessToken(token),
      createdAt: new Date().toISOString(),
    },
  }));
  return token;
}

export async function revokeBackupToken(): Promise<void> {
  await updateTheiConfig(({ backup: _backup, ...config }) => config);
}

/**
 * Whether the request carries the instance's backup token.
 *
 * Hashes are compared in constant time: a token is guessed one byte at a time
 * when the comparison stops at the first mismatch.
 */
export function requestHasBackupToken(event: H3Event): boolean {
  const expected = THEI_SERVER.config.backup?.tokenHash;
  if (!expected) return false;
  const provided = getHeader(event, BACKUP_TOKEN_HEADER);
  if (!provided) return false;
  const left = Buffer.from(hashAccessToken(provided), 'hex');
  const right = Buffer.from(expected, 'hex');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function requireBackupToken(event: H3Event): void {
  if (requestHasBackupToken(event)) return;
  throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
}

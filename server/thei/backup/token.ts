import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { H3Event } from 'h3';
import { BACKUP_TOKEN_HEADER } from '#layers/thei/shared/backup';
import type { TheiConfig } from '../config';
import { writeTheiConfig } from '../config/write';

const TOKEN_BYTES = 32;

export function backupTokenConfigured(): boolean {
  return Boolean(THEI_SERVER.config.backup?.token);
}

/**
 * Replace the backup token, returning the new one.
 *
 * Shown to the operator once, at generation time. The config file already
 * holds the site password hash and the secret phrase, so this adds no new
 * class of secret to it.
 */
export async function rotateBackupToken(): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  await writeBackupConfig({ token, createdAt: new Date().toISOString() });
  return token;
}

export async function revokeBackupToken(): Promise<void> {
  await writeBackupConfig(undefined);
}

async function writeBackupConfig(backup: TheiConfig['backup']): Promise<void> {
  const next: TheiConfig = { ...THEI_SERVER.config, backup };
  if (!backup) delete next.backup;
  await writeTheiConfig(next);
}

/**
 * Whether the request carries the instance's backup token.
 *
 * Compared in constant time: a token is guessed one byte at a time when the
 * comparison stops at the first mismatch.
 */
export function requestHasBackupToken(event: H3Event): boolean {
  const expected = THEI_SERVER.config.backup?.token;
  if (!expected) return false;
  const provided = getHeader(event, BACKUP_TOKEN_HEADER);
  if (!provided) return false;
  const left = Buffer.from(provided, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function requireBackupToken(event: H3Event): void {
  if (requestHasBackupToken(event)) return;
  throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
}

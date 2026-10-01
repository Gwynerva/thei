import { createHash } from 'node:crypto';
import { ogTemplateSignature } from '#thei/og-signature';
import type { OgCardContent } from './model';

/**
 * What a card shows, as one string: its content, with each picture named by
 * what it is — its bytes' hash — rather than by where it lives on disk, so
 * the same card on a restored copy of a site is the same card.
 */
export function ogContentSignature(content: OgCardContent): string {
  return JSON.stringify(content, (key, value) =>
    key === 'file' && typeof value === 'string' ? undefined : value,
  );
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

/** The name a card's file is cached under: what it shows, and nothing else. */
export function ogContentKey(content: OgCardContent): string {
  return sha256(ogContentSignature(content)).slice(0, 24);
}

/**
 * The card's version: what it shows and how cards are drawn. A new release
 * that draws cards differently gives every card a new version, and with it a
 * new address, so previewers fetch it again.
 */
export function ogCardVersion(content: OgCardContent): string {
  return sha256(`${ogTemplateSignature}|${ogContentSignature(content)}`).slice(
    0,
    24,
  );
}

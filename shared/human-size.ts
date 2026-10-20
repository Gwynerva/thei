import type { LanguageSizeUnits } from './language/types';

/**
 * A size in bytes as a person reads it, in a language's units: «532 B»,
 * «1.4 MB» — a tenth where it is not a whole number, the unit held to the
 * number by a non-breaking space. The admin's pages and the server, where a
 * session's chip names a file, say it so alike.
 */

function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

export function humanSize(bytes: number, units: LanguageSizeUnits): string {
  if (bytes < 1024) {
    return `${bytes}\u00a0${units.b}`;
  }

  if (bytes < 1024 * 1024) {
    return `${fmt(bytes / 1024)}\u00a0${units.kb}`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${fmt(bytes / (1024 * 1024))}\u00a0${units.mb}`;
  }

  return `${fmt(bytes / (1024 * 1024 * 1024))}\u00a0${units.gb}`;
}

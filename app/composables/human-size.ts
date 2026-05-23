import type { LanguageSizeUnits } from '#layers/thei/shared/language';

function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

function humanSize(bytes: number, units: LanguageSizeUnits): string {
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

export function useHumanSize(): (bytes: number) => string {
  return (bytes: number) => humanSize(bytes, language.value.sizeUnits);
}

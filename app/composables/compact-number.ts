export function formatCompactNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value);
}

export function useCompactNumber(): (value: number) => string {
  return (value: number) => formatCompactNumber(value, language.value.code);
}

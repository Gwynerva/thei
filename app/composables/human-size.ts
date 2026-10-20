import { humanSize } from '#layers/thei/shared/human-size';

/** A size in bytes as the page's language says it (`shared/human-size.ts`). */
export function useHumanSize(): (bytes: number) => string {
  return (bytes: number) => humanSize(bytes, language.value.sizeUnits);
}

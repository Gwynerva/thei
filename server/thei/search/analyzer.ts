import {
  createSearchAnalyzer,
  type SearchAnalyzer,
} from '#layers/thei/shared/language/search';
import type { LanguageCode } from '#layers/thei/shared/language';

let analyzer: { language: LanguageCode; value: SearchAnalyzer } | undefined;

/**
 * How this site reads words: by its language. Light to take — the index is
 * not opened for it — so anything that compares words may.
 */
export function searchAnalyzer(): SearchAnalyzer {
  const language = (THEI_SERVER.language?.code ?? 'en') as LanguageCode;
  if (analyzer?.language !== language)
    analyzer = { language, value: createSearchAnalyzer(language) };
  return analyzer.value;
}

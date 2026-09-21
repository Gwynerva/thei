import { normalizeInlineMarkup } from '#layers/thei/shared/language/general-normalize';
import type { LanguageInstance } from '#layers/thei/shared/language';

/**
 * Typography for text the owner wrote, applied on the way to the screen.
 *
 * UI phrases are already normalized by the language proxy. Everything the
 * owner typed — titles, summaries, captions, content — is stored exactly as
 * they typed it and only looks like proper typography once it is displayed.
 * Nothing here ever writes back: the quotes, dashes and non-breaking spaces
 * live in the rendered page, not in the database.
 */
export function publicText(value: string | undefined | null): string {
  if (!value) return '';
  return language.value.normalize(value);
}

/**
 * The same, for a string carrying Editor.js inline markup. Tags and their
 * attributes are left alone — a normalized `href` is a broken `href`.
 */
export function publicRichText(value: string | undefined | null): string {
  if (!value) return '';
  return normalizeInlineMarkup(value, language.value.normalize);
}

/** The pair, bound to one language instance, for code outside a component. */
export function publicTextWith(instance: LanguageInstance) {
  return {
    text: (value: string | undefined | null) =>
      value ? instance.normalize(value) : '',
    richText: (value: string | undefined | null) =>
      value ? normalizeInlineMarkup(value, instance.normalize) : '',
  };
}

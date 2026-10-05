import { normalizeInlineMarkup } from './general-normalize';

/**
 * Typography for text the owner wrote, bound to one language's rules.
 *
 * Everything the owner typed — titles, summaries, captions, notes, statuses,
 * content — is stored exactly as typed and only takes proper typography on the
 * way out: on a page, in a tooltip, in a meta tag, an Open Graph card or a
 * Markdown copy. Nothing formatted here is ever written back. The one thing
 * settled on the way in is the last mark of a caption or a heading
 * (`shared/terminal-punctuation.ts`): it is part of what is said, not of how
 * it is set.
 *
 * `richText` is for a string carrying Editor.js inline markup: tags and their
 * attributes are left alone, since a normalized `href` is a broken `href`.
 */
export function ownerTextFormatter(normalize: (text: string) => string) {
  return {
    text: (value: string | undefined | null): string =>
      value ? normalize(value) : '',
    richText: (value: string | undefined | null): string =>
      value ? normalizeInlineMarkup(value, normalize) : '',
  };
}

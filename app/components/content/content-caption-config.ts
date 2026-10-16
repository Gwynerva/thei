import type { SanitizerConfig } from '@editorjs/editorjs';

export const CONTENT_CAPTION_SANITIZE = {
  b: true,
  strong: true,
  i: true,
  em: true,
  a: {
    href: true,
    target: true,
    rel: true,
    'data-content-link': true,
    'data-entity-type': true,
    'data-entity-id': true,
    'data-entity-fragment': true,
  },
} as const;

/**
 * What Editor.js keeps of each field of a block that shows files as it
 * saves it: the caption's markup, and every other field — a file, a plain
 * title — as it is, since a field left out would be cleaned as markup and a
 * title's `&` written `&amp;`. Editor.js reads `true` as "as it is" beside a
 * field's rules, which its types cannot say in one object.
 */
export function contentFileSanitize(
  fields: Record<string, true | typeof CONTENT_CAPTION_SANITIZE>,
) {
  return fields as unknown as Record<string, SanitizerConfig>;
}

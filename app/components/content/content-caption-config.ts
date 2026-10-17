import type { SanitizerConfig } from '@editorjs/editorjs';

/**
 * What a caption keeps when Editor.js cleans a block — as it is pasted, cut,
 * converted or merged: exactly what the inline tools keep, a link with its
 * note and a hint among it, since a caption takes the marks a paragraph
 * takes. Editor.js lays a field's own rules over the inline tools' ones, so
 * an empty rule is theirs as they are; a rule for a tag here would replace
 * theirs, and whatever it left out would be gone from every caption moved.
 */
export const CONTENT_CAPTION_SANITIZE = {} as const;

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

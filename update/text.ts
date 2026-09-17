/**
 * Text shown in the update panel for a step, a release phase or a migration.
 *
 * Usually a plain English string. A step may also carry translations keyed by
 * language code; the panel then shows the site's language, English, or failing
 * both, whichever translation exists.
 *
 * Resolved when the step is recorded rather than when it is displayed: the
 * panel reading the record belongs to the version being replaced and knows
 * nothing about the steps a newer release brings.
 */
export type UpdateText = string | Readonly<Record<string, string>>;

export function resolveUpdateText(
  text: UpdateText,
  languageCode?: string,
): string;
export function resolveUpdateText(
  text: UpdateText | undefined,
  languageCode?: string,
): string | undefined;
export function resolveUpdateText(
  text: UpdateText | undefined,
  languageCode?: string,
): string | undefined {
  if (text === undefined || typeof text === 'string') return text;
  return (
    (languageCode ? text[languageCode] : undefined) ??
    text.en ??
    Object.values(text).find(Boolean)
  );
}

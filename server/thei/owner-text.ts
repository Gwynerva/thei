import { ownerTextFormatter } from '#layers/thei/shared/language/owner-text';

/**
 * The owner's words as the server hands them out — in Markdown copies, Open
 * Graph cards and `llms.txt` — with the typography of the site's language, the
 * same the pages give them (`app/composables/public-text.ts`).
 *
 * Before the language is loaded there are no rules to apply, and the text goes
 * out as typed rather than not at all.
 */
function formatter() {
  const language = THEI_SERVER.language as
    typeof THEI_SERVER.language | undefined;
  return ownerTextFormatter(language?.normalize ?? ((text) => text));
}

export function ownerText(value: string | undefined | null): string {
  return formatter().text(value);
}

export function ownerRichText(value: string | undefined | null): string {
  return formatter().richText(value);
}

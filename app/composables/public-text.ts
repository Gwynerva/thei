import { ownerTextFormatter } from '#layers/thei/shared/language/owner-text';

/**
 * Typography for text the owner wrote, applied on the way to the screen.
 *
 * UI phrases are already normalized by the language proxy. Everything the
 * owner typed — titles, summaries, captions, notes, reminders, statuses,
 * content — is stored exactly as they typed it and only looks like proper
 * typography once it is displayed, in public pages and admin lists alike,
 * tooltips and `aria-label`s included. Nothing here ever writes back: the
 * quotes, dashes and non-breaking spaces live in the rendered page, not in the
 * database. The server formats its own output with `server/thei/owner-text.ts`.
 */
export function publicText(value: string | undefined | null): string {
  return ownerTextFormatter(language.value.normalize).text(value);
}

/**
 * The same, for a string carrying Editor.js inline markup. Tags and their
 * attributes are left alone — a normalized `href` is a broken `href`.
 */
export function publicRichText(value: string | undefined | null): string {
  return ownerTextFormatter(language.value.normalize).richText(value);
}

/**
 * A field's ✦ asks the model about that field alone, right where it is:
 * describe this file, propose a title, shorten the summary. With AI on it
 * stands at every field a proposal can change — quiet while it has nothing
 * to show — but at a switch, whose ✦ only brings what was proposed.
 */

/** Places whose ✦ only shows proposals: a switch is asked nothing. */
const SILENT_PLACES = new Set(['access', 'field:showcase', 'field:cv', 'form']);

/** Whether the ✦ at this place may be asked something. */
export function askablePlace(place: string): boolean {
  return !SILENT_PLACES.has(place);
}

/**
 * The form's field a place stands for, by the name the page gives fields
 * (`ai_action_fields`): a field's own, a text's — its body, its notes, a
 * description — or a list's.
 */
export function placeField(place: string): string {
  if (place.startsWith('field:')) return place.slice('field:'.length);
  if (place.startsWith('text:')) {
    const slot = place.slice('text:'.length);
    if (slot.endsWith('-notes')) return 'notes';
    if (slot === 'project-description') return 'description';
    if (slot === 'profile-about') return 'about';
    return 'body';
  }
  return place;
}

/** How long the owner's words to a field's ✦ may be. */
export const FIELD_ASK_MAX = 2000;

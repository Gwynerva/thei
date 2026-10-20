import { and, eq, like } from 'drizzle-orm';
import type { AiMessagePart } from '#layers/thei/shared/ai';
import { AI_FIELD_ACTIONS } from '#layers/thei/shared/ai-actions';
import { archivedOriginalFromMeta } from '#layers/thei/shared/asset';
import { assetFormatName } from '#layers/thei/shared/asset-format-label';
import {
  askablePlace,
  FIELD_ASK_MAX,
  placeField,
} from '#layers/thei/shared/ai-field-ask';
import { readPlacements } from '../assets/library';
import { refuse as fail } from '../entity-patch/text';
import { entityFace, entityTextOfSlot, refOf } from '../entity-kinds';
import { findTarget, isFileKey, targetRef } from './actions/target';
import { sessionModel } from './model/settings';
import { libraryFile } from './sessions/files';
import { startOwnerSession } from './sessions/owner';

/**
 * The owner asks at a field's ✦ — «describe this file», «propose a title» —
 * and the model answers about that field alone, in a session of its own
 * started in the background; what it proposes waits at the field's label
 * as any proposal does. Never a built-in check: a check looks only at what
 * it has not looked at, and here the owner names what to look at.
 */

/** The longest the form's unsaved words are told to the model. */
const CURRENT_MAX = 4000;

/** What to propose, and with what, for each place of a form. */
function howAt(kind: string, place: string, file: boolean): string {
  if (file)
    return 'look at the file with look_at_file, read what its places say with read_file, then propose its description with describe';
  const field = placeField(place);
  if (place.startsWith('field:')) {
    const own = (AI_FIELD_ACTIONS as Record<string, readonly string[]>)[kind];
    return own?.includes(field)
      ? `propose it with field (field ${field})`
      : `propose it with update (changes.${field})`;
  }
  if (place === 'periods')
    return 'propose its dates with periods, the whole list as read_entity gives it';
  if (place === 'tags')
    return 'propose tags with tags — existing ones first (list_entities, kind tag)';
  if (place === 'relations')
    return 'propose relations with relation, each a deliberate claim of a real dependency, never a mere mention';
  return 'propose corrections with revise, or new words with write';
}

/** Names the place of the form for the model, as read_entity names it. */
function placeName(kind: string, place: string, file: boolean): string {
  if (file) return 'the file’s description';
  if (place.startsWith('text:')) {
    const text = entityTextOfSlot(kind as never, place.slice('text:'.length));
    return `its text «${text?.name ?? place.slice('text:'.length)}»`;
  }
  return `its ${placeField(place)}`;
}

/**
 * How a file is named to the owner, in its session's title: by the place it
 * stands in, the latest changed — a file's own name is a camera's number or
 * a hash more often than not, and tells nothing — else by its kind and
 * format.
 */
function fileFace(assetUuid: string): { title: string; placed: boolean } {
  const place = (readPlacements([assetUuid]).get(assetUuid) ?? [])
    .filter(
      (placement) =>
        placement.source.type !== 'ai-session' && placement.source.title,
    )
    .sort((a, b) => b.source.updatedAt - a.source.updatedAt)[0];
  if (place) return { title: place.source.title, placed: true };
  const info = libraryFile(assetUuid);
  if (!info) return { title: assetUuid, placed: false };
  return {
    title: assetFormatName(
      THEI_SERVER.phrase,
      info.extension,
      archivedOriginalFromMeta(info.meta),
    ),
    placed: false,
  };
}

/**
 * Starts the session that answers an ask at a field. `current` is what the
 * form holds there now, unsaved; `model` the one chosen, if any.
 */
export function askAtField(input: {
  ref: unknown;
  place: unknown;
  text: unknown;
  current?: unknown;
  /** The field as the owner's form names it, for the session's title. */
  label?: unknown;
  model?: string;
}): { sessionUuid: string } {
  if (!sessionModel(input.model)) fail('No model is set up to answer.');
  const target =
    findTarget(input.ref) ?? fail(`There is no ${String(input.ref)}.`);
  const place =
    typeof input.place === 'string' ? input.place.trim().slice(0, 100) : '';
  if (!place || !askablePlace(place)) fail('Nothing is asked at that field.');
  const words = typeof input.text === 'string' ? input.text.trim() : '';
  if (!words) fail('Say what to do with it.');
  // Never cut: the box the owner asks in says the limit before it sends.
  if (words.length > FIELD_ASK_MAX)
    fail(`Say it in at most ${FIELD_ASK_MAX} characters.`);
  const file = isFileKey(target);
  if (file && place !== 'field:description')
    fail('A file is asked about its description alone.');
  const ref = targetRef(target);
  const shown = isFileKey(target) ? fileFace(target.id) : undefined;
  const face = isFileKey(target)
    ? shown!.title
    : (entityFace(target)?.title ?? refOf(target));
  const which = !shown
    ? `«${face}»`
    : shown.placed
      ? `used in «${face}»`
      : 'placed nowhere yet';
  const current =
    typeof input.current === 'string'
      ? input.current.trim().slice(0, CURRENT_MAX)
      : '';
  const fields = THEI_SERVER.phrase.ai_action_fields as Record<string, string>;
  const named =
    typeof input.label === 'string'
      ? input.label.replace(/\s+/g, ' ').trim().slice(0, 80)
      : '';
  const label = file
    ? THEI_SERVER.phrase.asset_description
    : named || (fields[placeField(place)] ?? placeField(place));
  const brief = [
    `The owner asks at ${placeName(target.kind, place, file)} of ${ref} — ${which} — in their own words:`,
    words,
    current
      ? `What the owner has typed there in the form, not saved yet — their own words, which the form will save over the stored ones: «${current}»`
      : '',
    `Do just that, for this one field: ${howAt(target.kind, place, file)}. Read what you need first. Leave everything else as it is; say in a line what you proposed, or why nothing.`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const part: AiMessagePart = { type: 'field', ref, place };
  const sessionUuid = startOwnerSession({
    title: `${label} · ${face}`,
    // A file is no entity a session is about: the brief names it.
    about: file ? [] : [ref],
    text: words,
    brief,
    parts: [part],
    ...(input.model ? { model: input.model } : {}),
  });
  return { sessionUuid };
}

/**
 * The asks still answered for an entity or a file, by place: a form opened
 * again shows them running at their fields.
 */
export function asksRunning(
  ref: string,
): { place: string; sessionUuid: string }[] {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select({
      sessionUuid: schema.aiMessages.sessionUuid,
      parts: schema.aiMessages.parts,
    })
    .from(schema.aiMessages)
    .innerJoin(
      schema.aiSessions,
      eq(schema.aiSessions.sessionUuid, schema.aiMessages.sessionUuid),
    )
    .where(
      and(
        eq(schema.aiSessions.state, 'running'),
        eq(schema.aiMessages.role, 'owner'),
        like(schema.aiMessages.parts, '%"type":"field"%'),
      ),
    )
    .all();
  return rows.flatMap((row) =>
    (row.parts as AiMessagePart[]).flatMap((part) =>
      part.type === 'field' && part.ref === ref
        ? [{ place: part.place, sessionUuid: row.sessionUuid }]
        : [],
    ),
  );
}

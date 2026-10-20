import type { IconName } from '#thei/icons';
import type { AiActionItem, AiSessionItem } from '#layers/thei/shared/ai';
import { plainMarkdown } from '#layers/thei/shared/ai-message-text';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import { isContentEntityType } from '#layers/thei/shared/content-link';

/**
 * How the AI pages say times, amounts and texts in short: «09:12», «Tue
 * 19:40», «14 Oct»; «41K tokens»; a text's words without their marks.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** A moment as a list says it: the time today, the day this week, the date before. */
export function shortWhen(at: number, now = Date.now()): string {
  const code = language.value.code;
  const date = new Date(at);
  const time = date.toLocaleTimeString(code, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) return time;
  if (now - at < 6 * DAY_MS)
    return `${date.toLocaleDateString(code, { weekday: 'short' })} ${time}`;
  return date.toLocaleDateString(code, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/**
 * When a message was sent, as its bubble says it: «now», «5 min ago» and
 * «3 hr ago» for the last few hours, then the moment as a list says it.
 */
export function sentWhen(at: number, now = Date.now()): string {
  const ago = Math.max(0, now - at);
  const relative = new Intl.RelativeTimeFormat(language.value.code, {
    numeric: 'auto',
    style: 'short',
  });
  if (ago < MINUTE_MS) return relative.format(0, 'second');
  if (ago < HOUR_MS)
    return relative.format(-Math.floor(ago / MINUTE_MS), 'minute');
  if (ago < 6 * HOUR_MS)
    return relative.format(-Math.floor(ago / HOUR_MS), 'hour');
  return shortWhen(at, now);
}

/** A moment in full, for a hint: «14 October 2026, 19:40». */
export function fullWhen(at: number): string {
  return new Date(at).toLocaleString(language.value.code, {
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

/**
 * The icon of anything the AI names: an entity as everywhere else, the
 * owner's profile, a file of the library.
 */
export function aiEntityIcon(type: string | undefined): IconName {
  if (type === 'profile') return 'person';
  if (type === 'asset') return 'media';
  return isContentEntityType(type) ? entityTypeIcon(type) : 'page';
}

/** A kind of action by its name. */
export function kindName(kind: string): string {
  const kinds = phrase.value.ai_action_kinds;
  return kinds[kind as keyof typeof kinds] ?? kind;
}

/** A field an action sets, by its name in the form. */
export function fieldName(field: string): string {
  const fields = phrase.value.ai_action_fields;
  return fields[field as keyof typeof fields] ?? field;
}

/** A field's value as words: a flag on or off, a list, a text. */
export function fieldValueWords(value: unknown): string {
  if (typeof value === 'boolean')
    return phrase.value.ai_action_flag[value ? 'on' : 'off'];
  if (Array.isArray(value)) return value.map(String).join(', ');
  return value === null || value === undefined ? '' : publicText(String(value));
}

/**
 * What an action is called in a line: the field it sets, a kind's own name
 * for anything else — the text it writes is named beside it in its row.
 */
export function actionName(action: AiActionItem): string {
  const field = (action.payload as { field?: unknown }).field;
  if (action.kind === 'field' && typeof field === 'string')
    return fieldName(field);
  return kindName(action.kind);
}

/** Actions as cards: one per bundle, in its order, one per lone action. */
export function actionCards(actions: readonly AiActionItem[]) {
  const groups = new Map<string, AiActionItem[]>();
  for (const action of actions) {
    const key = action.bundleUuid ?? action.actionUuid;
    groups.set(key, [...(groups.get(key) ?? []), action]);
  }
  return [...groups].map(([key, list]) => ({
    key,
    actions: list.sort((a, b) => a.bundleOrder - b.bundleOrder),
  }));
}

/**
 * An action in a few words, as a comment to it names it: what it does and
 * to what — for a new entity, what it would be called.
 */
export function actionLabel(action: AiActionItem): string {
  const said = phrase.value;
  if (action.kind === 'create') {
    const payload = (action.payload ?? {}) as {
      entity?: string;
      fields?: Record<string, unknown>;
    };
    const made =
      said.ai_action_create[
        payload.entity as keyof typeof said.ai_action_create
      ] ?? actionName(action);
    const title = payload.fields?.title ?? payload.fields?.date;
    return typeof title === 'string' && title
      ? `${made} · ${publicText(title)}`
      : made;
  }
  const kind = actionName(action);
  const target = action.target;
  if (!target) return kind;
  return `${kind} · ${aiEntityName(target)}`;
}

/**
 * What an entity the AI names is called: a diary entry by its day, said as
 * the lists say it, anything else by its title as the owner wrote it — or by
 * its id while it has none. The kind is its `type`, or the start of its ref.
 */
export function aiEntityName(entity: {
  type?: string;
  ref?: string;
  id?: string;
  title: string;
}): string {
  const type = entity.type ?? entity.ref?.split(':')[0];
  return type === 'diary-entry' && /^\d{4}-\d{2}-\d{2}$/.test(entity.title)
    ? entityListName({ date: entity.title })
    : entityListName({ title: entity.title, entityId: entity.id });
}

/**
 * What a session is called: its title, an app's name and day, or untitled.
 * Where only its title is at hand, that or untitled.
 */
export function sessionTitle(
  item: Pick<AiSessionItem, 'title'> &
    Partial<Pick<AiSessionItem, 'origin' | 'client' | 'createdAt'>>,
): string {
  if (item.title) return publicText(item.title);
  if (item.origin === 'app' && item.client && item.createdAt)
    return `${item.client} · ${shortWhen(item.createdAt)}`;
  return phrase.value.ai_session_untitled;
}

/** Where a session came from: the owner, a template, an app by its name. */
export function sessionSource(item: Pick<AiSessionItem, 'origin' | 'client'>): {
  icon: IconName;
  label: string;
} {
  if (item.origin === 'app')
    return { icon: 'key', label: item.client ?? 'MCP' };
  if (item.origin === 'template')
    return { icon: 'template', label: phrase.value.ai_session_template };
  return { icon: 'person', label: phrase.value.ai_session_you };
}

/** An amount of tokens, short as every count is: 41K, 1.2M. */
export function compactAmount(value: number): string {
  return formatCompactNumber(value, language.value.code);
}

/** Words cut at `max`, an ellipsis saying so. */
function clipped(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The words of editing Markdown, its marks and addresses dropped, on one line. */
export function plainWords(markdown: string, max = 400): string {
  return clipped(plainMarkdown(markdown), max);
}

/**
 * The words of editing Markdown as lines: a heading and the paragraph after
 * it stay apart, the marks and addresses dropped. For a text shown whole.
 */
export function plainLines(markdown: string, max = 600): string {
  return clipped(plainMarkdown(markdown, true), max);
}

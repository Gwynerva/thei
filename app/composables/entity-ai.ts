import type { InjectionKey } from 'vue';
import type { AiActionItem } from '#layers/thei/shared/ai';
import type {
  AiEntityOffer,
  AiEntityPanel,
  AiFieldAsk,
  AiOfferPlace,
} from '#layers/thei/shared/ai-entity';
import { placeField } from '#layers/thei/shared/ai-field-ask';
import {
  RELATION_TYPE_OF_WORD,
  RELATION_WORD_FROM_OTHER_END,
  type RelationEditItem,
  type RelationEntityType,
  type RelationNote,
  type RelationWord,
} from '#layers/thei/shared/relation';
import type { TagEditItem } from '#layers/thei/shared/tag';
import { namesTag } from '#layers/thei/shared/ai-actions';
import { actionTexts } from '#layers/thei/shared/ai-action-texts';

/**
 * The AI around one entity's form: what it remembers of the entity, the
 * proposals that wait for it — each shown where the form has its field —
 * and the sessions about it. A form provides it with its entity and its
 * data; the ✦ button, the memory block and the rows under fields read it.
 *
 * A proposal accepted here is laid into the form, not saved: it counts as
 * applied once the form is saved with it, when the panel is read again and
 * the server finds the entity reading as the proposal would leave it. Left
 * unsaved, it waits again. With AI off nothing is asked and nothing shown.
 */

export interface EntityAiOptions {
  /** The entity once it exists, as a ref: `project:<uuid>`. */
  ref: () => string | undefined;
  /** The form's data, which a proposal is laid into. */
  form?: () => object | undefined;
  /** The version the form was read or saved at: a new one reads again. */
  version?: () => unknown;
}

export interface EntityAi {
  ref: ComputedRef<string | undefined>;
  panel: Readonly<Ref<AiEntityPanel | null>>;
  /** AI is on and the entity exists: there is something to show. */
  shown: ComputedRef<boolean>;
  /** The proposals waiting, less those taken into the form or answered. */
  offers: ComputedRef<AiEntityOffer[]>;
  offersAt: (place: AiOfferPlace) => AiEntityOffer[];
  /** Changed by AI elsewhere since the form was read. */
  outdated: Readonly<Ref<boolean>>;
  refresh: () => Promise<void>;
  /**
   * How the form answers a proposal's accept: laid into the form, applied
   * at once — what the AI remembers is no part of the form — or opened in
   * its session, when the form cannot take it.
   */
  modeOf: (offer: AiEntityOffer) => 'takes' | 'applies' | 'session';
  accept: (offer: AiEntityOffer) => Promise<void>;
  /**
   * Declines: the proposal stays where it stood in its declined state —
   * to bring back, or never to offer again — until its place lets it go.
   */
  reject: (offer: AiEntityOffer) => Promise<void>;
  /** What was declined here and still stands at a place. */
  declinedAt: (place: AiOfferPlace) => AiEntityOffer[];
  /** Brings a proposal declined here back to wait. */
  restore: (offer: AiEntityOffer) => Promise<void>;
  /** Never offers what was declined here again. */
  never: (offer: AiEntityOffer) => Promise<void>;
  /** A place done with: what was declined at it goes. */
  letGoDeclined: (place: AiOfferPlace) => void;
  /** What is taken into the form, not saved yet, at a place. */
  takenAt: (place: AiOfferPlace) => AiEntityOffer[];
  /** Takes a proposal back out of the form, while the form reads as it left it. */
  untake: (offer: AiEntityOffer) => void;
  comment: (offer: AiEntityOffer, text: string) => Promise<void>;
  /** Edits taken in a text's editor, told to their sessions once saved. */
  noteTaken: (taken: Record<string, Record<string, string>>) => void;
  /**
   * The form was saved: proposals taken into it are told with their words
   * as saved, which they count as applied with when the owner corrected
   * them there.
   */
  saved: () => Promise<void>;
  remember: (text: string) => Promise<void>;
  /** A field's ✦ may be asked: AI on, the entity there, a model to answer. */
  askable: ComputedRef<boolean>;
  /** The session answering what a field's ✦ was asked, while it does. */
  askingAt: (place: AiOfferPlace) => string | undefined;
  /** An ask that ended with nothing proposed at its field: its session. */
  answeredAt: (place: AiOfferPlace) => string | undefined;
  /**
   * The field holds something to work on — words, a date, an item: a request
   * that only mends what is there is offered only then.
   */
  filledAt: (place: AiOfferPlace) => boolean;
  /** Asks the model about one field; what it proposes comes to the label. */
  ask: (place: AiOfferPlace, text: string, label?: string) => Promise<void>;
  /** Stops the session answering at a field. */
  stopAsk: (place: AiOfferPlace) => Promise<void>;
}

const KEY: InjectionKey<EntityAi> = Symbol('entity-ai');

/** The forms in hand so far, to tell their entries apart. */
let hands = 0;

/** How often a form reads again while one of its fields' ✦ is answered. */
const FOLLOW_MS = 1500;

/**
 * The asks of a form's fields: started here, or found answered still when
 * the form was read; followed by reading the form's AI again until their
 * sessions have answered — what they propose reaches the labels with it.
 * One that ended with nothing proposed says so at its field.
 */
function useFieldAsks(options: {
  ref: () => string | undefined;
  /** The asks the server says are answered now. */
  running: () => readonly AiFieldAsk[];
  /** What the form holds at a place, unsaved: told to the model. */
  current: (place: string) => string | undefined;
  refresh: () => Promise<void>;
}) {
  const started = ref(new Map<string, string>());
  const ended = ref(new Map<string, string>());
  const asking = computed(() => {
    const found = new Map(started.value);
    for (const ask of options.running()) found.set(ask.place, ask.sessionUuid);
    return found;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  function follow() {
    clearTimeout(timer);
    if (!asking.value.size) return;
    timer = setTimeout(async () => {
      await options.refresh().catch(() => undefined);
      const running = new Set(options.running().map((ask) => ask.place));
      const left = new Map(started.value);
      const done = new Map(ended.value);
      for (const [place, sessionUuid] of started.value)
        if (!running.has(place)) {
          left.delete(place);
          done.set(place, sessionUuid);
        }
      started.value = left;
      ended.value = done;
      follow();
    }, FOLLOW_MS);
  }
  if (import.meta.client) {
    // A form opened while an ask is answered follows it too.
    watch(
      () => options.running().length,
      (count) => count && follow(),
    );
    onScopeDispose(() => clearTimeout(timer));
  }
  async function ask(place: string, text: string, label?: string) {
    const target = options.ref();
    if (!target || !text.trim()) return;
    const current = options.current(place);
    const { sessionUuid } = await $fetch<{ sessionUuid: string }>(
      '/api/admin/ai/ask',
      {
        method: 'POST',
        body: {
          ref: target,
          place,
          text,
          ...(current !== undefined ? { current } : {}),
          ...(label ? { label } : {}),
        },
      },
    );
    started.value = new Map(started.value).set(place, sessionUuid);
    const done = new Map(ended.value);
    done.delete(place);
    ended.value = done;
    follow();
  }
  async function stop(place: string) {
    const sessionUuid = asking.value.get(place);
    if (!sessionUuid) return;
    await aiApi.stop(sessionUuid);
    await options.refresh().catch(() => undefined);
  }
  return {
    askingAt: (place: string) => asking.value.get(place),
    answeredAt: (place: string) =>
      asking.value.has(place) ? undefined : ended.value.get(place),
    ask,
    stop,
  };
}

/**
 * Proposals declined in a form, kept where they stood in their declined
 * state, as a session's card stays — «Вернуть» and «Больше не предлагать»
 * beside it — rather than a toast at the top of the window, far from the
 * field. A place lets them go when the owner is done with it: a field's
 * popup closed, the form saved.
 */
function useDeclinedHere(options: {
  /** Hides a proposal from the form's own, or shows it again. */
  hide: (id: string, on: boolean) => void;
  refresh: () => Promise<void> | void;
}) {
  const declined = shallowRef(new Map<string, AiEntityOffer>());
  function keep(id: string, offer: AiEntityOffer | undefined) {
    const next = new Map(declined.value);
    if (offer) next.set(id, offer);
    else next.delete(id);
    declined.value = next;
  }
  async function reject(offer: AiEntityOffer) {
    const id = offer.action.actionUuid;
    options.hide(id, true);
    try {
      await aiApi.reject(id);
    } catch (caught) {
      options.hide(id, false);
      showToast(errorMessage(caught, phrase.value.ai_error));
      return;
    }
    keep(id, {
      ...offer,
      action: { ...offer.action, state: 'rejected', never: false },
    });
    // Read again, so the counts — the admin bar's too — drop it at once.
    void options.refresh();
  }
  async function restore(offer: AiEntityOffer) {
    const id = offer.action.actionUuid;
    try {
      await aiApi.restore(id);
    } catch (caught) {
      showToast(errorMessage(caught, phrase.value.ai_error));
      return;
    }
    keep(id, undefined);
    options.hide(id, false);
    await options.refresh();
  }
  async function never(offer: AiEntityOffer) {
    const id = offer.action.actionUuid;
    try {
      await aiApi.never(id);
    } catch (caught) {
      showToast(errorMessage(caught, phrase.value.ai_error));
      return;
    }
    if (declined.value.has(id))
      keep(id, { ...offer, action: { ...offer.action, never: true } });
  }
  return {
    reject,
    restore,
    never,
    declinedAt: (place: string) =>
      [...declined.value.values()].filter((offer) => offer.place === place),
    letGo(place?: string) {
      declined.value = new Map(
        [...declined.value].filter(
          ([, offer]) => place !== undefined && offer.place !== place,
        ),
      );
    },
  };
}

/** What a form holds at a place, as words: a list one item a line. */
function wordsAt(form: object | undefined, place: string): string | undefined {
  if (!form || place.startsWith('text:')) return undefined;
  const value = (form as Record<string, unknown>)[placeField(place)];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string'))
    return value.join('\n');
  return undefined;
}

/**
 * Whether the form holds something at a place: words, an item of a list. A
 * text's field says it of itself (`FieldAi`); what is not known counts as
 * held, so no request is kept from a field that may have something.
 */
function filledAt(form: object | undefined, place: string): boolean {
  if (!form) return true;
  const value = (form as Record<string, unknown>)[placeField(place)];
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Kinds that change only what the AI remembers: applied from the form. */
const MEMORY_KINDS = new Set(['remember', 'term', 'memory-compact']);

export function provideEntityAi(options: EntityAiOptions): EntityAi {
  const ai = createEntityAi(options);
  provide(KEY, ai);
  return ai;
}

/** The entity AI of the nearest form; none outside one. */
export function useEntityAi(): EntityAi | undefined {
  return inject(KEY, undefined);
}

/**
 * The entities whose forms are open, the latest last — a section's window
 * over its project's form: what the admin bar's ✦ starts a session about.
 */
export function useAiEntitiesInHand() {
  return useState<{ id: string; ref: string; title: string }[]>(
    'ai-entities-in-hand',
    () => [],
  );
}

// ---- Telling other tabs ------------------------------------------------------------

const CHANNEL = 'thei-ai-entities';
let channel: BroadcastChannel | undefined;
const listeners = new Set<(refs: string[]) => void>();

function entityChannel() {
  if (channel || !import.meta.client || typeof BroadcastChannel === 'undefined')
    return channel;
  channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent<string[]>) => {
    if (Array.isArray(event.data))
      for (const listener of listeners) listener(event.data);
  };
  return channel;
}

/**
 * Entities an AI action changed on the server — applied or undone from a
 * session: open forms of them, in any tab, learn they read an older state.
 */
export function tellEntitiesChanged(refs: (string | undefined)[]) {
  const changed = [...new Set(refs.filter((ref): ref is string => !!ref))];
  if (!changed.length) return;
  entityChannel()?.postMessage(changed);
  for (const listener of listeners) listener(changed);
}

// ---- Laying a proposal into a form ----------------------------------------------------

/** A relation's note as the other end reads it: a split one's sides swap. */
function noteFromOtherEnd(note: unknown): RelationNote | undefined {
  if (!note || typeof note !== 'object') return undefined;
  const value = note as RelationNote;
  return value.type === 'split'
    ? {
        type: 'split',
        currentText: value.relatedText,
        relatedText: value.currentText,
      }
    : value;
}

/**
 * What a take did: the fields it changed, how they read after it, and how to
 * put them back as they read before.
 */
interface Take {
  keys: string[];
  /** The fields as they were before it, and as it left them. */
  before: string;
  after: string;
  undo: () => void;
}

/**
 * The words of a proposal taken into a form, as the saved form holds them,
 * by the keys its texts go by: what the owner may have corrected there.
 */
function savedWords(
  action: AiActionItem,
  form: Record<string, unknown>,
): Record<string, string> | undefined {
  const values: Record<string, string> = {};
  for (const text of actionTexts(action.kind, action.payload)) {
    const field =
      action.kind === 'field'
        ? String((action.payload as { field?: unknown }).field)
        : action.kind === 'describe'
          ? 'description'
          : action.kind === 'update' && text.key.startsWith('changes.')
            ? text.key.slice('changes.'.length)
            : undefined;
    if (!field || !(field in form)) continue;
    const value = form[field];
    values[text.key] = Array.isArray(value)
      ? value.map(String).join('\n')
      : String(value ?? '');
  }
  return Object.keys(values).length ? values : undefined;
}

/**
 * «Taken into the form — save it», with a way back while the form still
 * holds what was taken. Its id, to take it away once the form is saved.
 */
function showTakenToast(
  id: string,
  taken: Ref<Map<string, Take>>,
  untouched: (id: string) => boolean,
  said = phrase.value.ai_offer_taken,
): number {
  return showToast(said, {
    label: phrase.value.ai_offer_take_back,
    run: () => {
      const back = taken.value.get(id);
      // Corrected since, it is the owner's own words: not undone for them.
      if (!back || !untouched(id)) return;
      back.undo();
      const next = new Map(taken.value);
      next.delete(id);
      taken.value = next;
    },
  });
}

/** Tells the sessions of proposals taken into a form what the form saved. */
async function tellTakenWords(
  took: readonly AiActionItem[],
  form: Record<string, unknown> | undefined,
) {
  if (!form) return;
  await Promise.all(
    took.map((action) => {
      const values = savedWords(action, form);
      return values
        ? aiApi.takenWith(action.actionUuid, values).catch(() => undefined)
        : undefined;
    }),
  );
}

/** The fields as a take compares them. */
function fieldsOf(form: Record<string, unknown>, keys: string[]): string {
  return JSON.stringify(keys.map((key) => form[key] ?? null));
}

function setFields(
  form: Record<string, unknown>,
  values: Record<string, unknown>,
): Take | undefined {
  const keys = Object.keys(values);
  if (!keys.length || keys.some((key) => !(key in form))) return undefined;
  const before = JSON.parse(
    JSON.stringify(Object.fromEntries(keys.map((key) => [key, form[key]]))),
  ) as Record<string, unknown>;
  // A field takes only a value of its own shape: text for text, a list for
  // a list. Anything richer — a text, the action — is a session's to make.
  const fits = keys.every((key) => {
    const now = form[key];
    const next = values[key];
    if (Array.isArray(now)) return Array.isArray(next);
    if (now === null || typeof now === 'object') return false;
    return typeof now === typeof next || (now === undefined && next !== null);
  });
  if (!fits) return undefined;
  const was = fieldsOf(form, keys);
  Object.assign(form, JSON.parse(JSON.stringify(values)));
  return {
    keys,
    before: was,
    after: fieldsOf(form, keys),
    undo: () => Object.assign(form, before),
  };
}

function takeTags(
  form: Record<string, unknown>,
  action: AiActionItem,
): Take | undefined {
  if (!Array.isArray(form.tags)) return undefined;
  const payload = action.payload as {
    add: { ref?: string; title: string }[];
    remove: { ref: string }[];
  };
  const idOf = (ref?: string) =>
    ref?.startsWith('tag:') ? ref.slice('tag:'.length) : undefined;
  const removed = new Set(payload.remove.map((tag) => idOf(tag.ref)));
  const tags = (form.tags as TagEditItem[]).filter(
    (tag) => !tag.tagUuid || !removed.has(tag.tagUuid),
  );
  for (const tag of payload.add) {
    const tagUuid = idOf(tag.ref);
    const title = action.refs[tag.ref ?? '']?.title ?? tag.title;
    if (
      tags.some((item) =>
        namesTag(
          { ref: tagUuid && tag.ref, title },
          { ref: item.tagUuid && `tag:${item.tagUuid}`, title: item.title },
        ),
      )
    )
      continue;
    tags.push(
      tagUuid
        ? ({ tagUuid, title, slug: '', publicId: '' } as TagEditItem)
        : { title },
    );
  }
  return setFields(form, { tags });
}

function takeRelation(
  form: Record<string, unknown>,
  action: AiActionItem,
  self: string,
): Take | undefined {
  if (!Array.isArray(form.relations)) return undefined;
  const payload = action.payload as {
    op: 'add' | 'change' | 'remove';
    other: string;
    relation: RelationWord;
    note?: unknown;
  };
  // Proposed from the other end, it is read from this one.
  const fromHere = action.target?.ref === self;
  const end = fromHere ? action.refs[payload.other] : action.target;
  if (!end) return undefined;
  const word = fromHere
    ? payload.relation
    : RELATION_WORD_FROM_OTHER_END[payload.relation];
  const note = fromHere
    ? (payload.note as RelationNote | undefined)
    : noteFromOtherEnd(payload.note);
  const others = (form.relations as RelationEditItem[]).filter(
    (item) => !(item.entityType === end.type && item.entityId === end.id),
  );
  if (payload.op === 'remove') return setFields(form, { relations: others });
  const item: RelationEditItem = {
    entityType: end.type as RelationEntityType,
    entityId: end.id,
    type: RELATION_TYPE_OF_WORD[word],
    ...(note ? { note } : {}),
    ...(end.type === 'diary-entry'
      ? { date: end.title }
      : { title: end.title }),
  };
  return setFields(form, { relations: [...others, item] });
}

/** Lays a proposal into the form; none when the form cannot take it. */
function takeInto(
  form: Record<string, unknown>,
  action: AiActionItem,
  self: string,
): Take | undefined {
  const payload = (action.payload ?? {}) as Record<string, unknown>;
  // A bundle that goes whole is applied whole, from its session.
  if (action.atomic && action.bundleUuid) return undefined;
  switch (action.kind) {
    case 'field':
      return setFields(form, { [String(payload.field)]: payload.value });
    case 'periods':
      return setFields(form, { periods: payload.periods });
    case 'access':
      return setFields(form, { access: payload.access });
    case 'tags':
      return takeTags(form, action);
    case 'relation':
      return takeRelation(form, action, self);
    case 'update': {
      const after = (action.base as { after?: Record<string, unknown> } | null)
        ?.after;
      return after ? setFields(form, after) : undefined;
    }
    case 'describe':
      return setFields(form, { description: payload.text });
    default:
      return undefined;
  }
}

/**
 * Whether a proposal could be laid into this form, tried on a shallow copy:
 * a take replaces the fields it changes, never what is inside them.
 */
function takes(
  form: Record<string, unknown>,
  action: AiActionItem,
  self: string,
): boolean {
  return Boolean(takeInto({ ...form }, action, self));
}

// ---- The entity's AI -----------------------------------------------------------------

function createEntityAi(options: EntityAiOptions): EntityAi {
  const aiEnabled = useAiEnabled();
  const target = computed(() => options.ref());
  const shown = computed(() => aiEnabled.value && Boolean(target.value));
  const panel = shallowRef<AiEntityPanel | null>(null);
  const outdated = ref(false);
  /**
   * The entity's ref as the server names it — a diary entry by its day — so
   * a relation proposed from either end is read from the right one.
   */
  const canonical = computed(
    () => panel.value?.memory.entity.ref ?? target.value,
  );
  /** Proposals laid into the form, until it is saved or they are taken back. */
  const taken = ref(new Map<string, Take>());
  /** The toast that says to save what was taken, gone once it is saved. */
  let takenToast: number | undefined;
  /** Proposals answered here, until the panel is read again. */
  const answered = ref(new Set<string>());
  /** Text edits taken in an editor, by action: told once the form is saved. */
  const takenInTexts = new Map<string, Record<string, string>>();

  /** Saved: the sessions hear what the texts took; the server checks it. */
  async function tellTaken() {
    const told = [...takenInTexts];
    takenInTexts.clear();
    await Promise.all(
      told.map(([actionUuid, parts]) =>
        $fetch(`/api/admin/ai/actions/${actionUuid}/taken`, {
          method: 'POST',
          body: { parts },
        }).catch(() => undefined),
      ),
    );
  }

  let reading = 0;
  async function refresh() {
    const current = target.value;
    if (!shown.value || !current) {
      panel.value = null;
      return;
    }
    const ticket = ++reading;
    try {
      const read = await aiApi.entityPanel(current);
      if (ticket !== reading) return;
      panel.value = read;
      answered.value = new Set();
    } catch {
      if (ticket === reading) panel.value = null;
    }
  }

  if (import.meta.client) {
    onMounted(() => {
      watch([target, aiEnabled], () => void refresh(), { immediate: true });
      // Saved, what was laid into the form is in it now — or not, and waits
      // again; either way the server says.
      watch(
        () => options.version?.(),
        (now, before) => {
          if (now === before) return;
          // Saved, what was declined in it is done with.
          declined.letGo();
          // Saved by the owner — not read again for being outdated — what
          // was taken is told as saved.
          const took = outdated.value
            ? []
            : [...taken.value.keys()].flatMap(
                (id) =>
                  panel.value?.offers.find(
                    (offer) => offer.action.actionUuid === id,
                  )?.action ?? [],
              );
          const form = options.form?.() as Record<string, unknown> | undefined;
          // Saved, what was taken waits no more: counted so at once, rather
          // than counted again until the form's AI is read anew.
          if (panel.value && took.length)
            panel.value = {
              ...panel.value,
              waiting: Math.max(0, panel.value.waiting - took.length),
            };
          taken.value = new Map();
          hideToast(takenToast);
          outdated.value = false;
          void Promise.all([tellTaken(), tellTakenWords(took, form)]).then(
            refresh,
          );
        },
      );
    });
    // In hand while the form is open, for the admin bar's ✦.
    const inHand = useAiEntitiesInHand();
    // Not `useId`: called in the browser only, it would shift every id the
    // server rendered after it.
    const handId = String(++hands);
    const letGo = () => {
      inHand.value = inHand.value.filter((entry) => entry.id !== handId);
    };
    watch(
      () => [canonical.value, panel.value?.memory.entity.title] as const,
      ([ref, title]) => {
        if (!ref || !shown.value) return letGo();
        const entry = { id: handId, ref, title: title ?? '' };
        const index = inHand.value.findIndex((item) => item.id === handId);
        inHand.value =
          index < 0
            ? [...inHand.value, entry]
            : inHand.value.map((item, at) => (at === index ? entry : item));
      },
    );
    onScopeDispose(letGo);

    const heard = (refs: string[]) => {
      if (!canonical.value || !refs.includes(canonical.value)) return;
      outdated.value = true;
      void refresh();
    };
    entityChannel();
    listeners.add(heard);
    onScopeDispose(() => listeners.delete(heard));
  }

  /**
   * A proposal taken into the form stays out of sight while the form holds
   * anything but what it held before — corrected words included; changed
   * back by hand, it is offered again. Undone from its toast only while
   * the form reads as the take left it.
   */
  function stillTaken(id: string) {
    const done = taken.value.get(id);
    const form = options.form?.() as Record<string, unknown> | undefined;
    return Boolean(done && form && fieldsOf(form, done.keys) !== done.before);
  }
  function untouched(id: string) {
    const done = taken.value.get(id);
    const form = options.form?.() as Record<string, unknown> | undefined;
    return Boolean(done && form && fieldsOf(form, done.keys) === done.after);
  }

  const offers = computed(() =>
    (panel.value?.offers ?? []).filter(
      (offer) =>
        !stillTaken(offer.action.actionUuid) &&
        !answered.value.has(offer.action.actionUuid),
    ),
  );

  // The admin bar's ✦ counts what waits for the owner, as the server read
  // it with this form — less what is taken into the form, which waits only
  // for its save, as the header's ✦ counts it.
  if (import.meta.client)
    watch(
      () =>
        [
          panel.value?.waiting,
          [...taken.value.keys()].filter((id) => stillTaken(id)).length,
        ] as const,
      ([waiting, takes]) => {
        if (waiting !== undefined) setAiWaiting(Math.max(0, waiting - takes));
      },
    );

  function modeOf(offer: AiEntityOffer) {
    if (MEMORY_KINDS.has(offer.action.kind)) return 'applies' as const;
    const form = options.form?.() as Record<string, unknown> | undefined;
    return form && canonical.value && takes(form, offer.action, canonical.value)
      ? ('takes' as const)
      : ('session' as const);
  }

  const asks = useFieldAsks({
    ref: () => canonical.value,
    running: () => panel.value?.asking ?? [],
    current: (place) => wordsAt(options.form?.(), place),
    refresh,
  });

  async function accept(offer: AiEntityOffer) {
    const mode = modeOf(offer);
    if (mode === 'takes') return take(offer);
    if (mode !== 'applies') return;
    const id = offer.action.actionUuid;
    answer(id);
    try {
      const outcome = await aiApi.apply([id]);
      if (outcome.refused || outcome.failed)
        showToast(outcome.refused ?? outcome.failed!.error);
    } catch (caught) {
      showToast(errorMessage(caught, phrase.value.ai_error));
    }
    await refresh();
  }

  function take(offer: AiEntityOffer) {
    const form = options.form?.() as Record<string, unknown> | undefined;
    if (!form || !canonical.value) return;
    const undo = takeInto(form, offer.action, canonical.value);
    if (!undo) return;
    const id = offer.action.actionUuid;
    taken.value = new Map(taken.value).set(id, undo);
    // At the form's head its row says so itself, where it stood: no toast
    // laid over the form's first fields.
    if (offer.place !== 'form')
      takenToast = showTakenToast(id, taken, untouched);
  }

  function untake(offer: AiEntityOffer) {
    const id = offer.action.actionUuid;
    const back = taken.value.get(id);
    // Corrected since, it is the owner's own words: not undone for them.
    if (!back || !untouched(id)) return;
    back.undo();
    const next = new Map(taken.value);
    next.delete(id);
    taken.value = next;
  }

  function answer(id: string) {
    answered.value = new Set(answered.value).add(id);
  }

  const declined = useDeclinedHere({
    hide: (id, on) => {
      const next = new Set(answered.value);
      if (on) next.add(id);
      else next.delete(id);
      answered.value = next;
    },
    refresh,
  });

  async function comment(offer: AiEntityOffer, text: string) {
    try {
      await aiApi.comment(offer.action.actionUuid, text);
      showToast(phrase.value.ai_toast_comment_sent);
    } catch (caught) {
      showToast(errorMessage(caught, phrase.value.ai_error));
    }
  }

  async function remember(text: string) {
    if (!target.value) return;
    await $fetch('/api/admin/ai/memory', {
      method: 'POST',
      body: { anchor: 'entity', ref: target.value, type: 'fact', text },
    });
    await refresh();
  }

  return {
    ref: canonical,
    panel,
    shown,
    offers,
    offersAt: (place) => offers.value.filter((offer) => offer.place === place),
    outdated,
    refresh,
    modeOf,
    accept,
    reject: declined.reject,
    declinedAt: declined.declinedAt,
    restore: declined.restore,
    never: declined.never,
    letGoDeclined: declined.letGo,
    takenAt: (place) =>
      (panel.value?.offers ?? []).filter(
        (offer) => offer.place === place && stillTaken(offer.action.actionUuid),
      ),
    untake,
    comment,
    remember,
    // A form tells what it took as its version moves, saved.
    saved: async () => {},
    askable: computed(() => shown.value && Boolean(panel.value?.modelReady)),
    askingAt: asks.askingAt,
    answeredAt: asks.answeredAt,
    filledAt: (place) => filledAt(options.form?.(), place),
    ask: asks.ask,
    stopAsk: asks.stop,
    noteTaken: (taken) => {
      for (const [actionUuid, parts] of Object.entries(taken))
        takenInTexts.set(actionUuid, {
          ...takenInTexts.get(actionUuid),
          ...parts,
        });
    },
  };
}

// ---- A file's description ------------------------------------------------------------

export interface FileAiOptions {
  /** The file, as a ref: `asset:<uuid>`. */
  ref: () => string;
  /** What waits for its description, as its field read it. */
  offers: () => AiEntityOffer[];
  /** The field's data, which a proposal is laid into: `{ description }`. */
  form: () => Record<string, unknown>;
  /** Reads the description and its proposals again. */
  reload: () => Promise<void>;
  /** What its ✦ was asked and is still answered, as the field read it. */
  asking: () => readonly AiFieldAsk[];
  /** Whether a model answers what its ✦ is asked. */
  modelReady: () => boolean;
}

/**
 * The AI around a file's description field, as a form has it around its
 * fields: the descriptions proposed for the file wait at the label, and one
 * accepted is laid into the field — applied once the field is saved, when
 * the server finds the description reading as it would leave it. A file is
 * no entity: it is never in hand for the admin bar's ✦, and nothing of it
 * is remembered here. With AI off nothing is shown.
 */
export function provideFileAi(options: FileAiOptions): EntityAi {
  const aiEnabled = useAiEnabled();
  const target = computed(() => options.ref());
  const taken = ref(new Map<string, Take>());
  let takenToast: number | undefined;
  const answered = ref(new Set<string>());

  function stillTaken(id: string) {
    const done = taken.value.get(id);
    return Boolean(done && fieldsOf(options.form(), done.keys) !== done.before);
  }
  function untouched(id: string) {
    const done = taken.value.get(id);
    return Boolean(done && fieldsOf(options.form(), done.keys) === done.after);
  }
  const offers = computed(() =>
    aiEnabled.value
      ? options
          .offers()
          .filter(
            (offer) =>
              !stillTaken(offer.action.actionUuid) &&
              !answered.value.has(offer.action.actionUuid),
          )
      : [],
  );
  function answer(id: string, on = true) {
    const next = new Set(answered.value);
    if (on) next.add(id);
    else next.delete(id);
    answered.value = next;
  }
  const declined = useDeclinedHere({
    hide: (id, on) => answer(id, on),
    refresh: () => options.reload(),
  });
  async function refresh() {
    await options.reload();
    taken.value = new Map();
    answered.value = new Set();
  }

  const asks = useFieldAsks({
    ref: () => target.value,
    running: () => options.asking(),
    current: () => String(options.form().description ?? ''),
    refresh: () => options.reload(),
  });

  const ai: EntityAi = {
    ref: target,
    panel: shallowRef(null),
    shown: computed(() => aiEnabled.value),
    offers,
    offersAt: (place) => (place === 'field:description' ? offers.value : []),
    outdated: ref(false),
    refresh,
    modeOf: () => 'takes',
    async accept(offer) {
      const undo = takeInto(options.form(), offer.action, target.value);
      if (!undo) return;
      const id = offer.action.actionUuid;
      taken.value = new Map(taken.value).set(id, undo);
      // The file's window has no form: its description field is saved alone.
      takenToast = showTakenToast(
        id,
        taken,
        untouched,
        phrase.value.ai_offer_taken_file,
      );
    },
    reject: declined.reject,
    declinedAt: declined.declinedAt,
    restore: declined.restore,
    never: declined.never,
    letGoDeclined: declined.letGo,
    // A file's window has no form head: what is taken is its one field.
    takenAt: () => [],
    untake: () => {},
    async comment(offer, text) {
      try {
        await aiApi.comment(offer.action.actionUuid, text);
        showToast(phrase.value.ai_toast_comment_sent);
      } catch (caught) {
        showToast(errorMessage(caught, phrase.value.ai_error));
      }
    },
    noteTaken: () => {},
    askable: computed(() => aiEnabled.value && options.modelReady()),
    askingAt: (place) => asks.askingAt(place),
    answeredAt: (place) => asks.answeredAt(place),
    filledAt: () => true,
    ask: (place, text, label) => asks.ask(place, text, label),
    stopAsk: (place) => asks.stop(place),
    async saved() {
      hideToast(takenToast);
      await tellTakenWords(
        [...taken.value.keys()].flatMap(
          (id) =>
            options.offers().find((offer) => offer.action.actionUuid === id)
              ?.action ?? [],
        ),
        options.form(),
      );
    },
    remember: async () => {},
  };
  provide(KEY, ai);

  // Applied or undone from a session: the field reads the file again.
  if (import.meta.client) {
    const heard = (refs: string[]) => {
      if (refs.includes(target.value)) void refresh();
    };
    entityChannel();
    listeners.add(heard);
    onScopeDispose(() => listeners.delete(heard));
  }
  return ai;
}

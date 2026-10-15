import type { InjectionKey } from 'vue';
import type { AiActionItem } from '#layers/thei/shared/ai';
import type {
  AiEntityOffer,
  AiEntityPanel,
  AiOfferPlace,
} from '#layers/thei/shared/ai-entity';
import {
  RELATION_TYPE_OF_WORD,
  RELATION_WORD_FROM_OTHER_END,
  type RelationEditItem,
  type RelationEntityType,
  type RelationNote,
  type RelationWord,
} from '#layers/thei/shared/relation';
import type { TagEditItem } from '#layers/thei/shared/tag';

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
  reject: (offer: AiEntityOffer) => Promise<void>;
  comment: (offer: AiEntityOffer, text: string) => Promise<void>;
  /** Edits taken in a text's editor, told to their sessions once saved. */
  noteTaken: (taken: Record<string, Record<string, string>>) => void;
  remember: (text: string) => Promise<void>;
}

const KEY: InjectionKey<EntityAi> = Symbol('entity-ai');

/** The forms in hand so far, to tell their entries apart. */
let hands = 0;

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
  after: string;
  undo: () => void;
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
  Object.assign(form, JSON.parse(JSON.stringify(values)));
  return {
    keys,
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
        tagUuid
          ? item.tagUuid === tagUuid
          : item.title.toLowerCase() === title.toLowerCase(),
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
          taken.value = new Map();
          outdated.value = false;
          void tellTaken().then(refresh);
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
   * A proposal taken into the form stays out of sight while the form reads
   * as the take left it; changed back by hand, it is offered again.
   */
  function stillTaken(id: string) {
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

  function modeOf(offer: AiEntityOffer) {
    if (MEMORY_KINDS.has(offer.action.kind)) return 'applies' as const;
    const form = options.form?.() as Record<string, unknown> | undefined;
    return form && canonical.value && takes(form, offer.action, canonical.value)
      ? ('takes' as const)
      : ('session' as const);
  }

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
    showToast(phrase.value.ai_offer_taken, {
      label: phrase.value.ai_offer_take_back,
      run: () => {
        const back = taken.value.get(id);
        if (!back || !stillTaken(id)) return;
        back.undo();
        const next = new Map(taken.value);
        next.delete(id);
        taken.value = next;
      },
    });
  }

  function answer(id: string) {
    answered.value = new Set(answered.value).add(id);
  }

  async function reject(offer: AiEntityOffer) {
    const id = offer.action.actionUuid;
    answer(id);
    try {
      await aiApi.reject(id);
    } catch (caught) {
      const next = new Set(answered.value);
      next.delete(id);
      answered.value = next;
      showToast(errorMessage(caught, phrase.value.ai_error));
      return;
    }
    showToast(phrase.value.ai_toast_declined(1), {
      label: phrase.value.ai_action_never,
      run: () => {
        void aiApi
          .never(id)
          .then(() => showToast(phrase.value.ai_toast_never))
          .catch((caught) =>
            showToast(errorMessage(caught, phrase.value.ai_error)),
          );
      },
    });
  }

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
    reject,
    comment,
    remember,
    noteTaken: (taken) => {
      for (const [actionUuid, parts] of Object.entries(taken))
        takenInTexts.set(actionUuid, {
          ...takenInTexts.get(actionUuid),
          ...parts,
        });
    },
  };
}

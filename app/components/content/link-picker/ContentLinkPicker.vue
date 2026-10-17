<script lang="ts" setup>
import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';
import type {
  ContentEntityOutline,
  ContentOutlineHeading,
} from '#layers/thei/shared/admin/content-entity-outline';
import {
  contentPlaceLabel,
  isFixedContentPlace,
} from '#layers/thei/shared/content-headings';
import { matchContentIntegration } from '#layers/thei/shared/content-integrations';
import {
  linkFragment,
  type ContentEntityType,
} from '#layers/thei/shared/content-link';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import {
  EXTERNAL_LINK_NOTE_LIMIT,
  externalLinkHostname,
  normalizeExternalLinkUrl,
} from '#layers/thei/shared/external-link';
import { parseInternalUrl } from '#layers/thei/shared/internal-url';
import { normalizeCaptionText } from '#layers/thei/shared/terminal-punctuation';
import type { SelectOption } from '#layers/thei/app/components/field/FieldSelect.vue';
import ExternalLinkPreviewCard from '#layers/thei/app/components/external-links/ExternalLinkPreviewCard.vue';
import {
  createExternalLinkDraft,
  useExternalLinks,
  useExternalLinkTyping,
} from '#layers/thei/app/composables/external-links';
import {
  contentEntityKey,
  useActiveRow,
  useContentEntitySearch,
} from '#layers/thei/app/composables/content-entity-search';
import { fetchContentEntityOutline } from '#layers/thei/app/composables/content-entity-outline';
import { registerDismissLayer } from '#layers/thei/app/composables/modal';
import type {
  ContentLinkPick,
  ContentLinkPickEntity,
  ContentLinkPickerMode,
  ContentLinkTarget,
} from './types';

/**
 * Where a link leads, chosen in one field and taken down level by level.
 *
 * The field searches the site's own entities — by their titles, synonyms
 * and days, and before anything is typed, by the words the link is made
 * over — or reads an address: one of this site opens its entity at once,
 * another site's shows as its card, and in a link block an address a block
 * of its own takes, a video, becomes that block. An entity with headings or
 * sections opens a level of its own: a select of the whole, its headings
 * and, in a project, its sections, a section opening the level below. The
 * levels passed stand above, line under line, each a way back to its own;
 * Escape goes back one. A link to a heading no longer there names it and
 * says so; it is pointed elsewhere, or at the whole.
 */
const props = defineProps<{
  mode: ContentLinkPickerMode;
  /** The words the link is made over: what they name comes first. */
  suggest?: string;
  /** The link being edited. */
  initial?: ContentLinkTarget;
  initialNote?: string;
  /** A link already there: it may be taken off. */
  existing?: boolean;
}>();
const emit = defineEmits<{
  apply: [pick: ContentLinkPick];
  remove: [];
}>();

type Level = 'search' | 'entity' | 'section';

const level = ref<Level>('search');
/** The entity the levels below search are about. */
const entity = shallowRef<ContentLinkPickEntity>();
const section = shallowRef<{ entityId: string; title: string }>();
/** What the level shown holds: the entity's or the section's outline. */
const outline = shallowRef<ContentEntityOutline>();
/** The heading chosen at the level shown; none for the whole. */
const heading = shallowRef<ContentOutlineHeading>();
/** The anchor of the link being edited, which leads nowhere now. */
const lostAnchor = ref<string>();
/**
 * The place of the link being edited when it is not a heading — one the
 * page always has, or a passage of text — offered to keep, and kept.
 */
const kept = ref<string>();
const keeping = ref(false);
/** The target of the link being edited is gone altogether. */
const lostTarget = ref(false);
/** What a target holds could not be asked: the link is made as it is. */
const failed = ref(false);
/** An entity with no inside, chosen at the search level. */
const picked = shallowRef<ContentEntitySearchItem>();
const note = ref(props.initialNote ?? '');
const busy = ref(false);

const field = useTemplateRef<HTMLInputElement>('field');
const place = useTemplateRef<{ open: () => void; focus: () => void }>('place');
const root = useTemplateRef<HTMLElement>('root');

// ---- Searching ---------------------------------------------------------------

const search = useContentEntitySearch({
  suggest: () => props.suggest,
  // An address is read as an address, not searched for.
  paused: () => Boolean(address.value),
});

// ---- Addresses ---------------------------------------------------------------

const internalSite = useInternalUrlSite();
const draft = createExternalLinkDraft(useExternalLinks(), {
  errorText: () => phrase.value.content_link_broken_description,
});
const typing = useExternalLinkTyping(settleAddress);

/** An address of this site that opens nothing: it is another site's. */
const unknownAddress = ref<string>();

/** What the field holds when it is an address: of this site, or another. */
const address = computed(() => {
  if (props.mode === 'mention') return undefined;
  const raw = search.query.value.trim();
  if (!raw || /\s/.test(raw)) return undefined;
  if (raw !== unknownAddress.value && parseInternalUrl(raw, internalSite))
    return { kind: 'internal', raw } as const;
  if (!/^(https?:\/\/|www\.)/i.test(raw)) return undefined;
  const url = /^www\./i.test(raw) ? `https://${raw}` : raw;
  return { kind: 'external', raw, url } as const;
});
const integration = computed(() =>
  props.mode === 'block' && address.value?.kind === 'external'
    ? matchContentIntegration(address.value.url)
    : undefined,
);
const reading = ref(false);
let readVersion = 0;

watch(address, (now) => {
  if (now?.kind === 'external' && !integration.value) draft.url = now.url;
  else if (draft.url) draft.reset();
});

/**
 * The address is done — pasted, typing paused, or Enter. Another site's is
 * read for its card; one of this site opens its entity, where the link will
 * lead, once pasted or entered — never in a pause, which would take the
 * field away while it is still typed in.
 */
async function settleAddress({ typing: paused = false } = {}) {
  const now = address.value;
  if (!now) return;
  if (now.kind === 'external') {
    if (!integration.value) await draft.commit({ typing: paused });
    return;
  }
  if (paused) return;
  const version = ++readVersion;
  reading.value = true;
  try {
    const found = await findEntityByInternalUrl(now.raw, internalSite).catch(
      () => undefined,
    );
    if (version !== readVersion || address.value?.raw !== now.raw) return;
    // Read: what it opens takes over, ✓ ready for it.
    reading.value = false;
    if (!found) unknownAddress.value = now.raw;
    else
      await openTarget(
        {
          kind: 'entity',
          entityType: found.entityType,
          entityId: found.entityId,
          fragment: linkFragment(now.raw),
        },
        found,
      );
  } finally {
    if (version === readVersion) reading.value = false;
  }
}

function onInput(event: Event) {
  picked.value = undefined;
  if (address.value) typing.onInput(event);
  else typing.cancel();
}

// ---- Levels ------------------------------------------------------------------

const outlines = new Map<string, Promise<ContentEntityOutline | undefined>>();
/** The outlines that came, for a level shown again without waiting. */
const loaded = new Map<string, ContentEntityOutline>();
function outlineOf(type: ContentEntityType, id: string) {
  const key = `${type}:${id}`;
  let pending = outlines.get(key);
  if (!pending) {
    pending = fetchContentEntityOutline(type, id).then(
      (value) => {
        if (value) loaded.set(key, value);
        return value;
      },
      (error) => {
        // A failure is asked again next time.
        outlines.delete(key);
        throw error;
      },
    );
    outlines.set(key, pending);
  }
  return pending;
}

const hasInside = (value: ContentEntityOutline) =>
  value.headings.length > 0 || Boolean(value.sections?.length);

/** Where the focus goes once a choice shows: ✓, or the level's select. */
type Focus = 'apply' | 'place' | 'open';

/**
 * Opens where a target leads: its entity's level, or for a section its own
 * level under its project, the heading its anchor names chosen — or, for an
 * entity with no inside, the entity chosen as it is. Then the focus goes
 * where `focus` says; to the select, when the heading named is gone.
 */
async function openTarget(
  target: Extract<ContentLinkTarget, { kind: 'entity' }>,
  known?: ContentEntitySearchItem,
  focus: Focus = 'apply',
) {
  busy.value = true;
  failed.value = false;
  try {
    await showTarget(target, known);
  } catch {
    failed.value = true;
    return;
  } finally {
    busy.value = false;
  }
  if (lostTarget.value) return;
  focusOn(
    level.value === 'search' ? 'apply' : lostAnchor.value ? 'place' : focus,
  );
}

async function showTarget(
  target: Extract<ContentLinkTarget, { kind: 'entity' }>,
  known?: ContentEntitySearchItem,
) {
  const own = await outlineOf(target.entityType, target.entityId);
  if (!own) {
    lostTarget.value = true;
    return;
  }
  lostTarget.value = false;
  if (target.entityType === 'project-section' && own.parent) {
    entity.value = {
      entityType: 'project',
      entityId: own.parent.entityId,
      title: own.parent.title,
    };
    section.value = { entityId: own.entityId, title: own.title };
    enter('section', own);
    // Ready for the way back up.
    void outlineOf('project', own.parent.entityId);
  } else if (hasInside(own) || target.fragment) {
    entity.value = pickEntity(target.entityType, own, known);
    section.value = undefined;
    enter('entity', own);
  } else {
    picked.value = known ?? {
      entityType: target.entityType,
      entityId: target.entityId,
      title: own.title,
      summary: '',
      url: '',
      humanReadableSlug: '',
      updatedAt: 0,
      ...(target.entityType === 'diary-entry' ? { date: own.title } : {}),
    };
    return;
  }
  const fragment = target.fragment;
  if (fragment) {
    const found = own.headings.find((item) => item.id === fragment);
    heading.value = found;
    if (found) return;
    if (isFixedContentPlace(fragment)) {
      kept.value = fragment;
      keeping.value = true;
    } else lostAnchor.value = contentPlaceLabel(fragment);
  }
}

function pickEntity(
  type: ContentEntityType,
  own: ContentEntityOutline,
  known?: ContentEntitySearchItem,
): ContentLinkPickEntity {
  return {
    entityType: type,
    entityId: own.entityId,
    title: known?.title ?? own.title,
    ...(type === 'diary-entry' ? { date: known?.date ?? own.title } : {}),
    ...(known?.url ? { url: known.url } : {}),
  };
}

/** Shows a level: its outline, the whole of it chosen. */
function enter(next: Level, own: ContentEntityOutline) {
  level.value = next;
  outline.value = own;
  heading.value = undefined;
  lostAnchor.value = undefined;
  kept.value = undefined;
  keeping.value = false;
  picked.value = undefined;
}

/** A section chosen in the select: its level, its headings offered. */
async function enterSection(entityId: string) {
  const own = await outlineOf('project-section', entityId).catch(() => {
    failed.value = true;
    return undefined;
  });
  if (!own) return;
  section.value = { entityId, title: own.title };
  enter('section', own);
  focusOn(own.headings.length ? 'open' : 'apply');
}

async function backTo(next: Level) {
  if (next === 'search') {
    level.value = 'search';
    entity.value = undefined;
    section.value = undefined;
    outline.value = undefined;
    heading.value = undefined;
    lostAnchor.value = undefined;
    kept.value = undefined;
    keeping.value = false;
    // Opened on a link, it searched for nothing yet.
    if (!search.results.value.length) search.refresh();
    await nextTick();
    field.value?.focus({ preventScroll: true });
    return;
  }
  // At once, so the next Escape finds this level to climb from; its outline
  // is there already, unless the link opened straight in a section.
  const owner = entity.value;
  if (next !== 'entity' || !owner) return;
  const key = contentEntityKey(owner);
  section.value = undefined;
  enter(
    'entity',
    loaded.get(key) ?? {
      entityType: owner.entityType,
      entityId: owner.entityId,
      title: owner.title,
      headings: [],
    },
  );
  focusOn('place');
  if (loaded.has(key)) return;
  const own = await outlineOf(owner.entityType, owner.entityId).catch(
    () => undefined,
  );
  if (own && level.value === 'entity' && entity.value === owner)
    outline.value = own;
}

function back() {
  void backTo(level.value === 'section' ? 'entity' : 'search');
}

// Escape goes back one level; at the search, the popup's own layer closes it.
let removeLayer: (() => void) | undefined;
watch(
  level,
  (now) => {
    removeLayer?.();
    removeLayer = now === 'search' ? undefined : registerDismissLayer(back);
  },
  { immediate: true },
);
onBeforeUnmount(() => removeLayer?.());

// ---- The select of a level ---------------------------------------------------

const wholeLabel = computed(() => {
  const type =
    level.value === 'section' ? 'project-section' : entity.value?.entityType;
  return type ? phrase.value.content_link_whole(type) : '';
});

const placeOptions = computed<SelectOption[]>(() => {
  const own = outline.value;
  if (!own || !entity.value) return [];
  const options: SelectOption[] = [
    {
      value: 'whole',
      label: wholeLabel.value,
      icon:
        level.value === 'section'
          ? 'project-section'
          : entityTypeIcon(entity.value.entityType),
    },
  ];
  if (kept.value)
    options.push({
      value: 'kept',
      label: contentPlaceLabel(kept.value),
      icon: 'link',
    });
  own.headings.forEach((item, index) =>
    options.push({
      value: `h:${item.id}`,
      label: item.title,
      icon: item.private
        ? 'lock-close'
        : item.level === 3
          ? 'subheading'
          : 'heading',
      indent: item.level === 3,
      ...(index === 0
        ? {
            group:
              level.value === 'entity' && entity.value?.entityType === 'project'
                ? phrase.value.content_link_description_headings
                : phrase.value.content_link_headings,
          }
        : {}),
    }),
  );
  if (level.value === 'entity')
    own.sections?.forEach((item, index) =>
      options.push({
        value: `s:${item.entityId}`,
        label: item.title,
        icon: 'project-section',
        leads: true,
        ...(item.stage
          ? { badge: `${item.stage.number}/${item.stage.count}` }
          : {}),
        ...(index === 0 ? { group: phrase.value.content_link_sections } : {}),
      }),
    );
  return options;
});

const placeValue = computed({
  get: () =>
    heading.value
      ? `h:${heading.value.id}`
      : keeping.value
        ? 'kept'
        : lostAnchor.value
          ? ''
          : 'whole',
  set: (value: string) => {
    if (value.startsWith('s:')) {
      void enterSection(value.slice(2));
      return;
    }
    lostAnchor.value = undefined;
    keeping.value = value === 'kept';
    heading.value = value.startsWith('h:')
      ? outline.value?.headings.find((item) => `h:${item.id}` === value)
      : undefined;
    focusOn('apply');
  },
});

// ---- Applying ----------------------------------------------------------------

const external = computed(() =>
  address.value?.kind === 'external' && !integration.value
    ? address.value.url
    : undefined,
);
const externalValid = computed(() => {
  if (!external.value) return false;
  try {
    normalizeExternalLinkUrl(external.value);
    return true;
  } catch {
    return false;
  }
});

const ready = computed(() => {
  if (busy.value || reading.value || applying.value) return false;
  if (level.value !== 'search')
    return Boolean(entity.value) && !lostAnchor.value;
  if (integration.value) return true;
  if (external.value) return externalValid.value && !draft.loading;
  return Boolean(picked.value);
});

/** An empty note is no note. */
function noteText() {
  return normalizeCaptionText(note.value.trim()) || undefined;
}

/**
 * Chosen: what is left is to make the link, or to say where in it — the
 * select of the level, opened when it is what comes next.
 */
function focusOn(focus: Focus) {
  void nextTick(() => {
    if (focus === 'apply')
      root.value
        ?.querySelector<HTMLElement>('[data-link-apply]')
        ?.focus({ preventScroll: true });
    else {
      place.value?.focus();
      if (focus === 'open') place.value?.open();
    }
  });
}

/** Applied once: what made the link is not made again. */
const applying = ref(false);

async function apply() {
  if (!ready.value) return;
  applying.value = true;
  if (level.value === 'search') {
    if (integration.value && address.value?.kind === 'external') {
      emit('apply', { kind: 'integration', url: address.value.url });
      return;
    }
    if (external.value) {
      const url = normalizeExternalLinkUrl(external.value);
      const preview = await draft.commit();
      emit('apply', {
        kind: 'external',
        url,
        title: preview?.title || externalLinkHostname(url),
        note: noteText(),
      });
      return;
    }
    const chosen = picked.value;
    if (!chosen) return;
    emit('apply', {
      kind: 'entity',
      entity: {
        entityType: chosen.entityType,
        entityId: chosen.entityId,
        title: chosen.title,
        ...(chosen.date ? { date: chosen.date } : {}),
        ...(chosen.url ? { url: chosen.url } : {}),
      },
      path: [entityDisplayTitle(chosen)],
      note: noteText(),
    });
    return;
  }
  const owner = entity.value!;
  const target: ContentLinkPickEntity = section.value
    ? {
        entityType: 'project-section',
        entityId: section.value.entityId,
        title: section.value.title,
      }
    : owner;
  emit('apply', {
    kind: 'entity',
    entity: target,
    ...(heading.value
      ? { fragment: heading.value.id, heading: heading.value.title }
      : keeping.value && kept.value
        ? { fragment: kept.value }
        : {}),
    path: [
      entityDisplayTitle(owner),
      ...(section.value ? [section.value.title] : []),
    ],
    note: noteText(),
  });
}

// ---- Rows and keys -----------------------------------------------------------

const rows = computed(() =>
  address.value || search.error.value ? [] : search.results.value,
);
const { listId, activeIndex, optionId, move, pointAt, current } = useActiveRow(
  () => rows.value.length,
  search.results,
);

/**
 * A row is the choice at once, as a whole — Enter on ✓ makes the link — and
 * its level opens when its outline comes, if it has an inside and is still
 * the choice by then; `open` opens its select too, to go further in. With
 * no note to write and nothing inside to choose, the choice is the link.
 */
async function chooseRow(
  item: ContentEntitySearchItem,
  focus: Focus = 'apply',
) {
  const key = contentEntityKey(item);
  if (
    focus === 'apply' &&
    picked.value &&
    contentEntityKey(picked.value) === key
  )
    return apply();
  picked.value = item;
  focusOn('apply');
  // Not to be asked: the whole of it is chosen, and can be made a link.
  const own = await outlineOf(item.entityType, item.entityId).catch(
    () => undefined,
  );
  const still =
    level.value === 'search' &&
    picked.value &&
    contentEntityKey(picked.value) === key;
  if (!own || !still) return;
  if (item.entityType === 'project-section' || hasInside(own))
    await openTarget(
      { kind: 'entity', entityType: item.entityType, entityId: item.entityId },
      item,
      focus,
    );
  else if (props.mode !== 'inline') await apply();
}

function onFieldKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    // Ctrl/Cmd+Enter is the popup's own, wherever it is pressed.
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (address.value) {
      if (address.value.kind === 'internal') void settleAddress();
      else void apply();
      return;
    }
    const item = rows.value[current()];
    if (item) void chooseRow(item);
    else void apply();
    return;
  }
  // At the end of the words, → goes into the row: its headings, its sections.
  if (event.key === 'ArrowRight') {
    const input = event.currentTarget as HTMLInputElement;
    const item = rows.value[current()];
    if (!item || input.selectionStart !== input.value.length) return;
    event.preventDefault();
    void chooseRow(item, 'open');
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  move(event.key === 'ArrowDown' ? 1 : -1);
}

function onPlaceKeydown(event: KeyboardEvent) {
  if (event.key !== 'Backspace') return;
  event.preventDefault();
  back();
}

function onRootKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void apply();
  }
}

// ---- Opening -----------------------------------------------------------------

onMounted(async () => {
  const initial = props.initial;
  if (initial?.kind === 'entity') {
    search.stop();
    await openTarget(initial, undefined, 'place');
    // A target that is gone leaves the search to find another.
    if (lostTarget.value) search.refresh();
  } else if (initial?.kind === 'external') {
    search.query.value = initial.url;
    await draft.open(initial.url);
  } else search.refresh();
  if (level.value === 'search') field.value?.focus({ preventScroll: true });
});
onBeforeUnmount(() => typing.cancel());

defineExpose({
  focus: () =>
    level.value === 'search'
      ? field.value?.focus({ preventScroll: true })
      : place.value?.focus(),
  /** What was typed in the search, as typed. */
  query: () => search.query.value,
});

const entityTitle = computed(() =>
  entity.value ? entityDisplayTitle(entity.value) : '',
);
const queryLine = computed(() => {
  const raw = search.query.value.trim();
  return raw ? phrase.value.quoted(raw) : phrase.value.content_link_search;
});
</script>

<template>
  <section
    ref="root"
    class="flex max-h-(--floating-popup-available-height) min-h-0 flex-col
      gap-xs overflow-hidden p-xs text-text-1"
    role="dialog"
    :aria-label="phrase.content_link"
    :data-link-picker="mode"
    :data-link-level="level"
    @keydown="onRootKeydown"
  >
    <p
      v-if="lostTarget"
      class="flex items-start gap-1.5 rounded-sm border border-border-warning
        bg-bg-warning px-2 py-1.5 text-xs text-text-warning"
      data-link-lost
    >
      <Icon name="link-broken" class="mt-0.5 shrink-0" />{{
        phrase.content_link_target_gone
      }}
    </p>

    <p
      v-if="failed"
      class="flex items-start gap-1.5 rounded-sm border border-border-1 bg-bg-1
        px-2 py-1.5 text-xs text-text-2"
      data-link-failed
    >
      <Icon name="warning" class="mt-0.5 shrink-0" />{{
        phrase.search_entity_error
      }}
    </p>

    <template v-if="level === 'search'">
      <div class="relative">
        <Icon
          :name="
            address
              ? address.kind === 'internal'
                ? 'link'
                : 'globe'
              : 'search'
          "
          class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2
            text-sm text-text-3"
          aria-hidden="true"
        />
        <input
          ref="field"
          v-model="search.query.value"
          type="text"
          autocomplete="off"
          spellcheck="false"
          role="combobox"
          aria-autocomplete="list"
          :aria-controls="rows.length ? listId : undefined"
          :aria-expanded="rows.length > 0"
          :aria-activedescendant="
            activeIndex >= 0 && rows.length ? optionId(activeIndex) : undefined
          "
          :aria-label="
            mode === 'mention'
              ? phrase.content_link_mention_placeholder
              : phrase.content_link_search_placeholder
          "
          :placeholder="
            mode === 'mention'
              ? phrase.content_link_mention_placeholder
              : phrase.content_link_search_placeholder
          "
          class="h-9 w-full rounded-normal border-2 border-border-1 bg-bg-1 pr-8
            pl-8 text-sm text-text-1 transition outline-none
            placeholder:text-text-3 focus:border-accent pointer-coarse:h-11"
          data-link-field
          @input="onInput"
          @keydown="onFieldKeydown"
        />
        <Icon
          v-if="search.loading.value || reading || draft.loading"
          name="loading"
          class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2
            text-text-3"
          aria-hidden="true"
        />
      </div>

      <div
        v-if="integration && address?.kind === 'external'"
        class="flex items-center gap-sm rounded-sm border border-border-1
          bg-bg-1 p-sm text-sm"
        data-link-integration
      >
        <Icon name="play-circle" class="shrink-0 text-xl text-accent" />
        <span class="flex min-w-0 flex-col">
          <b class="truncate font-semibold">{{
            externalLinkHostname(address.url)
          }}</b>
          <span class="text-xs text-text-3">{{
            phrase.content_link_becomes_video
          }}</span>
        </span>
      </div>
      <ExternalLinkPreviewCard
        v-else-if="external"
        :link="draft.preview"
        :url="draft.url"
        :loading="draft.loading"
        :loading-text="phrase.external_link_loading"
        :error-text="draft.error"
        :note
        :interactive="true"
        data-link-external
      />
      <div
        v-else-if="rows.length"
        :id="listId"
        role="listbox"
        class="flex scrollbar-hover min-h-0 flex-col gap-1 overflow-y-auto"
      >
        <ContentEntityRow
          v-for="(item, index) in rows"
          :id="optionId(index)"
          :key="contentEntityKey(item)"
          :item
          :active="index === activeIndex"
          :chosen="
            Boolean(
              picked && contentEntityKey(picked) === contentEntityKey(item),
            )
          "
          @point="pointAt($event, index)"
          @pick="chooseRow(item)"
        />
      </div>
      <p
        v-else-if="!search.loading.value && !address"
        class="py-1 text-center text-xs text-text-3"
      >
        {{
          search.error.value
            ? phrase.search_entity_error
            : phrase.search_entity_no_results
        }}
      </p>
    </template>

    <template v-else>
      <nav
        class="flex min-w-0 flex-col gap-px"
        :aria-label="phrase.content_link_path"
        data-link-path
      >
        <button
          type="button"
          class="flex min-w-0 items-center gap-1.5 rounded-sm py-1 pr-1.5 pl-1.5
            text-left text-xs text-text-2 transition pointer-coarse:min-h-9
            hocus:bg-bg-3 hocus:text-accent"
          data-link-path-search
          @click="backTo('search')"
        >
          <Icon name="search" class="shrink-0 text-text-3" />
          <span class="min-w-0 truncate">{{ queryLine }}</span>
        </button>
        <component
          :is="level === 'section' ? 'button' : 'div'"
          :type="level === 'section' ? 'button' : undefined"
          class="flex min-w-0 items-center gap-1.5 rounded-sm py-1 pr-1.5 pl-4
            text-left text-xs transition"
          :class="
            level === 'section'
              ? `text-text-2 pointer-coarse:min-h-9 hocus:bg-bg-3
                hocus:text-accent`
              : 'font-semibold text-text-1'
          "
          data-link-path-entity
          @click="level === 'section' && backTo('entity')"
        >
          <Icon
            name="corner-down"
            class="shrink-0 -scale-y-100 rotate-90 text-text-3"
          />
          <Icon
            v-if="entity"
            :name="entityTypeIcon(entity.entityType)"
            class="shrink-0 text-text-3"
          />
          <span class="min-w-0 truncate">{{ entityTitle }}</span>
        </component>
        <div
          v-if="level === 'section' && section"
          class="flex min-w-0 items-center gap-1.5 py-1 pr-1.5 pl-6.5 text-xs
            font-semibold text-text-1"
          data-link-path-section
        >
          <Icon
            name="corner-down"
            class="shrink-0 -scale-y-100 rotate-90 text-accent"
          />
          <Icon name="project-section" class="shrink-0 text-text-3" />
          <span class="min-w-0 truncate">{{ section.title }}</span>
        </div>
      </nav>

      <div @keydown="onPlaceKeydown">
        <FieldSelect
          ref="place"
          v-model="placeValue"
          :options="placeOptions"
          :aria-label="phrase.content_link_place"
          :warning="
            lostAnchor ? phrase.content_link_anchor_gone(lostAnchor) : undefined
          "
          compact
          wide
          data-link-place
        />
      </div>
    </template>

    <div class="flex flex-col gap-xs">
      <FieldInput
        v-if="mode === 'inline'"
        v-model="note"
        type="text"
        :maxlength="EXTERNAL_LINK_NOTE_LIMIT"
        autocomplete="off"
        spellcheck="true"
        class="h-9 py-1 text-sm"
        :aria-label="phrase.content_link_note"
        :placeholder="phrase.content_link_note_placeholder"
        data-link-note
        @keydown.enter.exact.prevent="apply"
      />
      <div class="flex justify-end gap-1">
        <Button
          v-if="existing"
          type="button"
          variant="delete"
          size="icon"
          :aria-label="phrase.content_link_remove"
          :data-title-popup="phrase.content_link_remove"
          data-link-remove
          @click="emit('remove')"
        >
          <Icon name="delete" />
        </Button>
        <Button
          type="button"
          size="icon"
          :disabled="!ready"
          :aria-label="phrase.content_link_apply"
          :data-title-popup="phrase.content_link_apply"
          data-link-apply
          @click="apply"
        >
          <Icon :name="busy || reading ? 'loading' : 'check'" />
        </Button>
      </div>
    </div>
  </section>
</template>

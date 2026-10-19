<script lang="ts" setup>
import type {
  SearchAction,
  SearchAdminSection,
  SearchHit,
  SearchKind,
} from '#layers/thei/shared/search/api';
import type { IconName } from '#thei/icons';
import { SEARCH_QUERY_MAX_LENGTH } from '#layers/thei/shared/search/tokens';
import { formatAbsolutePublicDate } from '#layers/thei/shared/public-date-format';
import type { SearchQuickRowData } from './SearchQuickRow.vue';

/**
 * The quick search: one for a visitor and the owner, opened from anywhere
 * (`app/composables/site-search.ts`). What it finds comes as it is typed, the
 * best three of each kind, one row per result with the place found best;
 * the owner also finds what is closed, with its lock, and what to do — the
 * day's diary, the other side of the page they are on, what they saved last
 * with no query; a section of the admin, a new entity named by the query and
 * ✦ with one.
 *
 * Enter opens where the owner is — a page on the site, an editor in the
 * admin — and Shift+Enter the other one; Ctrl+Enter shows everything found
 * on the search page.
 */
const { open, anchor } = useSiteSearch();
const isAdmin = useIsAdmin();
const route = useRoute();
const phone = usePhoneWidth();
const field = useTemplateRef<HTMLInputElement>('field');
const text = ref('');
const inAdmin = computed(() => route.path.startsWith('/admin/'));

const { response, loading, failed } = useQuickSearch(text, {
  enabled: open,
  owner: isAdmin,
});
const query = computed(() => text.value.trim());
const shown = response;
const size = useHumanSize();
const anchorIsElement = computed(
  () => typeof Element !== 'undefined' && anchor.value instanceof Element,
);

useSiteSearchKeys(() => {
  field.value?.focus();
  field.value?.select();
});

// What had the focus gets it back when the search closes without going
// anywhere.
let opener: HTMLElement | null = null;
watch(open, (isOpen) => {
  if (isOpen) opener = document.activeElement as HTMLElement | null;
});
function focusField() {
  field.value?.focus({ preventScroll: true });
  field.value?.select();
}
function onDismiss(reason: 'outside' | 'escape') {
  if (reason === 'escape') opener?.focus?.({ preventScroll: true });
  opener = null;
}

// ---- Rows ----------------------------------------------------------------

interface Row extends SearchQuickRowData {
  run?: () => void | Promise<void>;
}
interface Section {
  key: string;
  heading?: string;
  rows: Row[];
}

const SECTION_ICONS: Record<SearchAdminSection, IconName> = {
  projects: 'project',
  events: 'event',
  diary: 'thought',
  pages: 'page',
  tags: 'tag',
  files: 'files',
  profile: 'person',
  settings: 'cog',
  updates: 'refresh',
  ai: 'sparkles',
};

function sectionName(section: SearchAdminSection): string {
  const value = phrase.value;
  return {
    projects: value.projects,
    events: value.events,
    diary: value.diary,
    pages: value.pages,
    tags: value.tags,
    files: value.asset_library,
    profile: value.about_me,
    settings: value.settings,
    updates: value.admin_updates,
    ai: value.ai_page,
  }[section];
}

function titleOf(kind: SearchKind, title: string) {
  return kind === 'diary-entry'
    ? formatAbsolutePublicDate(title, language.value.code)
    : publicText(title);
}

function hitRow(hit: SearchHit): Row {
  const titled = searchTitleIsSummary(hit);
  // A file called by its description finds nothing more to say by it.
  const find = hit.finds.find(
    (each) => !(titled && each.where === 'file' && !each.label),
  );
  const place = find ? searchFindPlace(find) : undefined;
  const page = find?.href ?? hit.href;
  const edit = hit.editHref;
  return {
    key: hit.ref,
    icon: SEARCH_KIND_ICONS[hit.kind],
    iconLabel: phrase.value.search_kind(hit.kind),
    title: searchHitTitle(hit),
    ...(hit.titleSegments ? { titleSegments: hit.titleSegments } : {}),
    ...(hit.parent ? { parent: publicText(hit.parent.title) } : {}),
    when: searchHitWhen(hit) || undefined,
    years: searchHitYears(hit) || undefined,
    access: searchAccessBadge(hit.access),
    ...(find && find.where !== 'title'
      ? {
          // Plain text needs no word for where it stands: the line is short.
          place: find.where === 'text' && !find.label ? undefined : place?.text,
          segments: find.segments,
        }
      : hit.file
        ? { detail: searchFileFacts(hit.file, size) }
        : hit.summary
          ? {
              detail: publicText(hit.summary),
              ...(hit.summarySegments
                ? { detailSegments: hit.summarySegments }
                : {}),
            }
          : {}),
    more: hit.more + Math.max(0, hit.finds.length - 1) || undefined,
    media: hit.media,
    preview: hit.kind === 'file',
    href: inAdmin.value && edit ? edit : page,
    other: inAdmin.value ? (edit ? page : undefined) : edit,
    // On the site, the owner's way to its editor without a key: a phone has
    // no Shift+Enter.
    otherIcon: !inAdmin.value && edit ? 'edit' : undefined,
  };
}

async function askAi(textToAsk: string) {
  try {
    const { sessionUuid } = await aiApi.start({ text: textToAsk });
    await navigateTo({ path: '/admin/ai/', query: { session: sessionUuid } });
  } catch (caught) {
    showToast(errorMessage(caught, phrase.value.ai_error));
  }
}

function actionRow(action: SearchAction, at: number): Row {
  const value = phrase.value;
  const key = `action:${action.type}:${at}`;
  switch (action.type) {
    case 'diary': {
      const day = formatAbsolutePublicDate(action.date, language.value.code);
      return {
        key,
        icon: 'thought',
        title: action.exists
          ? action.today
            ? value.search_action_diary_today
            : value.search_action_diary_day(day)
          : action.today
            ? value.search_action_diary_today_new
            : value.search_action_diary_day_new(day),
        href: action.href,
      };
    }
    case 'edit':
      return {
        key,
        icon: 'edit',
        title: value.search_action_edit(titleOf(action.kind, action.title)),
        href: action.href,
      };
    case 'view':
      return {
        key,
        icon: 'visibility',
        title: value.search_action_view(titleOf(action.kind, action.title)),
        href: action.href,
      };
    case 'recent':
      return {
        key,
        icon: SEARCH_KIND_ICONS[action.kind],
        iconLabel: value.search_kind(action.kind),
        title: titleOf(action.kind, action.title),
        access: searchAccessBadge(action.access),
        media: action.media,
        href: action.href,
      };
    case 'section':
      return {
        key,
        icon: SECTION_ICONS[action.section],
        title: sectionName(action.section),
        detail: value.search_action_section,
        href: action.href,
      };
    case 'create':
      return {
        key,
        icon: 'plus',
        title: {
          project: value.search_action_new_project,
          event: value.search_action_new_event,
          page: value.search_action_new_page,
        }[action.kind](publicText(action.title)),
        href: action.href,
      };
    case 'ask-ai':
      return {
        key,
        icon: 'sparkles',
        title: value.search_action_ask_ai(action.text),
        accent: true,
        run: () => askAi(action.text),
      };
  }
}

const sections = computed<Section[]>(() => {
  const answer = shown.value;
  const actions = (answer?.actions ?? []).map(actionRow);
  const typed = Boolean(query.value);
  const list: Section[] = [];
  if (!typed) {
    const recent = actions.filter((row) => row.key.startsWith('action:recent'));
    const first = actions.filter((row) => !recent.includes(row));
    if (first.length) list.push({ key: 'now', rows: first });
    if (recent.length)
      list.push({
        key: 'recent',
        heading: phrase.value.search_recent,
        rows: recent,
      });
    return list;
  }
  // A question asked of the model leads, as the server puts it first.
  const leading = actions.filter(
    (row, at) =>
      /^action:(diary|section):/u.test(row.key) ||
      (at === 0 && row.key.startsWith('action:ask-ai')),
  );
  const trailing = actions.filter((row) => !leading.includes(row));
  if (leading.length) list.push({ key: 'leading', rows: leading });
  for (const group of answer?.groups ?? [])
    list.push({
      key: group.kind,
      heading: phrase.value.search_kind_group(group.kind),
      rows: group.hits.map(hitRow),
    });
  if (trailing.length)
    list.push({
      key: 'trailing',
      heading: phrase.value.search_actions,
      rows: trailing,
    });
  return list;
});
const rows = computed(() => sections.value.flatMap((section) => section.rows));
const allResultsHref = computed(
  () => `/search/?q=${encodeURIComponent(query.value)}`,
);

const { listId, activeIndex, optionId, move, pointAt, current } = useActiveRow(
  () => rows.value.length,
  () => rows.value.map((row) => row.key).join('|'),
);
const rowIndex = computed(
  () => new Map(rows.value.map((row, index) => [row.key, index])),
);
/** Where each group starts: Tab goes from one to the next. */
const groupStarts = computed(() => {
  const starts: number[] = [];
  let at = 0;
  for (const section of sections.value) {
    if (section.rows.length) starts.push(at);
    at += section.rows.length;
  }
  return starts;
});

function moveGroup(step: 1 | -1) {
  const starts = groupStarts.value;
  if (starts.length < 2) return;
  const now = current();
  const here = starts.findLastIndex((start) => start <= now);
  // Back: to the start of this group first, when not on it already.
  const target =
    step < 0 && starts[here]! < now
      ? starts[here]!
      : starts[(here + step + starts.length) % starts.length]!;
  move(target - now);
}

function close() {
  open.value = false;
}

async function activate(row: Row | undefined, other = false) {
  if (!row) return;
  const href = other ? row.other : row.href;
  if (other && !href) return;
  close();
  opener = null;
  if (row.run && !other) await row.run();
  else if (href) await navigateTo(href);
}

/** A click goes where the link goes; the search only closes behind it. */
function onPick(row: Row, event: MouseEvent) {
  const target = event.target as Element | null;
  // Its own targets inside the row act on their own.
  if (target?.closest('[data-row-more], [data-row-other]')) return;
  if (row.href) {
    // A click for a new tab or window leaves the search where it is.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button)
      return;
    close();
    opener = null;
    return;
  }
  void activate(row);
}

/** A result's other places: on the search page, opened under it. */
function openPlaces(row: Row) {
  close();
  opener = null;
  void navigateTo({
    path: '/search/',
    query: { q: shown.value?.keyboard ?? query.value, open: row.key },
  });
}

function onKeyDown(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    move(1);
  } else if (event.key === 'Tab' && groupStarts.value.length > 1) {
    event.preventDefault();
    moveGroup(event.shiftKey ? -1 : 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    move(-1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      if (!query.value) return;
      close();
      opener = null;
      void navigateTo(allResultsHref.value);
      return;
    }
    void activate(rows.value[current()], event.shiftKey);
  }
}

/**
 * What the search says of its answer: read on the other keyboard, or found
 * for some of the words only. Under what to do, over what was found.
 */
const notes = computed(() => {
  const answer = shown.value;
  if (!answer || !rows.value.length) return [];
  return [
    ...(answer.keyboard ? [phrase.value.search_keyboard(answer.keyboard)] : []),
    ...(answer.partial ? [phrase.value.search_partial] : []),
  ];
});
const leads = computed(() => sections.value[0]?.key === 'leading');
</script>

<template>
  <FloatingPopup
    v-model:open="open"
    :anchor="anchor"
    placement="bottom-end"
    :fallback-placements="['bottom', 'bottom-start']"
    max-width="38rem"
    :arrow="anchorIsElement"
    complex
    @opened="focusField"
    @dismiss="onDismiss"
  >
    <div
      class="flex max-h-(--floating-popup-available-height) min-h-0 flex-col"
      :class="
        phone
          ? 'h-[calc(85dvh-2rem)]'
          : 'max-h-[min(36rem,var(--floating-popup-available-height))]'
      "
    >
      <form
        role="search"
        class="group relative flex shrink-0 items-center border-b
          border-border-1"
        @submit.prevent
      >
        <Icon
          name="search"
          class="pointer-events-none absolute left-3 text-base text-text-3
            transition group-focus-within:text-accent"
          aria-hidden="true"
        />
        <input
          ref="field"
          v-model="text"
          type="search"
          enterkeyhint="search"
          autocomplete="off"
          spellcheck="false"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="rows.length > 0"
          :aria-controls="listId"
          :aria-activedescendant="
            activeIndex >= 0 ? optionId(activeIndex) : undefined
          "
          :maxlength="SEARCH_QUERY_MAX_LENGTH"
          :placeholder="phrase.search_placeholder"
          :aria-label="phrase.search_placeholder"
          class="search-field h-12 w-full min-w-0 bg-transparent pr-12 pl-11
            text-base font-semibold outline-none placeholder:font-normal
            placeholder:text-text-3"
          @keydown="onKeyDown"
        />
        <Icon
          v-if="loading && text"
          name="loading"
          class="pointer-events-none absolute right-3 text-base text-text-3"
          aria-hidden="true"
        />
        <button
          v-else-if="text"
          type="button"
          class="absolute right-1 flex size-9 cursor-pointer items-center
            justify-center rounded-sm text-lg text-text-3 transition
            focus-visible:ring-2 focus-visible:ring-accent
            focus-visible:outline-none hocus:bg-bg-3 hocus:text-text-1"
          :aria-label="phrase.search_clear"
          :data-title-popup="phrase.search_clear"
          @click="
            text = '';
            field?.focus();
          "
        >
          <Icon name="close" />
        </button>
        <!-- A sheet closes by its handle too; this says so to a hand. -->
        <button
          v-else-if="phone"
          type="button"
          class="absolute right-1 flex size-9 cursor-pointer items-center
            justify-center rounded-sm text-lg text-text-3 transition
            focus-visible:ring-2 focus-visible:ring-accent
            focus-visible:outline-none hocus:bg-bg-3 hocus:text-text-1"
          :aria-label="phrase.close_modal"
          @click="close"
        >
          <Icon name="close" />
        </button>
      </form>

      <div
        class="scrollbar-hover min-h-0 flex-1 overflow-y-auto overscroll-contain
          p-1.5"
        aria-live="polite"
      >
        <template v-if="!leads">
          <p
            v-for="note in notes"
            :key="note"
            class="px-xs pb-1 text-xs text-text-3"
          >
            {{ note }}
          </p>
        </template>
        <div
          v-if="rows.length"
          :id="listId"
          role="listbox"
          :aria-label="phrase.search"
          class="flex flex-col gap-1.5 transition-opacity"
          :class="{ 'opacity-60': loading && shown?.query !== query }"
        >
          <template v-for="(section, at) in sections" :key="section.key">
            <!-- What to do with the query leads, over what the search says
                 of its answer, a line away from what was found. -->
            <div
              v-if="at === 1 && leads"
              role="presentation"
              class="flex flex-col gap-1 border-t border-border-1 px-xs pt-1.5"
            >
              <p v-for="note in notes" :key="note" class="text-xs text-text-3">
                {{ note }}
              </p>
            </div>
            <div
              role="group"
              :aria-label="section.heading"
              class="flex flex-col"
            >
              <span
                v-if="section.heading"
                class="px-xs pt-1.5 pb-1 text-xs font-bold tracking-wider
                  text-text-3 uppercase"
                aria-hidden="true"
                >{{ section.heading }}</span
              >
              <SearchQuickRow
                v-for="row in section.rows"
                :id="optionId(rowIndex.get(row.key)!)"
                :key="row.key"
                :row
                :active="activeIndex === rowIndex.get(row.key)"
                @point="pointAt($event, rowIndex.get(row.key)!)"
                @pick="onPick(row, $event)"
                @more="openPlaces(row)"
                @other="activate(row, true)"
              />
            </div>
          </template>
        </div>
        <p
          v-else-if="failed"
          class="flex items-center gap-xs px-xs py-sm text-sm text-text-error"
        >
          <Icon name="warning" class="shrink-0" />
          {{ phrase.search_failed }}
        </p>
        <div
          v-else-if="(query && shown && !loading) || !query"
          class="flex flex-col gap-sm px-xs py-sm text-sm"
        >
          <p v-if="query" class="flex flex-col gap-0.5">
            <span class="font-semibold text-text-1">{{
              phrase.search_empty
            }}</span>
            <span class="text-text-3">{{ phrase.search_quick_empty }}</span>
          </p>
          <p v-else class="text-text-3">{{ phrase.search_quick_hint }}</p>
          <!-- What the site is most about, as words to try. -->
          <div
            v-if="shown?.suggestions?.length"
            class="flex flex-wrap items-center gap-xs"
          >
            <span class="text-text-3">{{ phrase.search_try }}</span>
            <button
              v-for="word in shown.suggestions"
              :key="word"
              type="button"
              class="cursor-pointer rounded-full border border-border-1 px-sm
                py-0.5 font-semibold text-text-2 transition focus-visible:ring-2
                focus-visible:ring-accent focus-visible:outline-none
                hocus:border-border-2 hocus:text-text-1"
              @click="
                text = word;
                field?.focus();
              "
            >
              {{ publicText(word) }}
            </button>
          </div>
        </div>
      </div>

      <!-- How many were found, always the way to all of them: the keys are
           not told — the foot is for what was found. -->
      <footer
        v-if="query && shown?.total"
        class="flex shrink-0 items-center justify-end border-t border-border-1
          px-sm py-1.5"
        :class="{ 'pb-[calc(0.375rem+env(safe-area-inset-bottom))]': phone }"
      >
        <TheiLink
          :to="allResultsHref"
          class="flex items-center gap-1 rounded-sm px-1.5 py-1 text-sm
            font-semibold text-accent transition focus-visible:ring-2
            focus-visible:ring-accent focus-visible:outline-none
            hocus:bg-accent/10"
          :class="{ 'w-full justify-center': phone }"
          @click="close"
        >
          {{ phrase.search_all_results(shown.total) }}
          <Icon name="chevron-right" aria-hidden="true" />
        </TheiLink>
      </footer>
    </div>
  </FloatingPopup>
</template>

<style scoped>
.search-field::-webkit-search-cancel-button {
  appearance: none;
}
</style>

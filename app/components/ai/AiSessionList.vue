<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import {
  aiSessionStanding,
  type AiEntityRef,
  type AiSessionListResponse,
  type AiSessionItem,
} from '#layers/thei/shared/ai';
import ContentInlineLinkDecorator from '#layers/thei/app/components/content/ContentInlineLinkDecorator.vue';

/**
 * The owner's sessions, grouped by where they stand — pinned, waiting for
 * the owner, working, this week, earlier, and the archive last, its titles
 * faded — with a search, a filter and a new session at the top, and under
 * them what the month's answers have spent of its limit. Without a model, it says so first
 * and lists the sessions of apps.
 */
const props = defineProps<{
  selected?: string;
  modelReady: boolean;
  /** The month's tokens against the limit, and what an answer usually takes. */
  usage?: { month: number; limit: number; average: number | null };
  /** Only the sessions about this entity, as its form's menu asked. */
  about?: AiEntityRef;
}>();
const emit = defineEmits<{
  open: [sessionUuid: string];
  create: [];
  /** The entity's filter let go. */
  everything: [];
}>();

type Filter = 'all' | 'waiting' | 'applied' | 'rejected' | 'app' | 'template';
const FILTER_ICONS: Record<Filter, IconName> = {
  all: 'list-unordered',
  waiting: 'done-all',
  applied: 'check',
  rejected: 'close',
  app: 'key',
  template: 'template',
};

const aboutRoot = ref<HTMLElement | null>(null);
const linkResolver = useContentLinkResolver('admin');

const query = ref('');
const filter = ref<Filter>('all');
const sessions = ref<AiSessionItem[]>([]);
const next = ref<number | undefined>();
const loading = ref(false);
/**
 * Whether the list has come once. It is read in the browser only, where the
 * owner's own clock and zone say when a session was; until then it is not
 * yet empty.
 */
const loaded = ref(false);

function params(before?: number) {
  return {
    q: query.value.trim() || undefined,
    origin:
      filter.value === 'app' || filter.value === 'template'
        ? filter.value
        : !props.modelReady
          ? 'app'
          : undefined,
    waiting: filter.value === 'waiting' ? 'true' : undefined,
    applied: filter.value === 'applied' ? 'true' : undefined,
    rejected: filter.value === 'rejected' ? 'true' : undefined,
    about: props.about?.ref,
    before,
  };
}

/** Pages read with «more» since the list was last read from its start. */
let readMore = false;
/** Only the latest read is shown: an earlier one may answer after it. */
let reading = 0;

async function load(options: { fresh?: boolean } = {}) {
  const ticket = ++reading;
  if (options.fresh) readMore = false;
  loading.value = true;
  try {
    const page = await $fetch<AiSessionListResponse>('/api/admin/ai/sessions', {
      query: params(),
    });
    if (ticket !== reading) return;
    // Read again from its start, the list keeps what «more» brought after it.
    const oldest = page.sessions.at(-1)?.lastActiveAt;
    const kept = new Set(page.sessions.map((item) => item.sessionUuid));
    const tail =
      readMore && oldest !== undefined && page.next !== undefined
        ? sessions.value.filter(
            (item) => !kept.has(item.sessionUuid) && item.lastActiveAt < oldest,
          )
        : [];
    sessions.value = [...page.sessions, ...tail];
    if (!tail.length) next.value = page.next;
    loaded.value = true;
    setAiWaiting(page.waiting);
  } catch {
    // The list stays as it was; the next refresh tries again.
  } finally {
    if (ticket === reading) loading.value = false;
  }
}

async function more() {
  if (next.value === undefined) return;
  const ticket = reading;
  try {
    const page = await $fetch<AiSessionListResponse>('/api/admin/ai/sessions', {
      query: params(next.value),
    });
    if (ticket !== reading) return;
    const known = new Set(sessions.value.map((item) => item.sessionUuid));
    sessions.value = [
      ...sessions.value,
      ...page.sessions.filter((item) => !known.has(item.sessionUuid)),
    ];
    next.value = page.next;
    readMore = true;
  } catch (caught) {
    showToast(errorMessage(caught, phrase.value.ai_error));
  }
}

let typing: ReturnType<typeof setTimeout> | undefined;
watch(query, () => {
  if (typing) clearTimeout(typing);
  typing = setTimeout(() => load({ fresh: true }), 250);
});
watch([filter, () => props.modelReady, () => props.about?.ref], () =>
  load({ fresh: true }),
);

// The list follows what happens in sessions without a stream of its own.
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void load();
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void load();
  }, 5000);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  if (typing) clearTimeout(typing);
});
defineExpose({ refresh: load });

type Group = 'pinned' | 'waiting' | 'running' | 'week' | 'earlier' | 'archive';
const GROUP_ICONS: Partial<Record<Group, IconName>> = { pinned: 'star' };
function groupOf(item: AiSessionItem): Group {
  if (item.archivedAt) return 'archive';
  if (item.pinned) return 'pinned';
  const standing = aiSessionStanding(item);
  return standing === 'recent' ? 'week' : standing;
}
const groups = computed(() => {
  const order: Group[] = [
    'pinned',
    'waiting',
    'running',
    'week',
    'earlier',
    'archive',
  ];
  return order
    .map((group) => ({
      group,
      items: sessions.value.filter((item) => groupOf(item) === group),
    }))
    .filter((group) => group.items.length);
});

// ---- The filter -----------------------------------------------------------------

const filterOpen = ref(false);
const filterButton = ref<HTMLElement>();
function choose(value: Filter) {
  filter.value = value;
  filterOpen.value = false;
}

const spending = computed(() => {
  const usage = props.usage;
  if (!usage) return null;
  const share = usage.limit > 0 ? usage.month / usage.limit : 1;
  const amount = phrase.value.ai_usage_amount(
    compactAmount(usage.month),
    compactAmount(usage.limit),
  );
  return {
    share: Math.min(1, share),
    over: share >= 1,
    title: phrase.value.ai_usage_title(
      new Intl.DateTimeFormat(language.value.code, { month: 'long' }).format(
        new Date(),
      ),
    ),
    amount,
    hint: usage.average
      ? phrase.value.ai_usage_average(
          Math.round(usage.average),
          compactAmount(usage.average),
        )
      : undefined,
  };
});
</script>

<template>
  <aside
    class="flex min-h-0 w-full flex-col bg-bg-1 sm:w-72 sm:shrink-0 sm:border-r
      sm:border-border-1"
    :aria-label="phrase.ai_tab_sessions"
    data-session-list
  >
    <div class="flex items-center gap-1.5 px-2.5 pt-2.5 pb-1">
      <label class="relative min-w-0 flex-1">
        <Icon
          name="search"
          class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2
            text-sm text-text-3"
        />
        <input
          v-model="query"
          type="search"
          class="h-9 w-full rounded-normal border border-transparent bg-bg-2
            pr-9 pl-7 text-sm outline-none focus:border-border-2
            pointer-coarse:h-11 pointer-coarse:pr-12"
          :placeholder="phrase.ai_sessions_search"
          :aria-label="phrase.ai_sessions_search"
          data-session-search
        />
        <span class="absolute top-1/2 right-0.5 inline-flex -translate-y-1/2">
          <button
            ref="filterButton"
            type="button"
            class="flex size-8 cursor-pointer items-center justify-center
              rounded-md bg-transparent transition pointer-coarse:size-11
              popup-open:bg-bg-3 popup-open:text-accent hocus:text-accent"
            :class="filter === 'all' ? 'text-text-3' : 'text-accent'"
            aria-haspopup="listbox"
            :aria-expanded="filterOpen"
            :aria-label="phrase.ai_sessions_filter"
            :data-title-popup="phrase.ai_sessions_filter"
            data-session-filter
            @click="filterOpen = !filterOpen"
          >
            <Icon name="filter" />
          </button>
        </span>
      </label>
      <Button
        size="icon"
        class="bg-bg-accent! text-accent! pointer-coarse:size-11
          hocus:bg-accent! hocus:text-white! dark:hocus:text-bg-1!"
        :aria-label="phrase.ai_session_new"
        :data-title-popup="phrase.ai_session_new"
        data-session-new
        @click="emit('create')"
      >
        <Icon name="plus" />
      </Button>
    </div>

    <!-- The sessions about one entity only, until let go. -->
    <div
      v-if="about"
      class="flex min-w-0 items-center gap-1 px-2.5 pb-1 text-xs text-text-2"
      data-session-about
    >
      <span class="shrink-0">{{ phrase.ai_sessions_about }}</span>
      <span ref="aboutRoot" class="min-w-0 truncate">
        <AiEntityChip :entity="about" />
      </span>
      <ContentInlineLinkDecorator :root="aboutRoot" :resolver="linkResolver" />
      <Button
        variant="secondary"
        size="icon-sm"
        class="ml-auto bg-transparent pointer-coarse:size-11"
        :aria-label="phrase.ai_sessions_about_clear"
        :data-title-popup="phrase.ai_sessions_about_clear"
        data-session-about-clear
        @click="emit('everything')"
      >
        <Icon name="close" />
      </Button>
    </div>

    <div class="scrollbar-hover min-h-0 flex-1 overflow-y-auto px-1.5 pb-md">
      <div
        v-if="!modelReady"
        class="mx-1 mt-1.5 flex flex-col gap-2 rounded-normal border
          border-border-warning bg-bg-warning px-3 py-2.5 text-sm leading-snug"
        data-session-no-model
      >
        <b class="flex items-center gap-1.5"
          ><Icon name="warning" class="text-text-warning" />{{
            phrase.ai_no_model_title
          }}</b
        >
        <span>{{ phrase.ai_no_model_text }}</span>
        <TheiLink
          to="/admin/ai/?tab=connection"
          class="flex h-8 items-center gap-1.5 self-start rounded-normal
            bg-accent/80 px-sm text-sm font-semibold text-white dark:text-bg-1
            pointer-coarse:h-11 hocus:bg-accent"
          ><Icon name="power" />{{ phrase.ai_no_model_action }}</TheiLink
        >
      </div>

      <template v-for="{ group, items } in groups" :key="group">
        <p
          class="flex items-baseline gap-1 px-2 pt-3 pb-1 text-2xs text-text-3"
          :data-session-group="group"
        >
          <Icon
            v-if="GROUP_ICONS[group]"
            :name="GROUP_ICONS[group]!"
            class="self-center"
          /><b class="font-bold tracking-wider uppercase">{{
            phrase.ai_session_groups[group]
          }}</b>
          <span v-if="group === 'archive'" class="ml-auto truncate">{{
            phrase.ai_sessions_archive_note
          }}</span>
        </p>
        <button
          v-for="item in items"
          :key="item.sessionUuid"
          type="button"
          class="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto]
            items-center gap-x-1.5 rounded-md px-2 py-1.5 text-left transition
            pointer-coarse:px-2.5 pointer-coarse:py-2.5"
          :class="
            item.sessionUuid === selected
              ? 'bg-bg-accent'
              : 'bg-transparent hocus:bg-accent/8'
          "
          :aria-current="item.sessionUuid === selected ? 'true' : undefined"
          :data-title-popup="sessionTitle(item)"
          data-title-popup-clipped
          :data-session-item="item.sessionUuid"
          @click="emit('open', item.sessionUuid)"
        >
          <!-- The title alone; cut short, it is read whole on hover. -->
          <span
            class="truncate text-sm leading-5 pointer-coarse:text-base"
            :class="
              item.sessionUuid === selected
                ? 'text-accent'
                : item.archivedAt
                  ? 'text-text-3'
                  : ''
            "
            data-title-popup-clip
            >{{ sessionTitle(item) }}</span
          >
          <span class="flex items-center">
            <AiRunningDots
              v-if="item.state === 'running'"
              :label="phrase.ai_session_running"
            />
            <AiCount
              v-else-if="item.waiting"
              :count="item.waiting"
              :data-title-popup="phrase.ai_session_waiting(item.waiting)"
              data-session-waiting
            />
            <Icon
              v-else-if="item.applied && !item.archivedAt"
              name="check"
              class="text-text-success"
            />
          </span>
        </button>
      </template>

      <p
        v-if="!groups.length && loaded && !loading"
        class="px-2 pt-md text-center text-sm text-text-3"
      >
        {{
          query.trim() || filter !== 'all'
            ? phrase.admin_search_no_results
            : phrase.ai_sessions_empty
        }}
      </p>
      <button
        v-if="next !== undefined"
        type="button"
        class="mt-1 w-full cursor-pointer rounded-md bg-transparent py-2 text-sm
          text-text-2 hocus:text-accent"
        @click="more"
      >
        {{ phrase.ai_sessions_more }}
      </button>
    </div>

    <!-- What the month's answers have spent, always in sight. -->
    <div
      v-if="spending"
      class="border-t border-border-1 px-3 pt-2
        pb-[calc(var(--spacing)*2.5+env(safe-area-inset-bottom,0px))]"
      :tabindex="spending.hint ? 0 : undefined"
      :data-title-popup="spending.hint"
      data-session-usage
    >
      <p
        class="flex items-baseline justify-between gap-2 text-2xs leading-4
          text-text-2"
      >
        <span class="truncate">{{ spending.title }}</span>
        <span
          class="shrink-0 font-semibold tabular-nums"
          :class="spending.over ? 'text-text-error' : 'text-text-1'"
          >{{ spending.amount }}</span
        >
      </p>
      <div
        class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-3"
        role="meter"
        aria-valuemin="0"
        :aria-valuemax="usage!.limit"
        :aria-valuenow="Math.min(usage!.month, usage!.limit)"
        :aria-valuetext="spending.amount"
        :aria-label="spending.title"
      >
        <div
          class="h-full rounded-full transition-[width]"
          :class="spending.over ? 'bg-text-error' : 'bg-accent'"
          :style="{ width: `${Math.max(spending.share * 100, 1)}%` }"
        ></div>
      </div>
    </div>

    <FloatingPopup
      v-model:open="filterOpen"
      :anchor="filterButton ?? null"
      placement="bottom-end"
      max-width="18rem"
      density="list"
    >
      <div
        role="listbox"
        class="flex flex-col gap-0.5"
        data-session-filter-menu
      >
        <button
          v-for="(item, key) in phrase.ai_sessions_filters"
          :key="key"
          type="button"
          role="option"
          :aria-selected="filter === key"
          class="grid popup-item grid-cols-[auto_1fr_auto] items-center gap-y-0"
          :data-session-filter-option="key"
          @click="choose(key as Filter)"
        >
          <Icon
            :name="FILTER_ICONS[key as Filter]"
            class="row-span-2"
            :class="filter === key ? 'text-accent' : 'text-text-2'"
          />
          <b
            class="text-sm font-semibold"
            :class="{ 'text-accent': filter === key }"
            >{{ item.title }}</b
          >
          <Icon
            name="check"
            class="row-span-2 text-accent"
            :class="{ invisible: filter !== key }"
          />
          <span v-if="item.hint" class="col-start-2 text-xs text-text-3">{{
            item.hint
          }}</span>
        </button>
      </div>
    </FloatingPopup>
  </aside>
</template>

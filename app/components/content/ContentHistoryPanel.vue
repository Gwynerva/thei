<script lang="ts" setup>
import type { ContentOutputData } from '#layers/thei/shared/content';
import {
  contentHistoryStats,
  isLargeContentDrop,
  type ContentHistoryEntryMeta,
  type ContentHistoryStats,
} from '#layers/thei/shared/content-history';
import {
  groupHistoryByDay,
  type EditorHistorySession,
} from '#layers/thei/app/composables/content-history/session';
import {
  openedRestoreTarget,
  revisionRestoreTarget,
  type RestoreTarget,
} from '#layers/thei/app/composables/content-history/restore-target';
import ContentStatsDelta from '#layers/thei/app/components/content/ContentStatsDelta.vue';
import { useHistoryTimeLabels } from '#layers/thei/app/composables/content-history/time-labels';

/**
 * The versions of a text, one line each: when it was written and how much
 * it differs from the text now. Choosing one does not restore it: the editor
 * asks first, showing what would change and why the version was kept.
 */
const props = defineProps<{
  session: EditorHistorySession;
  /** The text as it is now. */
  current: ContentHistoryStats;
  currentKey: string;
  /** The text as the editor opened with it. */
  opened?: { data: ContentOutputData; key: string };
}>();

const emit = defineEmits<{ choose: [target: RestoreTarget] }>();

const entries = shallowRef<ContentHistoryEntryMeta[]>();
const listError = ref(false);
const list = useTemplateRef<HTMLElement>('list');
const { time, dayLabel } = useHistoryTimeLabels();

const openedStats = computed(() =>
  props.opened ? contentHistoryStats(props.opened.data) : undefined,
);
const showOpened = computed(
  () => props.opened && props.opened.key !== props.currentKey,
);
const groups = computed(() => groupHistoryByDay(entries.value ?? []));

onMounted(async () => {
  try {
    entries.value = (await props.session.loadHistory()).revisions;
  } catch {
    listError.value = true;
    entries.value = [];
  }
  await nextTick();
  // The list is a dialog: focus goes into it, onto the first way back.
  list.value?.querySelector<HTMLElement>('button')?.focus({
    preventScroll: true,
  });
});

function chooseRevision(entry: ContentHistoryEntryMeta) {
  emit('choose', revisionRestoreTarget(entry, props.session));
}

function chooseOpened() {
  if (props.opened) emit('choose', openedRestoreTarget(props.opened.data));
}

/** Restoring it would lose a noticeable part of the text now. */
function losesMuch(stats: ContentHistoryStats) {
  return isLargeContentDrop(props.current, stats);
}

function changesLabel(stats: ContentHistoryStats) {
  const text = phrase.value;
  return [
    text.content_history_delta(
      text.content_block_count(stats.blockCount),
      stats.blockCount - props.current.blockCount,
    ),
    text.content_history_delta(
      text.content_word_count(stats.wordCount),
      stats.wordCount - props.current.wordCount,
    ),
    text.content_history_delta(
      text.content_file_count(stats.assetCount),
      stats.assetCount - props.current.assetCount,
    ),
  ].join('; ');
}

function rowLabel(entry: ContentHistoryEntryMeta) {
  return phrase.value.content_history_row_label(
    `${dayLabel(entry.updatedAt)}, ${time(entry.updatedAt)}`,
    changesLabel(entry),
  );
}

const row =
  'flex min-h-9 w-full cursor-pointer items-center justify-between gap-sm rounded-normal px-xs text-left transition-colors hocus:bg-bg-3';
</script>

<template>
  <div
    ref="list"
    role="dialog"
    :aria-label="phrase.content_history"
    class="flex scrollbar-mini
      max-h-[min(22rem,var(--floating-popup-available-height))] w-64 max-w-full
      flex-col gap-xs overflow-y-auto p-xs text-sm"
    data-content-history-panel
  >
    <div v-if="!entries" class="flex justify-center p-sm text-text-3">
      <Icon name="loading" />
    </div>

    <template v-else>
      <button
        v-if="showOpened && openedStats"
        type="button"
        data-history-row="opened"
        :aria-label="`${phrase.content_history_opened_version}: ${changesLabel(openedStats)}`"
        :class="row"
        @click="chooseOpened"
      >
        <span class="min-w-0 truncate text-text-1">{{
          phrase.content_history_opened_version
        }}</span>
        <ContentStatsDelta
          :from="current"
          :to="openedStats"
          :class="losesMuch(openedStats) ? 'text-text-warning' : 'text-text-3'"
          aria-hidden="true"
        />
      </button>

      <div v-for="group in groups" :key="group.dayStart" class="flex flex-col">
        <div
          class="px-xs pt-1 pb-0.5 text-xs text-text-3 first-letter:uppercase"
        >
          {{ dayLabel(group.dayStart) }}
        </div>
        <button
          v-for="entry in group.entries"
          :key="entry.id"
          type="button"
          data-history-row="version"
          :aria-label="rowLabel(entry)"
          :class="row"
          @click="chooseRevision(entry)"
        >
          <span class="shrink-0 text-text-1 tabular-nums">{{
            time(entry.updatedAt)
          }}</span>
          <ContentStatsDelta
            :from="current"
            :to="entry"
            :class="losesMuch(entry) ? 'text-text-warning' : 'text-text-3'"
            aria-hidden="true"
          />
        </button>
      </div>

      <p
        v-if="!groups.length && !showOpened"
        class="px-xs py-sm text-xs text-text-3"
      >
        {{
          listError
            ? phrase.content_history_unavailable
            : phrase.content_history_empty
        }}
      </p>
    </template>
  </div>
</template>

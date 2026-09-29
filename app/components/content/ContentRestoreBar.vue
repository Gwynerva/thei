<script lang="ts" setup>
import {
  contentSemanticKey,
  type ContentOutputData,
} from '#layers/thei/shared/content';
import {
  isLargeContentDrop,
  type ContentHistoryStats,
} from '#layers/thei/shared/content-history';
import type { EditorHistorySession } from '#layers/thei/app/composables/content-history/session';
import type { RestoreTarget } from '#layers/thei/app/composables/content-history/restore-target';
import { useHistoryTimeLabels } from '#layers/thei/app/composables/content-history/time-labels';
import { registerDismissLayer } from '#layers/thei/app/composables/modal';
import ModalHeaderButton from '#layers/thei/app/modals/ModalHeaderButton.vue';
import ContentStatsDelta from '#layers/thei/app/components/content/ContentStatsDelta.vue';

/**
 * The question before a restore. Until it is answered it is the editor's
 * whole header, laid out like the header it replaces: what is asked and the
 * answer buttons on top, when and how much below.
 *
 * The text below shows what the restore would change and scrolls freely
 * under it. Nothing in the editor changes until the restore is confirmed.
 */
const props = defineProps<{
  session: EditorHistorySession;
  target: RestoreTarget;
  /** The text as it is now. */
  current: ContentHistoryStats;
  currentKey: string;
  /** Reached from the list of versions, so it can go back to it. */
  fromList: boolean;
  /** What went wrong in the editor, shown here while this is the header. */
  error?: string;
}>();

const emit = defineEmits<{
  restored: [label: string];
  /** Back to the list of versions. */
  back: [];
  close: [];
  /**
   * The version, once loaded, for the text to be shown marked with what
   * restoring it would change; `undefined` while there is none.
   */
  preview: [data: ContentOutputData | undefined];
}>();

const loaded = shallowRef<{
  data: ContentOutputData;
  key: string;
  missingAssets: number;
}>();
const loadError = ref(false);
const restoring = ref(false);
const title = useTemplateRef<HTMLElement>('title');
const { time, dayLabel } = useHistoryTimeLabels();
const compactNumber = useCompactNumber();
const sameAsCurrent = computed(() => loaded.value?.key === props.currentKey);
const losesMuch = computed(() =>
  isLargeContentDrop(props.current, props.target.stats),
);
let loadRequest = 0;
// Escape and Back step out of the question before they close the editor.
const removeDismissLayer = registerDismissLayer(() =>
  props.fromList ? emit('back') : emit('close'),
);

watch(
  () => props.target,
  async (target) => {
    const request = ++loadRequest;
    loaded.value = undefined;
    loadError.value = false;
    emit('preview', undefined);
    await nextTick();
    title.value?.focus({ preventScroll: true });
    try {
      const { data, missingAssets } = await target.load();
      if (request !== loadRequest) return;
      loaded.value = { data, key: contentSemanticKey(data), missingAssets };
      emit('preview', data);
    } catch {
      if (request === loadRequest) loadError.value = true;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  loadRequest++;
  removeDismissLayer();
  emit('preview', undefined);
});

const heading = computed(() => {
  const target = props.target;
  if (target.kind === 'opened')
    return phrase.value.content_history_opened_version;
  if (target.kind === 'offer')
    return phrase.value.content_draft_chip(time(target.time!));
  return phrase.value.content_restore_title(time(target.time!));
});

const detail = computed(() => {
  const target = props.target;
  return [
    target.time ? dayLabel(target.time) : '',
    target.reason && target.reason !== 'auto'
      ? phrase.value.content_history_reasons[target.reason]
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
});

/** The full comparison, for the tooltip and for screen readers. */
const comparison = computed(() =>
  (
    [
      ['content_block_count', 'blockCount'],
      ['content_word_count', 'wordCount'],
      ['content_file_count', 'assetCount'],
    ] as const
  )
    .map(
      ([label, key]) =>
        `${phrase.value[label](props.current[key])} → ${compactNumber(props.target.stats[key])}`,
    )
    .join(' · '),
);

async function restore() {
  const value = loaded.value;
  if (!value || restoring.value || sameAsCurrent.value) return;
  restoring.value = true;
  try {
    const restored = await props.session.restore(value.data, {
      adoptRef: props.target.adoptRef,
    });
    if (restored) emit('restored', heading.value);
  } finally {
    restoring.value = false;
  }
}
</script>

<template>
  <div
    role="group"
    aria-labelledby="content-restore-title"
    class="flex min-w-0 flex-col gap-xs"
    data-restore-bar
  >
    <div class="flex min-w-0 items-center gap-xs">
      <!-- One way out: back where the question came from — the list of
           versions, or the editor when it came from the offered draft. -->
      <ModalHeaderButton
        icon="chevron-left"
        :label="
          fromList ? phrase.content_history_back : phrase.content_restore_cancel
        "
        data-restore-back
        @click="fromList ? emit('back') : emit('close')"
      />
      <div
        id="content-restore-title"
        ref="title"
        tabindex="-1"
        class="min-w-0 flex-1 truncate font-semibold tracking-tight text-text-2
          outline-none"
      >
        {{ heading }}
      </div>
      <ModalHeaderButton
        variant="accent"
        :label="phrase.content_restore"
        :disabled="!loaded || restoring || sameAsCurrent"
        :data-title-popup="phrase.content_restore_keeps_current"
        data-restore-confirm
        @click="restore"
      >
        <Icon v-if="restoring || (!loaded && !loadError)" name="loading" />
        {{ phrase.content_restore }}
      </ModalHeaderButton>
    </div>

    <div
      class="flex min-w-0 items-center justify-between gap-sm text-xs
        text-text-3"
    >
      <span class="min-w-0 truncate first-letter:uppercase">{{ detail }}</span>
      <span
        class="shrink-0"
        :data-title-popup="comparison"
        :aria-label="comparison"
        role="img"
      >
        <ContentStatsDelta
          :from="current"
          :to="target.stats"
          :class="losesMuch ? 'text-text-warning' : undefined"
          aria-hidden="true"
        />
      </span>
    </div>

    <p
      v-if="
        error || loadError || loaded?.missingAssets || (loaded && sameAsCurrent)
      "
      class="flex min-w-0 flex-wrap items-center gap-x-sm gap-y-1 text-xs"
      data-restore-notes
    >
      <span v-if="error" class="text-text-error">{{ error }}</span>
      <span v-if="loadError" class="text-text-error">{{
        phrase.content_history_load_error
      }}</span>
      <span
        v-if="loaded?.missingAssets"
        class="inline-flex items-center gap-1 text-text-warning"
      >
        <Icon name="warning" class="shrink-0" />
        {{ phrase.content_history_missing_assets(loaded.missingAssets) }}
      </span>
      <span v-if="loaded && sameAsCurrent" class="text-text-3">{{
        phrase.content_restore_same
      }}</span>
    </p>
  </div>
</template>

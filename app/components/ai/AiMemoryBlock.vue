<script lang="ts" setup>
import type { AiMemoryItem } from '#layers/thei/shared/ai-memory';

/**
 * What the AI remembers of the entity a form edits, above the owner's notes:
 * the model's own few lines about it, kept while it is unchanged, then what
 * the owner asked it to remember and what never to offer — each said anew
 * or let go in place — and which parts of it have records of their own.
 * A model reads all of it only when it works with this entity. It shows
 * once there is something to show; the «+» of the ✦ menu adds the first.
 */
const ai = useEntityAi();
const memory = computed(() => ai?.panel.value?.memory);
/** «With this project», as the hint says when a model reads it. */
const withName = computed(
  () =>
    phrase.value.ai_entity_with[
      memory.value?.entity.type as keyof typeof phrase.value.ai_entity_with
    ] ?? '',
);
const { hidden, forget } = useUndoableForget();
const items = computed(() =>
  (memory.value?.items ?? []).filter(
    (item) => !hidden.value.has(item.memoryUuid),
  ),
);
const parts = computed(() => ai?.panel.value?.parts ?? []);
const digest = computed(() => memory.value?.digest);
const shown = computed(
  () =>
    ai?.shown.value &&
    (items.value.length > 0 || Boolean(digest.value) || parts.value.length > 0),
);

function forgetRecord(item: AiMemoryItem) {
  forget(item.memoryUuid, () =>
    sendDelete(`/api/admin/ai/memory/${item.memoryUuid}`),
  );
}

function saved() {
  void ai?.refresh();
}

const addButton = ref<{ element: HTMLElement | null }>();
const remembering = ref(false);
</script>

<template>
  <div v-if="ai && shown" data-ai-memory-block>
    <SectionHeader
      icon="brain"
      :title="phrase.ai_memory_block_title"
      :description="phrase.ai_memory_block_hint(withName)"
      class="mb-md"
    >
      <template #action>
        <SectionAddButton
          ref="addButton"
          :label="phrase.ai_remember_title"
          :expanded="remembering"
          data-memory-add
          @click="remembering = !remembering"
        />
      </template>
    </SectionHeader>
    <Box class="flex flex-col overflow-hidden">
      <!-- The model's own few lines, read instead of the whole while it
           holds. -->
      <div
        v-if="digest"
        class="m-sm flex items-start gap-2.5 rounded-normal border border-dashed
          border-border-2 bg-bg-1 px-3 py-2.5 text-sm leading-normal sm:m-md"
        data-ai-digest
      >
        <Icon name="sparkles" class="mt-0.5 shrink-0 text-accent" />
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="wrap-anywhere">{{ publicText(digest.text) }}</span>
          <span class="text-xs text-text-2">{{
            digest.fresh
              ? phrase.ai_memory_digest_fresh(shortWhen(digest.at))
              : phrase.ai_memory_digest_stale(shortWhen(digest.at))
          }}</span>
        </div>
      </div>

      <AiMemoryRecord
        v-for="item in items"
        :key="item.memoryUuid"
        :item
        :about="memory?.entity"
        @forget="forgetRecord(item)"
        @saved="saved"
      />

      <div
        v-if="parts.length"
        class="flex flex-wrap items-center gap-1.5 border-t border-border-1/70
          px-sm py-2.5 text-xs text-text-2"
        data-ai-memory-parts
      >
        <span>{{ phrase.ai_memory_parts }}</span>
        <TheiLink
          v-for="part in parts"
          :key="part.entity.ref"
          :to="part.entity.path ?? ''"
          class="inline-flex h-7 max-w-full items-center gap-1 rounded-full
            bg-bg-3 px-2.5 font-semibold text-text-1 transition-colors
            pointer-coarse:h-9 hocus:bg-bg-accent hocus:text-accent"
          data-ai-memory-part
        >
          <Icon name="project-section" class="shrink-0 text-text-2" />
          <span class="truncate">{{ publicText(part.entity.title) }}</span>
          <span class="shrink-0 text-text-3">· {{ part.count }}</span>
        </TheiLink>
      </div>
    </Box>
    <AiRememberPopup
      v-model:open="remembering"
      :anchor="addButton?.element ?? null"
    />
  </div>
</template>

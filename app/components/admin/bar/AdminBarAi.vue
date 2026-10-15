<script lang="ts" setup>
import type { AiSessionItem } from '#layers/thei/shared/ai';

/**
 * The ✦ of the admin bar, from any admin page: how much waits for the
 * owner, and in its menu the sessions that wait and a new session — about
 * the entity whose form is open, or about nothing in particular.
 */
const waiting = useAiWaiting();
const inHand = useAiEntitiesInHand();
const entity = computed(() => inHand.value.at(-1));

const button = ref<HTMLElement>();
const open = ref(false);
const sessions = ref<AiSessionItem[]>([]);

watch(open, async (opened) => {
  if (!opened) return;
  sessions.value = await aiApi.waitingSessions();
});

function start(about?: string) {
  open.value = false;
  void navigateTo({
    path: '/admin/ai/',
    query: { session: 'new', ...(about ? { about } : {}) },
  });
}
</script>

<template>
  <button
    ref="button"
    type="button"
    class="flex h-full shrink-0 cursor-pointer items-center gap-2 bg-transparent
      px-2 opacity-80 transition max-xs:gap-1.5 max-xs:px-1.5 sm:gap-3 sm:px-3
      hocus:bg-accent/25 hocus:opacity-100"
    :aria-label="phrase.ai_bar_waiting(waiting)"
    :data-title-popup="phrase.ai_bar_waiting(waiting)"
    aria-haspopup="dialog"
    :aria-expanded="open"
    data-ai-bar
    @click="open = !open"
  >
    <Icon
      name="sparkles"
      class="shrink-0 text-xl max-xs:text-lg"
      aria-hidden="true"
    />
    <AiCount v-if="waiting" :count="waiting" tone="inverse" data-ai-bar-count />
  </button>

  <FloatingPopup
    v-if="open"
    v-model:open="open"
    :anchor="button ?? null"
    placement="bottom-end"
    max-width="22rem"
  >
    <AiSessionsMenu
      :heading="phrase.ai_bar_waiting_title(waiting)"
      heading-icon="done-all"
      :sessions
      :empty="waiting ? undefined : phrase.ai_bar_nothing_waits"
      :more="{ to: '/admin/ai/', label: phrase.ai_bar_all_sessions }"
      data-ai-bar-menu
      @close="open = false"
    >
      <Button
        class="flex h-9 items-center justify-center gap-xs font-semibold
          pointer-coarse:h-11"
        data-ai-bar-start
        @click="start(entity?.ref)"
      >
        <Icon name="ai-chat" class="shrink-0" />
        <span class="truncate">{{
          entity?.title
            ? phrase.ai_entity_new_session(
                entity.ref.startsWith('diary-entry:')
                  ? entityListName({ date: entity.title })
                  : publicText(entity.title),
              )
            : phrase.ai_session_new
        }}</span>
      </Button>
      <Button
        v-if="entity"
        variant="secondary"
        class="flex h-9 items-center justify-center gap-xs bg-transparent
          pointer-coarse:h-11"
        data-ai-bar-start-plain
        @click="start()"
      >
        <Icon name="plus" class="shrink-0" />{{ phrase.ai_bar_new_plain }}
      </Button>
    </AiSessionsMenu>
  </FloatingPopup>
</template>

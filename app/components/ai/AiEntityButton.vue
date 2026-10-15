<script lang="ts" setup>
/**
 * The ✦ of a form's header: the AI and the entity in hand. Its badge counts
 * the proposals waiting in the form; its menu starts a session about the
 * entity, remembers something of it, runs a template from it, and lists
 * the sessions about it. Nothing with AI off, or before the entity exists.
 * What is remembered of the owner is «about you», on the memory tab: the
 * profile's menu remembers nothing itself.
 */
const ai = useEntityAi();
const panel = computed(() => ai?.panel.value);
/** «This project», as the menu's button names it. */
const kindName = computed(() => {
  const kind = ai?.ref.value?.split(':')[0] ?? '';
  return (
    phrase.value.ai_entity_this[
      kind as keyof typeof phrase.value.ai_entity_this
    ] ?? ''
  );
});
const waiting = computed(() => ai?.offers.value.length ?? 0);
const title = computed(() =>
  publicText(panel.value?.memory.entity.title ?? ''),
);

const button = ref<HTMLElement>();
const open = ref(false);
const remembering = ref(false);

function startSession() {
  open.value = false;
  void navigateTo({
    path: '/admin/ai/',
    query: { session: 'new', about: ai?.ref.value },
  });
}

function remember() {
  open.value = false;
  remembering.value = true;
}

const running = ref<string>();
async function runTemplate(templateId: string) {
  if (running.value || !ai?.ref.value) return;
  running.value = templateId;
  try {
    const { sessionUuid } = await $fetch<{ sessionUuid: string }>(
      `/api/admin/ai/templates/${encodeURIComponent(templateId)}/run`,
      {
        method: 'POST',
        body: {
          from: ai.ref.value,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      },
    );
    open.value = false;
    await navigateTo({ path: '/admin/ai/', query: { session: sessionUuid } });
  } catch (caught) {
    showToast(errorMessage(caught, phrase.value.ai_error));
  } finally {
    running.value = undefined;
  }
}
</script>

<template>
  <template v-if="ai?.shown.value">
    <span ref="button" class="relative inline-flex">
      <Button
        variant="secondary"
        size="icon"
        :aria-label="phrase.ai_entity_menu(kindName)"
        :data-title-popup="phrase.ai_entity_menu(kindName)"
        aria-haspopup="dialog"
        :aria-expanded="open"
        data-ai-entity
        @click="open = !open"
      >
        <Icon name="sparkles" class="text-accent" />
      </Button>
      <AiCount
        v-if="waiting"
        :count="waiting"
        class="pointer-events-none absolute -top-1 -right-1"
        data-ai-entity-count
      />
    </span>

    <FloatingPopup
      v-if="open"
      v-model:open="open"
      :anchor="button ?? null"
      placement="bottom-end"
      max-width="22rem"
    >
      <AiSessionsMenu
        :heading="phrase.ai_entity_sessions(panel?.sessionCount ?? 0)"
        heading-icon="ai-chat"
        :sessions="panel?.sessions ?? []"
        :empty="
          panel?.sessions.length ? undefined : phrase.ai_entity_no_sessions
        "
        :more="
          (panel?.sessionCount ?? 0) > (panel?.sessions.length ?? 0)
            ? {
                to: { path: '/admin/ai/', query: { about: ai.ref.value } },
                label: phrase.ai_entity_all_sessions,
              }
            : undefined
        "
        data-ai-entity-menu
        @close="open = false"
      >
        <Button
          class="flex h-9 items-center justify-center gap-xs font-semibold
            pointer-coarse:h-11"
          data-ai-entity-start
          @click="startSession"
        >
          <Icon name="ai-chat" class="shrink-0" />
          <span class="truncate">{{
            title ? phrase.ai_entity_new_session(title) : phrase.ai_new_title
          }}</span>
        </Button>
        <Button
          v-if="ai.ref.value !== 'profile'"
          variant="secondary"
          class="flex h-9 items-center justify-center gap-xs bg-transparent
            pointer-coarse:h-11"
          data-ai-entity-remember
          @click="remember"
        >
          <Icon name="brain" class="shrink-0" />{{ phrase.ai_remember_title }}…
        </Button>
        <div
          v-if="panel?.modelReady && panel.templates.length"
          class="flex flex-wrap gap-1"
        >
          <Button
            v-for="template in panel.templates"
            :key="template.templateId"
            variant="secondary"
            class="flex h-7 min-w-0 items-center gap-1 px-2 text-xs
              pointer-coarse:h-11"
            :disabled="Boolean(running)"
            :data-ai-entity-template="template.templateId"
            @click="runTemplate(template.templateId)"
          >
            <Icon
              :name="running === template.templateId ? 'loading' : 'template'"
              class="shrink-0"
            />
            <span class="truncate">{{ publicText(template.title) }}</span>
          </Button>
        </div>
      </AiSessionsMenu>
    </FloatingPopup>

    <AiRememberPopup v-model:open="remembering" :anchor="button ?? null" />
  </template>
</template>

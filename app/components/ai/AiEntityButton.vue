<script lang="ts" setup>
import {
  newSessionLocation,
  type AiComposerExpose,
  type AiComposerFile,
} from '#layers/thei/app/composables/ai-session';
import type { AiPresetItem } from '#layers/thei/shared/ai-template';
import type { ContentEntityType } from '#layers/thei/shared/content-link';

/**
 * The ✦ of a form's header: the AI and the entity in hand. Its badge counts
 * the proposals waiting in the form; its menu has a message to write about
 * the entity — named in it already — with the ready-made requests offered
 * for its kind, then the sessions about it, and a way to remember something
 * of it. Sent, the session goes on in the background and the page stays:
 * its proposals come to the fields' labels as they are made. Nothing with
 * AI off, or before the entity exists. What is remembered of the owner is
 * «about you», on the memory tab: the profile's menu remembers nothing.
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

/** The ✦ itself, which its popups point at and mark as open. */
const trigger = useTemplateRef<{ $el: HTMLElement }>('trigger');
const button = computed(() => trigger.value?.$el);
const open = ref(false);
const remembering = ref(false);
const composer = ref<AiComposerExpose>();

/** The entity named in the message, as it opens. */
function nameEntity() {
  const entity = panel.value?.memory.entity;
  if (!entity || entity.type === 'profile' || entity.type === 'asset') return;
  const day = entity.ref.split(':')[1] ?? '';
  composer.value?.mention({
    entityType: entity.type as ContentEntityType,
    entityId: entity.id,
    title: entity.title,
    ...(entity.type === 'diary-entry' && /^\d{4}-\d{2}-\d{2}$/.test(day)
      ? { date: day }
      : {}),
  });
}

// Each message field opened names the entity once, when both are there.
const named = new WeakSet<object>();
watch([composer, () => panel.value?.memory.entity.ref], ([field, ref]) => {
  if (!field || !ref || named.has(field)) return;
  named.add(field);
  nameEntity();
});

function remember() {
  open.value = false;
  remembering.value = true;
}

function usePreset(preset: AiPresetItem) {
  composer.value?.prefill(preset.instruction, preset.templateId);
}

/** The session sent from here, followed while the page stays. */
const sent = ref<string>();
const followed = useAiSession(sent);
const sentSession = computed(() => followed.detail.value?.session);
const sending = ref(false);

async function send(
  text: string,
  mentioned: string[],
  files: AiComposerFile[],
  restore: () => void,
  templateId: string | undefined,
) {
  if (!ai?.ref.value || sending.value) return;
  sending.value = true;
  try {
    const { sessionUuid } = await aiApi.start({
      text,
      files,
      about: [...new Set([ai.ref.value, ...mentioned])],
      templateId,
    });
    sent.value = sessionUuid;
    nameEntity();
    void ai.refresh();
  } catch (caught) {
    restore();
    showToast(errorMessage(caught, phrase.value.ai_error));
  } finally {
    sending.value = false;
  }
}

// What the session proposes reaches the form's labels as it is made.
watch(
  () => [
    followed.detail.value?.actions.length ?? 0,
    sentSession.value?.state,
    sentSession.value?.waiting,
  ],
  (now, before) => {
    if (before && now.join() !== before.join()) void ai?.refresh();
  },
);

/**
 * A new session on the AI page, about this entity — with the words of the
 * ready-made request chosen here, if one was.
 */
function openFull() {
  open.value = false;
  void navigateTo(
    newSessionLocation({
      about: ai?.ref.value,
      template: composer.value?.templateId(),
    }),
  );
}
</script>

<template>
  <template v-if="ai?.shown.value">
    <span class="relative inline-flex">
      <Button
        ref="trigger"
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
      v-model:open="open"
      :anchor="button ?? null"
      placement="bottom-end"
      max-width="24rem"
      complex
      @opened="composer?.focus()"
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
        <AiComposer
          ref="composer"
          :busy="sending"
          :disabled="!panel?.modelReady"
          :placeholder="
            panel?.modelReady
              ? phrase.ai_composer_placeholder
              : phrase.ai_no_model_title
          "
          data-ai-entity-composer
          @send="send"
        />
        <AiPresetChips
          v-if="panel?.modelReady"
          :presets="panel.templates"
          :heading="phrase.ai_templates_presets"
          @choose="usePreset"
        />
        <TheiLink
          v-if="sentSession"
          :to="{
            path: '/admin/ai/',
            query: { session: sentSession.sessionUuid },
          }"
          class="flex min-w-0 items-center gap-xs rounded-sm border
            border-border-1 bg-bg-1 px-2 py-1.5 text-sm transition
            hocus:border-border-3"
          data-ai-entity-sent
          @click="open = false"
        >
          <AiRunningDots v-if="sentSession.state === 'running'" />
          <Icon v-else name="sparkles" class="shrink-0 text-accent" />
          <span class="min-w-0 flex-1 truncate">{{
            publicText(sentSession.title)
          }}</span>
          <b
            v-if="sentSession.waiting"
            class="shrink-0 text-xs font-semibold text-accent"
            >{{ phrase.ai_session_waiting(sentSession.waiting) }}</b
          >
          <Icon name="chevron-right" class="shrink-0 text-text-3" />
        </TheiLink>
        <div class="flex gap-1">
          <Button
            v-if="ai.ref.value !== 'profile'"
            variant="secondary"
            class="flex h-9 flex-1 items-center justify-center gap-xs
              bg-transparent pointer-coarse:h-11"
            data-ai-entity-remember
            @click="remember"
          >
            <Icon name="brain" class="shrink-0" />{{
              phrase.ai_remember_title
            }}…
          </Button>
          <Button
            variant="secondary"
            class="flex h-9 flex-1 items-center justify-center gap-xs
              bg-transparent pointer-coarse:h-11"
            data-ai-entity-start
            @click="openFull"
          >
            <Icon name="ai-chat" class="shrink-0" />{{ phrase.ai_open_full }}
          </Button>
        </div>
      </AiSessionsMenu>
    </FloatingPopup>

    <AiRememberPopup v-model:open="remembering" :anchor="button ?? null" />
  </template>
</template>

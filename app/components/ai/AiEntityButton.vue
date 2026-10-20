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
 * the entity — named in it already — with every ready-made request to
 * start from: a built-in check sent from it runs on the entity, narrowed by
 * the words added; then the sessions about it, and a way to remember
 * something of it. Sent, the session goes on in the background and the page stays:
 * its proposals come to the fields' labels as they are made, and while it
 * answers it can be stopped from here, as any session about the entity
 * that is answering. Nothing with
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

/** The session sent from here, followed while the page stays. */
const sent = ref<string>();
const followed = useAiSession(sent);
const sentSession = computed(() => followed.detail.value?.session);
const sending = ref(false);

function usePreset(preset: AiPresetItem) {
  composer.value?.prefill(preset.instruction, preset.templateId);
}

/** A built-in check sent from here runs on the entity, narrowed by the words. */
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
    await startAiSession(
      {
        text,
        about: [...new Set([ai.ref.value, ...mentioned])],
        files,
        restore,
        templateId,
      },
      {
        presets: panel.value?.templates ?? [],
        // The session started shows in the menu, which stays open for it.
        started: (sessionUuid) => {
          sent.value = sessionUuid;
          open.value = true;
          nameEntity();
          void ai.refresh();
        },
      },
    );
  } finally {
    sending.value = false;
  }
}

/** Stops a session answering; the list says so once it has stopped. */
async function stop(sessionUuid: string) {
  await aiAttempt(async () => {
    await aiApi.stop(sessionUuid);
    void ai?.refresh();
  });
}

/**
 * Once what was sent from the menu proposes something here, the menu gives
 * way — over the form it would hide the very field — and says where the
 * proposal waits, a click away.
 */
watch(waiting, (now, before) => {
  if (!open.value || !sent.value || now <= before) return;
  open.value = false;
  const place = ai?.offers.value.at(-1)?.place;
  // What belongs to the whole form waits at its head: brought into view,
  // with no toast laid over it.
  if (place === 'form') {
    void nextTick(() =>
      document
        .querySelector('[data-ai-offers="form"]')
        ?.scrollIntoView({ block: 'center' }),
    );
    return;
  }
  const star = place
    ? document.querySelector<HTMLElement>(
        `[data-ai-field-offer="${CSS.escape(place)}"]`,
      )
    : null;
  const name = star && fieldLabelWords(star);
  // Several at once are counted; «Показать» goes to the latest of them.
  const came = now - before;
  showToast(
    came > 1
      ? phrase.value.ai_entity_offers_came(came)
      : name
        ? phrase.value.ai_entity_offer_at(name)
        : phrase.value.ai_entity_offer_came,
    star
      ? {
          label: phrase.value.ai_entity_offer_show,
          run: () => {
            star.scrollIntoView({ block: 'center' });
            if (star.dataset.aiFieldState === 'offers') star.click();
          },
        }
      : undefined,
  );
});

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
        class="pointer-coarse:size-11"
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
        :stoppable="(item) => item.sessionUuid !== sent"
        data-ai-entity-menu
        @close="open = false"
        @stop="stop"
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
        <AiPresetPicker
          v-if="panel?.modelReady"
          :presets="panel.templates"
          :chosen="composer?.templateId()"
          @choose="usePreset"
        />
        <div
          v-if="sentSession"
          class="flex min-w-0 items-center rounded-sm border border-border-1
            bg-bg-1 transition has-hocus:border-border-3"
          data-ai-entity-sent
        >
          <TheiLink
            :to="sessionLocation(sentSession.sessionUuid)"
            class="flex min-h-9 min-w-0 flex-1 items-center gap-xs px-2 py-1.5
              text-sm pointer-coarse:min-h-11"
            :data-title-popup="sessionTitle(sentSession)"
            data-title-popup-clipped
            @click="open = false"
          >
            <AiRunningDots v-if="sentSession.state === 'running'" />
            <Icon v-else name="sparkles" class="shrink-0 text-accent" />
            <span class="min-w-0 flex-1 truncate" data-title-popup-clip>{{
              sessionTitle(sentSession)
            }}</span>
            <b
              v-if="sentSession.waiting"
              class="shrink-0 text-xs font-semibold text-accent"
              >{{ phrase.ai_session_waiting(sentSession.waiting) }}</b
            >
            <Icon
              v-if="sentSession.state !== 'running'"
              name="chevron-right"
              class="shrink-0 text-text-3"
            />
          </TheiLink>
          <AiStopButton
            v-if="sentSession.state === 'running'"
            data-ai-entity-stop
            @click="stop(sentSession.sessionUuid)"
          />
        </div>
        <!-- Side by side while their words fit, one under the other when
             they do not. -->
        <div class="flex flex-wrap gap-1">
          <Button
            v-if="ai.ref.value !== 'profile'"
            variant="secondary"
            class="flex h-9 shrink-0 grow items-center justify-center gap-xs
              bg-transparent whitespace-nowrap pointer-coarse:h-11"
            data-ai-entity-remember
            @click="remember"
          >
            <Icon name="brain" class="shrink-0" />{{
              phrase.ai_remember_title
            }}…
          </Button>
          <Button
            variant="secondary"
            class="flex h-9 shrink-0 grow items-center justify-center gap-xs
              bg-transparent whitespace-nowrap pointer-coarse:h-11"
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

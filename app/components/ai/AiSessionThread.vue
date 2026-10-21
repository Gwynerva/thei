<script lang="ts" setup>
import ModalWaiting from '#layers/thei/app/modals/ModalWaiting.vue';
import type { AiActionItem, AiMessagePart } from '#layers/thei/shared/ai';
import type { AiComposerFile } from '#layers/thei/app/composables/ai-session';
import { builtinKeyOf } from '#layers/thei/shared/ai-template';
import ContentInlineLinkDecorator from '#layers/thei/app/components/content/ContentInlineLinkDecorator.vue';

/**
 * One session, read as a conversation: a slim header — back on a phone, the
 * title, its menu — then, opening the thread and scrolling with it, where it
 * came from, the model and what it spent, and what it is about; the
 * messages; and the composer at the foot. A session an app leads is read
 * here and written in the app; an archived one is only read, its decisions
 * too, until it is brought back.
 */
const props = defineProps<{
  sessionUuid: string;
}>();
const emit = defineEmits<{ back: []; deleted: []; changed: [] }>();

const id = computed(() => props.sessionUuid);
const aboutRoot = ref<HTMLElement | null>(null);
const linkResolver = useContentLinkResolver('admin');
const { detail, missing, refresh } = useAiSession(id);
const session = computed(() => detail.value?.session);

// The list beside shows this session too: it hears of a change at once
// rather than on its next look.
watch(
  () => {
    const item = session.value;
    return item
      ? [
          item.title,
          item.pinned,
          item.state,
          item.waiting,
          item.applied,
          item.rejected,
          item.archivedAt,
          item.lastActiveAt,
        ].join('|')
      : '';
  },
  (now, before) => {
    if (before && now !== before) emit('changed');
  },
);

const title = computed(() =>
  session.value ? sessionTitle(session.value) : '',
);

/**
 * What it is about, a few at first: a check over the whole archive is
 * about a hundred entities, which would bury the thread under their chips.
 */
const ABOUT_SHOWN = 8;
const aboutOpen = ref(false);
watch(id, () => (aboutOpen.value = false));
const aboutShown = computed(() => {
  const about = session.value?.about ?? [];
  return aboutOpen.value ? about : about.slice(0, ABOUT_SHOWN);
});
const aboutLeft = computed(
  () => (session.value?.about.length ?? 0) - aboutShown.value.length,
);

const app = computed(() => session.value?.origin === 'app');
const running = computed(() => session.value?.state === 'running');
const archived = computed(() => Boolean(session.value?.archivedAt));
provideAiArchived(archived);

const origin = computed(() => {
  const item = session.value;
  if (!item) return '';
  if (item.origin === 'app')
    return phrase.value.ai_session_via_app(item.client ?? 'MCP');
  return phrase.value.ai_session_by_you(shortWhen(item.createdAt));
});

/** The actions of each message; an app's have no message of their own. */
const byMessage = computed(() => {
  const map = new Map<string, AiActionItem[]>();
  for (const action of detail.value?.actions ?? []) {
    const key = action.messageUuid ?? '';
    const list = map.get(key) ?? [];
    list.push(action);
    map.set(key, list);
  }
  return map;
});
/** What an app proposed has no message of its own. */
const appCards = computed(() => actionCards(byMessage.value.get('') ?? []));

function actionOf(actionUuid: string) {
  return detail.value?.actions.find(
    (action) => action.actionUuid === actionUuid,
  );
}

/** The model's message being written now, if any. */
const writingUuid = computed(() => {
  if (!running.value) return undefined;
  const last = detail.value?.messages.at(-1);
  return last?.role === 'model' ? last.messageUuid : undefined;
});

/** The last message: a check's «go on» stands only under it. */
const lastSeq = computed(() => detail.value?.messages.at(-1)?.seq ?? 0);
/**
 * What is left of a check, as its last answer says it: offered to go on
 * from the strip over the composer, where the owner is once the proposals
 * above are decided. Not while it answers, nor where the site's model does
 * not.
 */
const more = computed(() => {
  const last = detail.value?.messages.at(-1);
  if (!last || running.value || !detail.value?.answerable) return undefined;
  if (last.seq <= ownerSpokeAt.value) return undefined;
  const part = (last.parts as AiMessagePart[]).find(
    (item) => item.type === 'continue',
  );
  return part?.type === 'continue' && part.next
    ? { ...part, key: builtinKeyOf(detail.value.session.templateId) }
    : undefined;
});
const goingOn = ref(false);
/**
 * Where the owner last wrote: a question asked before it was passed over,
 * as the server counts it, and is no longer offered to answer.
 */
const ownerSpokeAt = computed(
  () =>
    detail.value?.messages.filter((message) => message.role === 'owner').at(-1)
      ?.seq ?? 0,
);

// ---- Following the thread ---------------------------------------------------

const scroller = ref<HTMLElement>();
let stuck = true;
function scrolled() {
  const element = scroller.value;
  if (!element) return;
  stuck = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
}
watch(
  () => [
    detail.value?.messages.length,
    detail.value?.messages.at(-1)?.text.length,
    detail.value?.actions.length,
  ],
  async () => {
    await nextTick();
    if (stuck && scroller.value)
      scroller.value.scrollTop = scroller.value.scrollHeight;
  },
);

// ---- Writing ---------------------------------------------------------------------

const busy = ref(false);
async function send(
  text: string,
  about: string[],
  files: AiComposerFile[],
  restore: () => void,
) {
  const current = session.value;
  if (!current) return;
  busy.value = true;
  stuck = true;
  const sent = await aiAttempt(async () => {
    await aiApi.post(current.sessionUuid, { text, about, files });
    await refresh();
  });
  // Not sent, the words go back where they were written.
  if (!sent) restore();
  busy.value = false;
}

async function answer(question: string, text: string) {
  const current = session.value;
  if (!current) return;
  await aiAttempt(async () => {
    // The answer shows in the thread at once, and the model goes on there.
    await aiApi.post(current.sessionUuid, { text, answers: question });
    await refresh();
  });
}

/** A check goes on: its next batch, or word that nothing is left. */
async function goOn() {
  const current = session.value;
  if (!current || goingOn.value) return;
  // The thread follows the next batch down, wherever the owner was reading.
  stuck = true;
  await aiAttempt(async () => {
    const { messageUuid } = await aiApi.continueRun(current.sessionUuid);
    if (!messageUuid) showToast(phrase.value.ai_continue_nothing);
    await refresh();
  }, goingOn);
}

async function stop() {
  const current = session.value;
  if (current) await aiAttempt(() => aiApi.stop(current.sessionUuid));
}

const placeholder = computed(() =>
  running.value
    ? phrase.value.ai_composer_running
    : phrase.value.ai_composer_placeholder,
);

// ---- The menu ------------------------------------------------------------------

const menuOpen = ref(false);
/** The menu's button itself, which its popup points at and marks open. */
const menuTrigger = useTemplateRef<{ $el: HTMLElement }>('menuTrigger');
const menuButton = computed(() => menuTrigger.value?.$el);
const renaming = ref(false);
const newTitle = ref('');

async function change(
  body: Parameters<typeof aiApi.change>[1],
  toast?: string,
) {
  const current = session.value;
  if (!current) return;
  menuOpen.value = false;
  await aiAttempt(async () => {
    await aiApi.change(current.sessionUuid, body);
    if (toast) showToast(toast);
    await refresh();
  });
}

function startRename() {
  menuOpen.value = false;
  newTitle.value = session.value?.title ?? '';
  renaming.value = true;
}

async function rename() {
  renaming.value = false;
  await change({ title: newTitle.value });
}

async function remove() {
  const current = session.value;
  if (!current) return;
  menuOpen.value = false;
  if (!window.confirm(phrase.value.ai_session_delete_confirm(title.value)))
    return;
  await aiAttempt(async () => {
    await aiApi.remove(current.sessionUuid);
    emit('deleted');
  });
}
</script>

<template>
  <section
    class="flex min-h-0 min-w-0 flex-1 flex-col"
    :aria-label="title"
    data-session-thread
    :data-session="sessionUuid"
  >
    <!-- One slim line: back on a phone, the title, its menu. -->
    <div
      class="flex items-center gap-1 border-b border-border-1/70 px-1 py-1.5
        sm:px-sm"
    >
      <AiSessionsBack @click="emit('back')" />
      <form
        v-if="renaming"
        class="flex min-w-0 flex-1 items-center gap-1"
        @submit.prevent="rename"
      >
        <FieldInput
          v-model="newTitle"
          wrapper-class="min-w-0 flex-1"
          class="h-8 py-1 text-sm"
          :aria-label="phrase.ai_session_rename"
          :placeholder="title"
          autofocus
          @keydown.escape="renaming = false"
        />
        <Button
          size="icon-sm"
          type="submit"
          class="pointer-coarse:size-11"
          :aria-label="phrase.save"
        >
          <Icon name="check" />
        </Button>
      </form>
      <h2
        v-else
        class="min-w-0 flex-1 truncate px-1 text-base font-bold"
        data-session-title
      >
        {{ title }}
      </h2>
      <span class="inline-flex">
        <Button
          ref="menuTrigger"
          variant="secondary"
          size="icon-sm"
          class="bg-transparent pointer-coarse:size-11"
          :disabled="!session"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          :aria-label="phrase.ai_session_menu"
          :data-title-popup="phrase.ai_session_menu"
          data-session-menu
          @click="menuOpen = !menuOpen"
        >
          <Icon name="tune" />
        </Button>
      </span>
    </div>

    <div
      ref="scroller"
      class="scrollbar-hover min-h-0 flex-1 overflow-y-auto"
      data-session-scroll
      @scroll.passive="scrolled"
    >
      <div
        v-if="missing"
        class="mx-auto flex max-w-184 flex-col items-center gap-sm px-sm py-lg
          text-text-2"
      >
        <Icon name="face-dead" class="text-3xl" />
      </div>
      <div
        v-else-if="detail && session"
        class="mx-auto flex max-w-184 flex-col gap-sm px-sm pt-md pb-lg"
      >
        <!-- Where it came from and what it is about: once, at the top. -->
        <div
          class="flex flex-col gap-2 border-b border-border-1/60 pb-sm"
          data-session-head
        >
          <p
            class="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs
              text-text-2"
          >
            <span class="inline-flex items-center gap-1"
              ><Icon :name="sessionSource(session).icon" />{{ origin }}</span
            >
            <!-- Which model answers it from here on; what it spent is the
                 hint of its mark, a word few owners need in the head. -->
            <span
              v-if="!app"
              class="inline-flex min-w-0 items-center gap-1"
              data-session-model
              ><span
                class="inline-flex"
                :data-title-popup="
                  session.tokens
                    ? phrase.ai_session_tokens(compactAmount(session.tokens))
                    : undefined
                "
                data-session-tokens
                ><Icon name="sparkles" /></span
              ><AiModelPicker
                :model-value="session.model ?? ''"
                :disabled="archived"
                @update:model-value="change({ model: $event })"
            /></span>
          </p>
          <!-- What it is about, drawn as links in a text are: each with its
               picture, its accent and its card on hover. -->
          <div
            v-if="session.about.length"
            ref="aboutRoot"
            class="flex flex-wrap gap-1.5"
          >
            <AiEntityChip
              v-for="entity in aboutShown"
              :key="entity.ref"
              :entity
            />
            <button
              v-if="aboutLeft > 0 || aboutOpen"
              type="button"
              class="cursor-pointer rounded-full px-2 text-xs font-semibold
                text-text-2 transition pointer-coarse:min-h-11 hocus:bg-bg-2
                hocus:text-text-1"
              :aria-expanded="aboutOpen"
              data-session-about-more
              @click="aboutOpen = !aboutOpen"
            >
              {{
                aboutOpen
                  ? phrase.ai_session_about_less
                  : phrase.ai_session_about_more(aboutLeft)
              }}
            </button>
            <ContentInlineLinkDecorator
              :root="aboutRoot"
              :resolver="linkResolver"
            />
          </div>
        </div>

        <p
          v-if="app"
          class="flex items-start gap-2.5 rounded-normal border border-dashed
            border-border-2 px-3 py-2.5 text-sm leading-snug text-text-2"
          data-session-app-note
        >
          <Icon name="key" class="mt-0.5 shrink-0" />
          {{ phrase.ai_session_app_note }}
        </p>

        <AiMessage
          v-for="message in detail.messages"
          :key="message.messageUuid"
          :message
          :actions="byMessage.get(message.messageUuid) ?? []"
          :writing="message.messageUuid === writingUuid"
          :answerable="detail.answerable && message.seq > ownerSpokeAt"
          :last="message.seq === lastSeq && detail.session.state !== 'running'"
          :action-of="actionOf"
          @answer="answer"
        />

        <!-- What an app proposed has no message of its own. -->
        <div
          v-if="appCards.length"
          class="flex min-w-0 flex-col gap-2.5"
          data-session-app-actions
        >
          <p class="flex items-center gap-1.5 text-xs text-text-2">
            <Icon name="key" class="text-accent" />{{ session.client ?? 'MCP' }}
          </p>
          <AiActionCard
            v-for="card in appCards"
            :key="card.key"
            :actions="card.actions"
          />
        </div>
      </div>
      <ModalWaiting v-else class="py-lg" />
    </div>

    <!-- An archived session is brought back before anything is written in
         it; an app's is written in the app, as the note above says. -->
    <div
      v-if="archived && session"
      class="px-sm pt-1.5
        pb-[calc(var(--spacing-sm)+env(safe-area-inset-bottom,0px))]"
      data-session-archived
    >
      <div
        class="mx-auto flex w-full max-w-184 items-center gap-2 rounded-normal
          border border-border-1 bg-bg-2 py-1 pr-1 pl-3 text-sm text-text-2"
      >
        <Icon name="history" class="shrink-0" />
        <span class="min-w-0 flex-1">{{
          phrase.ai_session_archived_note
        }}</span>
        <Button
          variant="secondary"
          class="flex h-8 shrink-0 items-center gap-1.5 px-sm text-sm
            pointer-coarse:h-11"
          data-session-unarchive
          @click="change({ archived: false })"
        >
          <Icon name="undo" />{{ phrase.ai_session_unarchive }}
        </Button>
      </div>
    </div>
    <div
      v-else-if="!app"
      class="px-sm pt-1.5
        pb-[calc(var(--spacing-sm)+env(safe-area-inset-bottom,0px))]"
    >
      <AiSessionWaiting
        v-if="detail"
        :actions="detail.actions"
        :scroller="scroller"
        :more
        :going-on="goingOn"
        :running
        @continue="goOn"
      />
      <AiComposer
        :running
        :busy
        :disabled="!session"
        :placeholder
        @send="send"
        @stop="stop"
      />
    </div>

    <FloatingPopup
      v-model:open="menuOpen"
      :anchor="menuButton ?? null"
      placement="bottom-end"
      max-width="16rem"
      density="list"
    >
      <div
        v-if="session"
        role="menu"
        class="flex min-w-52 flex-col gap-0.5"
        data-session-menu-popup
      >
        <button
          v-for="item in [
            {
              icon: 'star' as const,
              label: session.pinned
                ? phrase.ai_session_unpin
                : phrase.ai_session_pin,
              run: () =>
                change(
                  { pinned: !session!.pinned },
                  session!.pinned
                    ? phrase.ai_toast_unpinned
                    : phrase.ai_toast_pinned,
                ),
              on: session.pinned,
              key: 'pin',
            },
            {
              icon: 'edit' as const,
              label: phrase.ai_session_rename,
              run: startRename,
              on: false,
              key: 'rename',
            },
            {
              icon: session.archivedAt
                ? ('undo' as const)
                : ('history' as const),
              label: session.archivedAt
                ? phrase.ai_session_unarchive
                : phrase.ai_session_archive,
              run: () => change({ archived: !session!.archivedAt }),
              on: false,
              key: 'archive',
            },
          ]"
          :key="item.key"
          type="button"
          role="menuitem"
          class="flex popup-item items-center"
          :data-session-menu-item="item.key"
          @click="item.run"
        >
          <Icon
            :name="item.icon"
            :class="item.on ? 'text-accent' : 'text-text-2'"
          />{{ item.label }}
        </button>
        <hr class="my-0.5 border-border-1" />
        <button
          type="button"
          role="menuitem"
          class="flex popup-item items-center text-text-error
            [--popup-item-hover:var(--color-bg-error)]"
          data-session-menu-item="delete"
          @click="remove"
        >
          <Icon name="delete" />{{ phrase.ai_session_delete }}
        </button>
      </div>
    </FloatingPopup>
  </section>
</template>

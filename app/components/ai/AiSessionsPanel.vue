<script lang="ts" setup>
import {
  aiModelName,
  type AiModelSettings,
} from '#layers/thei/shared/ai-model';
import type { AiEntityRef } from '#layers/thei/shared/ai';
import type { AiComposerFile } from '#layers/thei/app/composables/ai-session';
import ContentInlineLinkDecorator from '#layers/thei/app/components/content/ContentInlineLinkDecorator.vue';

/**
 * The sessions tab: the list on the left and the open session beside it —
 * or, on a phone, one of them at a time. The session open travels in the
 * address (`?session=`), so a link can open it; `new` is a session about to
 * be started. An entity's form sends its owner here with `?about=`: the
 * list shows the sessions about it, and a new one is about it.
 */
const route = useRoute();
const router = useRouter();

const requestFetch = useRequestFetch();
const { data: model, refresh: refreshModel } = await useAsyncData(
  'ai-model',
  () => requestFetch<AiModelSettings>('/api/admin/ai/model'),
);
const modelReady = computed(() => model.value?.state === 'ready');
const modelName = computed(() => (model.value ? aiModelName(model.value) : ''));

/** What the month has spent, under the list; none without a model. */
const usage = computed(() => {
  const settings = model.value;
  if (!settings || settings.provider === 'none') return undefined;
  return {
    month: settings.usage.month,
    limit: settings.monthlyTokens,
    average: settings.averageTurn,
  };
});

/** A session changed: the list says so, and what the month has spent. */
function changed() {
  void list.value?.refresh();
  void refreshModel();
}

const selected = computed(() =>
  typeof route.query.session === 'string' ? route.query.session : undefined,
);

function open(sessionUuid: string | undefined) {
  void router.replace({
    path: route.path,
    query: { ...route.query, session: sessionUuid },
  });
}

const list = ref<{ refresh: () => Promise<void> }>();

// ---- About one entity ------------------------------------------------------------

const aboutRef = computed(() =>
  typeof route.query.about === 'string' ? route.query.about : undefined,
);
const about = ref<AiEntityRef>();
watch(
  aboutRef,
  async (ref) => {
    about.value = undefined;
    if (!ref || !import.meta.client) return;
    const found = await aiApi
      .entityPanel(ref)
      .then((panel) => panel.memory.entity)
      .catch(() => undefined);
    // Let go, or changed, while it was read: the answer is for nothing now.
    if (aboutRef.value === ref) about.value = found;
  },
  { immediate: true },
);
function everything() {
  const query = { ...route.query };
  delete query.about;
  void router.replace({ path: route.path, query });
}
const aboutRoot = ref<HTMLElement | null>(null);
const linkResolver = useContentLinkResolver('admin');

// ---- A new session -----------------------------------------------------------

const starting = ref(false);
async function start(
  text: string,
  mentioned: string[],
  files: AiComposerFile[],
  restore: () => void,
) {
  starting.value = true;
  try {
    const { sessionUuid } = await aiApi.start({
      text,
      files,
      about: about.value
        ? [...new Set([about.value.ref, ...mentioned])]
        : mentioned,
    });
    open(sessionUuid);
    await list.value?.refresh();
  } catch (caught) {
    restore();
    showToast(errorMessage(caught, phrase.value.ai_error));
  } finally {
    starting.value = false;
  }
}

async function deleted() {
  open(undefined);
  await list.value?.refresh();
}
</script>

<template>
  <!-- In the site's column, the page's grid on either side, from the header
       to the foot of the window; on a phone, the whole width. -->
  <div
    class="mx-auto flex min-h-96 w-(--width-wide) max-w-full flex-1 px-window
      max-sm:px-0"
  >
    <div
      class="flex min-h-0 min-w-0 flex-1 overflow-hidden border-x
        border-border-1 bg-bg-1 max-sm:border-x-0"
      data-sessions-panel
    >
      <AiSessionList
        ref="list"
        :selected
        :model-ready
        :usage
        :about
        :class="{ 'max-sm:hidden': selected }"
        @open="open"
        @create="open('new')"
        @everything="everything"
      />

      <AiSessionThread
        v-if="selected && selected !== 'new'"
        :key="selected"
        :session-uuid="selected"
        @back="open(undefined)"
        @deleted="deleted"
        @changed="changed"
      />

      <section
        v-else
        class="flex min-h-0 min-w-0 flex-1 flex-col"
        :class="{ 'max-sm:hidden': !selected }"
        data-session-new-screen
      >
        <div
          class="flex items-center gap-1 border-b border-border-1/70 px-1 py-1.5
            sm:hidden"
        >
          <Button
            variant="secondary"
            size="icon-sm"
            class="bg-transparent pointer-coarse:size-11"
            :aria-label="phrase.ai_sessions_back"
            @click="open(undefined)"
          >
            <Icon name="chevron-left" />
          </Button>
        </div>
        <div class="scrollbar-hover min-h-0 flex-1 overflow-y-auto">
          <div class="mx-auto flex max-w-160 flex-col gap-sm px-sm pt-lg pb-md">
            <h2 class="text-2xl leading-tight font-bold">
              {{ phrase.ai_new_title }}
            </h2>
            <p class="text-text-2">{{ phrase.ai_new_text }}</p>
            <p v-if="modelReady" class="text-xs text-text-3">
              {{ phrase.ai_new_model_line(modelName) }}
            </p>
            <p
              v-if="about"
              ref="aboutRoot"
              class="flex min-w-0 flex-wrap items-center gap-1.5 text-sm
                text-text-2"
              data-session-new-about
            >
              {{ phrase.ai_new_about }}
              <AiEntityChip :entity="about" />
            </p>
            <ContentInlineLinkDecorator
              :root="aboutRoot"
              :resolver="linkResolver"
            />
          </div>
        </div>
        <div
          class="px-sm pt-1.5
            pb-[calc(var(--spacing-sm)+env(safe-area-inset-bottom,0px))]"
        >
          <AiComposer
            :busy="starting"
            :disabled="!modelReady"
            :placeholder="
              modelReady
                ? phrase.ai_composer_placeholder
                : phrase.ai_no_model_title
            "
            @send="start"
          />
        </div>
      </section>
    </div>
  </div>
</template>

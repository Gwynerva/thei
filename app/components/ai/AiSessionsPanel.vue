<script lang="ts" setup>
import type { AiEntityRef } from '#layers/thei/shared/ai';
import type {
  AiComposerExpose,
  AiComposerFile,
} from '#layers/thei/app/composables/ai-session';
import type {
  AiPresetItem,
  AiTemplateListResponse,
} from '#layers/thei/shared/ai-template';
import ContentInlineLinkDecorator from '#layers/thei/app/components/content/ContentInlineLinkDecorator.vue';

/**
 * The sessions tab: the list on the left and the open session beside it —
 * or, on a phone, one of them at a time. The session open travels in the
 * address (`?session=`), so a link can open it; `new` is a session about to
 * be started. An entity's form sends its owner here with `?about=`: the
 * list shows the sessions about it, and a new one is about it; a template's
 * row with `?template=`: the new one opens with that ready-made request.
 */
const route = useRoute();
const router = useRouter();

const requestFetch = useRequestFetch();
const { data: model, refresh: refreshModel } = await useAiModel();
const modelReady = computed(() => model.value?.state === 'ready');

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

const { data: templates } = await useAsyncData('ai-templates', () =>
  requestFetch<AiTemplateListResponse>('/api/admin/ai/templates'),
);
// Every template is offered: a built-in check sent from here runs.
const presets = computed(() => templates.value?.templates ?? []);
const composer = ref<AiComposerExpose>();
/** The model the new session is answered with; empty for the connection's. */
const newModel = ref('');

function usePreset(preset: AiPresetItem) {
  composer.value?.prefill(preset.instruction, preset.templateId);
}

// Opened with one: its words go in once, as the screen comes up.
const presetAsked = computed(() =>
  selected.value === 'new' && typeof route.query.template === 'string'
    ? route.query.template
    : undefined,
);
watch(
  [presetAsked, presets, composer],
  ([asked]) => {
    if (!asked || !composer.value) return;
    const preset = presets.value.find((item) => item.templateId === asked);
    if (!preset) return;
    usePreset(preset);
    const query = { ...route.query };
    delete query.template;
    void router.replace({ path: route.path, query });
  },
  { immediate: true },
);

const starting = ref(false);
/** A built-in check sent from here runs over what the words and mentions name. */
async function start(
  text: string,
  mentioned: string[],
  files: AiComposerFile[],
  restore: () => void,
  templateId: string | undefined,
) {
  starting.value = true;
  try {
    await startAiSession(
      {
        text,
        about: about.value
          ? [...new Set([about.value.ref, ...mentioned])]
          : mentioned,
        files,
        restore,
        templateId,
        model: newModel.value,
      },
      {
        presets: presets.value,
        started: async (sessionUuid) => {
          open(sessionUuid);
          await list.value?.refresh();
        },
      },
    );
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
          <AiSessionsBack @click="open(undefined)" />
        </div>
        <div class="scrollbar-hover min-h-0 flex-1 overflow-y-auto">
          <div class="mx-auto flex max-w-160 flex-col gap-sm px-sm pt-lg pb-md">
            <h2 class="text-2xl leading-tight font-bold">
              {{ phrase.ai_new_title }}
            </h2>
            <p class="text-text-2">{{ phrase.ai_new_text }}</p>
            <!-- Which model answers, and the template to start from. -->
            <div
              v-if="modelReady"
              class="flex flex-wrap items-center gap-xs text-xs"
            >
              <span
                class="flex min-w-0 items-center gap-1"
                data-session-new-model
              >
                <Icon name="sparkles" class="shrink-0 text-text-3" />
                <AiModelPicker v-model="newModel" />
              </span>
              <AiPresetPicker
                :presets
                :chosen="composer?.templateId()"
                @choose="usePreset"
              />
            </div>
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
            ref="composer"
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

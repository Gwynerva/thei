<script lang="ts" setup>
import type { TabItem } from '#layers/thei/app/components/UnderlineTabs.vue';

/**
 * Everything about AI in one place: the sessions — conversations with the
 * site's model and what apps did over MCP — the templates that start them,
 * what every AI should know of the owner, and how AI and Thei reach each
 * other. The tab travels in the
 * address, so a link can open the one it means.
 */
definePageMeta({ layout: 'admin' });

await useAdminTabTitle(computed(() => phrase.value.ai_page));
await useAdminSummary();
const aiEnabled = useAiEnabled();
const waiting = useAiWaiting();

type AiTab = 'sessions' | 'templates' | 'memory' | 'connection';
const TABS: AiTab[] = ['sessions', 'templates', 'memory', 'connection'];

const route = useRoute();
const router = useRouter();

/**
 * Until AI is on, the page opens where it is turned on. Decided once, as the
 * page opens: AI turned on from there leaves the owner by the switch, to set
 * the model up, rather than taking them away to the sessions.
 */
const firstTab: AiTab = aiEnabled.value ? 'sessions' : 'connection';

const tab = computed<AiTab>({
  get: () =>
    TABS.includes(route.query.tab as AiTab)
      ? (route.query.tab as AiTab)
      : firstTab,
  set: (value) => {
    void router.replace({
      path: route.path,
      query: {
        tab: value === firstTab ? undefined : value,
      },
    });
  },
});

/** The sessions take the window's height: they scroll within, never the page. */
const sessionsShown = computed(
  () => tab.value === 'sessions' && aiEnabled.value,
);

const tabs = computed<TabItem<AiTab>[]>(() => [
  {
    key: 'sessions',
    label: phrase.value.ai_tab_sessions,
    icon: 'ai-chat',
    ...(waiting.value ? { count: waiting.value } : {}),
  },
  { key: 'templates', label: phrase.value.ai_tab_templates, icon: 'template' },
  { key: 'memory', label: phrase.value.ai_tab_memory, icon: 'brain' },
  { key: 'connection', label: phrase.value.ai_tab_connection, icon: 'power' },
]);
</script>

<template>
  <div
    :class="{
      'flex h-[calc(100dvh-var(--height-admin-bar))] flex-col': sessionsShown,
    }"
  >
    <!-- The tabs are the header's own row end: the page's title on the left,
         what it holds on the right, the chosen one underlined on the
         header's edge. When the row does not fit, the others shrink to
         their icons. -->
    <StickyGlassHeader width="var(--width-wide)">
      <div class="flex min-w-0 items-end gap-sm">
        <h1 class="flex shrink-0 items-center gap-xs py-sm text-xl font-bold">
          <Icon name="sparkles" class="shrink-0" />
          <span>{{ phrase.ai_page }}</span>
        </h1>
        <UnderlineTabs
          v-model="tab"
          :tabs
          :label="phrase.ai_page"
          controls="ai-panel"
          class="ml-auto min-w-0 border-b-0"
        />
      </div>
    </StickyGlassHeader>
    <div
      v-if="sessionsShown"
      id="ai-panel"
      role="tabpanel"
      class="flex min-h-0 flex-1 flex-col"
      :aria-labelledby="`ai-panel-${tab}-tab`"
    >
      <AiSessionsPanel />
    </div>
    <div v-else class="m-auto flex w-(--width-wide) flex-col px-window py-lg">
      <div
        id="ai-panel"
        role="tabpanel"
        class="flex flex-col gap-md"
        :aria-labelledby="`ai-panel-${tab}-tab`"
      >
        <!-- Off, the tabs that only make sense with AI on ask nothing; the
             switch itself stays. -->
        <AiOffNotice v-if="!aiEnabled && tab !== 'connection'" />
        <AiTemplatesPanel v-else-if="tab === 'templates'" />
        <AiMemoryPanel v-else-if="tab === 'memory'" />
        <AiConnectionPanel v-else />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { AiSessionOverview } from '#layers/thei/shared/ai';

// The page's classes go to the box by hand: a server render of a transition
// hands its child none of them.
defineOptions({ inheritAttrs: false });

/**
 * The AI on the dashboard, headed as every box there is: the latest sessions
 * that wait for the owner, that work now, and that were done within the
 * week. A kind with none is left out and the others take its room; the
 * sessions stand side by side as far as there is room, then one under
 * another. Nothing at all with AI off, or while there is no session to show.
 */
// Read with the page, so the box is there from the first paint rather than
// pushing the page down after it; with AI off, nothing is asked.
await useAdminSummary();
const enabled = useAiEnabled();
const waiting = useAiWaiting();
const { data: first } = await useFetch<AiSessionOverview>(
  '/api/admin/ai/overview',
  { key: 'admin-ai-overview', immediate: enabled.value },
);
const overview = ref(first.value);

const groups = computed(() => {
  const value = overview.value;
  if (!value) return [];
  return [
    {
      key: 'waiting',
      title: phrase.value.ai_session_groups.waiting,
      items: value.waiting,
    },
    {
      key: 'running',
      title: phrase.value.ai_session_groups.running,
      items: value.running,
    },
    {
      key: 'recent',
      title: phrase.value.ai_session_recent,
      items: value.recent,
    },
  ].filter((group) => group.items.length);
});

// Then a session at work is followed closely, the rest now and then; what
// waits is read again as soon as the admin bar counts it anew. A read that
// fails leaves what is shown.
let timer: ReturnType<typeof setTimeout> | undefined;
let reading = 0;
function later() {
  clearTimeout(timer);
  timer = setTimeout(load, overview.value?.running.length ? 5_000 : 30_000);
}
async function load() {
  clearTimeout(timer);
  const ticket = ++reading;
  if (!enabled.value) {
    overview.value = undefined;
    return;
  }
  if (document.visibilityState === 'visible') {
    const read = await aiApi.sessionOverview();
    if (ticket !== reading) return;
    if (read) overview.value = read;
  }
  later();
}
onMounted(later);
watch([enabled, waiting], load);
onBeforeUnmount(() => {
  reading++;
  clearTimeout(timer);
});
</script>

<template>
  <!-- It comes with the page; one that shows up later, when a first
       session does, fades in. -->
  <TransitionFade>
    <Box
      v-if="overview && groups.length"
      v-bind="$attrs"
      class="flex flex-col overflow-hidden"
      data-ai-sessions
    >
      <AdminOverviewHeader
        icon="sparkles"
        :title="phrase.ai_page"
        to="/admin/ai/"
        :count="overview.total"
        :new-to="newSessionLocation()"
        :new-label="phrase.ai_session_new"
      />
      <div
        class="flex flex-wrap gap-x-md gap-y-sm border-t border-border-1 p-sm"
      >
        <!-- A kind grows with what it shows, from a session's width. -->
        <section
          v-for="group in groups"
          :key="group.key"
          class="flex min-w-0 basis-56 flex-col gap-0.5"
          :style="{ flexGrow: group.items.length }"
          :data-ai-sessions-group="group.key"
        >
          <h3
            class="flex h-6 items-center gap-xs px-2 text-xs font-semibold
              text-text-3"
          >
            {{ group.title }}
            <span
              v-if="group.key === 'waiting' && waiting"
              class="inline-flex h-5 min-w-5 items-center justify-center
                rounded-full bg-accent px-1.5 text-xs font-bold text-white
                dark:text-bg-1"
              >{{ waiting }}</span
            >
            <Icon
              v-if="group.key === 'running'"
              name="loading"
              class="text-accent"
            />
          </h3>
          <div
            class="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-x-sm
              gap-y-0.5"
          >
            <AiSessionLink
              v-for="item in group.items"
              :key="item.sessionUuid"
              :item
            />
          </div>
        </section>
      </div>
    </Box>
  </TransitionFade>
</template>

<script lang="ts" setup>
import type { EventListItem } from '#layers/thei/shared/api/event';
import { buildEventUrl } from '#layers/thei/shared/event-url';

definePageMeta({ layout: 'admin' });
await useAdminTabTitle(computed(() => phrase.value.admin_events));
const humanSize = useHumanSize();
const LIMIT = 50;
const { data: initial, error } = await useFetch<EventListItem[]>(
  '/api/admin/events',
  {
    query: { offset: 0 },
    key: 'admin-events',
  },
);
const events = ref(initial.value ?? []);
const loadingMore = ref(false);
const hasMore = ref(events.value.length >= LIMIT);
const sentinel = ref<HTMLElement>();
let observer: IntersectionObserver | undefined;

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const page = await $fetch<EventListItem[]>('/api/admin/events', {
      query: { offset: events.value.length },
    });
    events.value.push(...page);
    if (page.length < LIMIT) hasMore.value = false;
  } finally {
    loadingMore.value = false;
  }
}
onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) void loadMore();
    },
    { rootMargin: '200px' },
  );
  if (sentinel.value) observer.observe(sentinel.value);
});
onUnmounted(() => observer?.disconnect());
</script>

<template>
  <StickyGlassHeader width="var(--width-wide)">
    <div class="flex items-center justify-between gap-xs py-xs">
      <div class="flex items-center gap-xs text-xl font-bold">
        <Icon name="event" />{{ phrase.admin_events }}
      </div>
      <TheiLink
        to="/admin/events/new/"
        class="flex items-center gap-xs rounded-normal bg-accent/80 px-sm py-xs
          text-sm text-white transition hocus:bg-accent"
      >
        <Icon name="plus-circle" />{{ phrase.new_event }}
      </TheiLink>
    </div>
  </StickyGlassHeader>
  <div class="m-auto w-(--width-wide) px-window py-lg">
    <div
      v-if="error"
      class="mb-md rounded-normal border border-border-error bg-bg-error p-xs
        text-text-error"
    >
      <Icon name="warning" class="mr-xs" />{{ phrase.failed_to_fetch_data }}
    </div>
    <Box v-if="events.length">
      <div class="overflow-auto">
        <table class="w-full">
          <thead>
            <tr class="th">
              <th
                class="w-full min-w-40 rounded-tl-normal p-td-tight text-left"
              >
                {{ phrase.event }}
              </th>
              <th class="min-w-36 p-td-tight text-left max-sm:hidden">
                {{ phrase.updated_at }}
              </th>
              <th class="p-td-tight text-left">{{ phrase.size }}</th>
              <th class="rounded-tr-normal"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in events" :key="item.eventUuid" class="tr-normal">
              <td class="max-w-0 min-w-70">
                <div class="flex min-w-0 items-center">
                  <TheiLink
                    :to="`/admin/events/${item.eventUuid}/edit/`"
                    class="group relative flex min-h-16 min-w-0 flex-1
                      items-center overflow-hidden py-xs pl-sm"
                  >
                    <span
                      class="event-preview absolute inset-y-0 left-0 w-24
                        bg-bg-accent"
                    >
                      <Media
                        v-if="item.previewMedia"
                        v-bind="item.previewMedia"
                        class="size-full opacity-75 transition
                          group-hocus:opacity-100"
                      />
                      <span
                        v-else
                        class="flex size-full items-center pl-sm text-2xl
                          text-text-3"
                        ><Icon name="event"
                      /></span>
                    </span>
                    <span class="relative ml-10 min-w-0">
                      <span
                        class="block font-semibold wrap-break-word transition
                          group-hocus:text-accent"
                        >{{ item.title }}</span
                      >
                      <span
                        class="block text-sm wrap-break-word text-text-2
                          max-sm:hidden"
                        >{{ item.summary }}</span
                      >
                    </span>
                  </TheiLink>
                  <Icon
                    :name="
                      item.access === 'public'
                        ? 'lock-open'
                        : item.access === 'link-only'
                          ? 'lock-partial'
                          : 'lock-close'
                    "
                    class="mr-sm shrink-0 text-text-3"
                  />
                </div>
              </td>
              <td class="p-td text-text-2 max-sm:hidden">
                <TheiTime :datetime="item.updatedAt" class="text-sm" />
                <div
                  v-if="item.createdAt !== item.updatedAt"
                  class="mt-0.5 text-xs text-text-3"
                >
                  <Icon name="plus-circle" class="mr-1" /><TheiTime
                    :datetime="item.createdAt"
                  />
                </div>
              </td>
              <td class="p-td text-sm whitespace-nowrap text-text-2">
                {{ humanSize(item.totalSize) }}
              </td>
              <td class="p-td pr-sm text-center">
                <TheiLink
                  :to="buildEventUrl(item.humanReadableSlug, item.publicId)"
                  external
                  :data-title-popup="phrase.view_event"
                  class="text-text-2/50 transition hocus:text-text-1"
                  ><Icon name="eye-open" class="text-lg"
                /></TheiLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="loadingMore" class="flex justify-center p-sm">
        <Icon name="loading" />
      </div>
    </Box>
  </div>
  <div ref="sentinel" />
</template>

<style scoped>
.event-preview {
  mask-image: linear-gradient(
    to right,
    #000 0%,
    rgb(0 0 0 / 70%) 20%,
    rgb(0 0 0 / 10%) 75%,
    transparent 100%
  );
}
</style>

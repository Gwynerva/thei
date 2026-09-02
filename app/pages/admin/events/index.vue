<script lang="ts" setup>
import type {
  EventListItem,
  EventListResponse,
} from '#layers/thei/shared/api/event';
import { buildEventUrl } from '#layers/thei/shared/event-url';

definePageMeta({ layout: 'admin' });

await useAdminTabTitle(computed(() => phrase.value.admin_events));

const humanSize = useHumanSize();
const { data, error, status, search, order, setPage } =
  await useAdminEntityList<EventListItem>('/api/admin/events', 'admin-events');
const list = computed<EventListResponse | undefined>(() => data.value);
</script>

<template>
  <StickyGlassHeader width="var(--width-wide)">
    <div class="flex items-center justify-between gap-xs py-xs">
      <div class="flex min-w-0 items-center gap-xs text-xl font-bold">
        <Icon name="event" class="shrink-0" />
        <span class="truncate">{{ phrase.admin_events }}</span>
      </div>
      <TheiLink
        to="/admin/events/new/"
        class="flex items-center gap-xs rounded-normal bg-accent/80 px-sm py-xs
          text-sm text-white transition hocus:bg-accent"
      >
        <Icon name="plus-circle" />
        <span>{{ phrase.new_event }}</span>
      </TheiLink>
    </div>
  </StickyGlassHeader>

  <div class="m-auto w-(--width-wide) px-window py-lg">
    <AdminEntityListToolbar v-model:search="search" v-model:order="order" />

    <div
      v-if="error"
      class="mt-md rounded-normal border border-border-error bg-bg-error p-xs
        text-text-error"
    >
      <Icon name="warning" class="mr-xs" />
      <span>{{ phrase.failed_to_fetch_data }}</span>
      <span v-if="error.message" class="ml-xs">{{ error.message }}</span>
    </div>

    <Box v-if="list?.items.length" class="mt-md overflow-hidden">
      <div class="flex min-w-0 items-center th text-sm">
        <div class="min-w-0 flex-1 p-td-tight">{{ phrase.event }}</div>
        <div class="hidden w-20 shrink-0 sm:block"></div>
        <div class="hidden w-36 shrink-0 p-td-tight sm:block">
          {{ phrase.updated_at }}
        </div>
        <div class="w-24 shrink-0 p-td-tight">{{ phrase.size }}</div>
        <div class="hidden w-12 shrink-0 sm:block"></div>
      </div>

      <AdminEntityListItem
        v-for="item in list.items"
        :key="item.eventUuid"
        entity-type="event"
        :title="item.title"
        :summary="item.summary"
        :preview-media="item.previewMedia"
        :edit-to="`/admin/events/${item.eventUuid}/edit/`"
      >
        <template #badges>
          <Icon
            :name="
              item.access === 'public'
                ? 'lock-open'
                : item.access === 'link-only'
                  ? 'lock-partial'
                  : 'lock-close'
            "
            :data-title-popup="
              item.access === 'public'
                ? phrase.public_hint
                : item.access === 'link-only'
                  ? phrase.link_only_hint
                  : phrase.private_hint
            "
            class="cursor-help text-text-3 transition hocus:text-text-1"
          />
        </template>
        <template #date>
          <div>
            <TheiTime :datetime="item.updatedAt" class="text-sm" />
            <div
              v-if="item.createdAt !== item.updatedAt"
              class="mt-0.5 text-xs text-text-3"
            >
              <Icon
                name="plus-circle"
                class="mr-1 cursor-help"
                :data-title-popup="phrase.created_at"
              />
              <TheiTime :datetime="item.createdAt" />
            </div>
          </div>
        </template>
        <template #size>{{ humanSize(item.totalSize) }}</template>
        <template #action>
          <TheiLink
            :to="buildEventUrl(item.humanReadableSlug, item.publicId)"
            external
            :data-title-popup="phrase.view_event"
            :aria-label="phrase.view_event"
            class="cursor-pointer text-text-2/50 transition hocus:text-text-1"
          >
            <Icon name="visibility" class="text-lg" />
          </TheiLink>
        </template>
      </AdminEntityListItem>
    </Box>

    <div
      v-else-if="status !== 'pending' && !error"
      class="mt-md rounded-normal border border-border-1 bg-bg-2 p-md
        text-center text-sm text-text-3 italic"
    >
      {{ search.trim() ? phrase.admin_search_no_results : phrase.no_events }}
    </div>

    <div v-if="status === 'pending'" class="flex justify-center p-md">
      <Icon name="loading" class="text-lg text-text-2" />
    </div>

    <AdminPagination
      v-if="list"
      :page="list.page"
      :page-count="list.pageCount"
      @page="setPage"
    />
  </div>
</template>

<script lang="ts" setup>
import type {
  PageListItem,
  PageListResponse,
} from '#layers/thei/shared/api/page';
import { buildPageUrl } from '#layers/thei/shared/page-url';

definePageMeta({ layout: 'admin' });
await useAdminTabTitle(computed(() => phrase.value.admin_pages));

const humanSize = useHumanSize();
const { data, error, status, search, order } =
  await useAdminEntityList<PageListItem>('/api/admin/pages', 'admin-pages');
const list = computed<PageListResponse | undefined>(() => data.value);
</script>

<template>
  <StickyGlassHeader width="var(--width-wide)">
    <div class="flex items-center justify-between gap-xs py-xs">
      <div class="flex min-w-0 items-center gap-xs text-xl font-bold">
        <Icon name="page" class="shrink-0" />
        <span class="truncate">{{ phrase.admin_pages }}</span>
      </div>
      <TheiLink
        to="/admin/pages/new/"
        class="flex items-center gap-xs rounded-normal bg-accent/80 px-sm py-xs
          text-sm text-white transition hocus:bg-accent"
      >
        <Icon name="plus-circle" />
        <span>{{ phrase.new_page }}</span>
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
        <div class="min-w-0 flex-1 p-td-tight">{{ phrase.page }}</div>
        <div class="hidden w-20 shrink-0 sm:block"></div>
        <div class="hidden w-36 shrink-0 p-td-tight sm:block">
          {{ phrase.updated_at }}
        </div>
        <div class="w-24 shrink-0 p-td-tight">{{ phrase.size }}</div>
        <div class="hidden w-12 shrink-0 sm:block"></div>
      </div>

      <AdminEntityListItem
        v-for="item in list.items"
        :key="item.pageUuid"
        entity-type="page"
        :title="item.title"
        :summary="item.summary"
        :preview-media="item.iconMedia"
        :edit-to="`/admin/pages/${item.pageUuid}/edit/`"
      >
        <template #badges>
          <Icon
            v-if="item.reminder"
            name="warning"
            v-bind="
              reminderTitlePopup(phrase.entity_reminder_badge, item.reminder)
            "
            :aria-label="phrase.entity_reminder_badge"
            role="img"
            class="cursor-help text-text-warning"
          />
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
            :to="buildPageUrl(item.slug)"
            external
            :data-title-popup="phrase.view_page"
            :aria-label="phrase.view_page"
            class="cursor-pointer text-text-2/50 transition hocus:text-text-1"
          >
            <Icon name="visibility" class="text-lg" />
          </TheiLink>
        </template>
      </AdminEntityListItem>
    </Box>

    <AdminEmptyList
      v-else-if="status !== 'pending' && !error"
      icon="page"
      :title="phrase.no_pages"
      :description="phrase.admin_pages_empty_description"
      :searching="!!search.trim()"
      create-to="/admin/pages/new/"
      :create-label="phrase.new_page"
      class="mt-md"
      @reset-search="search = ''"
    />

    <div
      v-if="status === 'pending' && !list?.items.length"
      class="flex justify-center p-md"
    >
      <Icon name="loading" class="text-lg text-text-2" />
    </div>

    <Pagination
      v-if="list"
      :page="list.page"
      :page-count="list.pageCount"
      :pending="status === 'pending'"
      class="pt-md"
    />
  </div>
</template>

<script lang="ts" setup>
import type {
  DiaryListItem,
  DiaryListResponse,
} from '#layers/thei/shared/api/diary';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';

definePageMeta({ layout: 'admin' });

await useAdminTabTitle(computed(() => phrase.value.admin_diary));

const humanSize = useHumanSize();
const { data, error, status, search, order, setPage } =
  await useAdminEntityList<DiaryListItem>('/api/admin/diary', 'admin-diary');
const list = computed<DiaryListResponse | undefined>(() => data.value);

/**
 * An entry has no title, so the day it belongs to is its name in the list —
 * spelled out, because a list of "three weeks ago" names nothing.
 */
function dayOf(item: DiaryListItem) {
  return formatAbsolutePublicDate(item.date, language.value.code);
}
</script>

<template>
  <StickyGlassHeader width="var(--width-wide)">
    <div class="flex items-center justify-between gap-xs py-xs">
      <div class="flex min-w-0 items-center gap-xs text-xl font-bold">
        <Icon name="thought" class="shrink-0" />
        <span class="truncate">{{ phrase.admin_diary }}</span>
      </div>
      <TheiLink
        to="/admin/diary/new/"
        class="flex items-center gap-xs rounded-normal bg-accent/80 px-sm py-xs
          text-sm text-white transition hocus:bg-accent"
      >
        <Icon name="plus-circle" />
        <span>{{ phrase.new_diary_entry }}</span>
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
        <div class="min-w-0 flex-1 p-td-tight">{{ phrase.diary_entry }}</div>
        <div class="hidden w-20 shrink-0 sm:block"></div>
        <div class="hidden w-36 shrink-0 p-td-tight sm:block">
          {{ phrase.updated_at }}
        </div>
        <div class="w-24 shrink-0 p-td-tight">{{ phrase.size }}</div>
        <div class="hidden w-12 shrink-0 sm:block"></div>
      </div>

      <AdminEntityListItem
        v-for="item in list.items"
        :key="item.diaryUuid"
        entity-type="diary-entry"
        :title="dayOf(item)"
        :summary="item.excerpt"
        :preview-media="item.previewMedia"
        :edit-to="`/admin/diary/${item.diaryUuid}/edit/`"
      >
        <template #badges>
          <Icon
            v-if="item.reminder"
            name="warning"
            :data-title-popup="`${phrase.entity_reminder_badge}: ${item.reminder}`"
            :aria-label="phrase.entity_reminder_badge"
            role="img"
            class="cursor-help text-text-warning"
          />
          <Icon
            :name="item.access === 'public' ? 'lock-open' : 'lock-close'"
            :data-title-popup="
              item.access === 'public'
                ? phrase.public_hint
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
            :to="buildDiaryUrl(item.date)"
            external
            :data-title-popup="phrase.diary_entry"
            :aria-label="phrase.diary_entry"
            class="cursor-pointer text-text-2/50 transition hocus:text-text-1"
          >
            <Icon name="visibility" class="text-lg" />
          </TheiLink>
        </template>
      </AdminEntityListItem>
    </Box>

    <AdminEmptyList
      v-else-if="status !== 'pending' && !error"
      icon="thought"
      :title="phrase.no_diary_entries"
      :description="phrase.admin_diary_empty_description"
      :searching="!!search.trim()"
      create-to="/admin/diary/new/"
      :create-label="phrase.new_diary_entry"
      class="mt-md"
      @reset-search="search = ''"
    />

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

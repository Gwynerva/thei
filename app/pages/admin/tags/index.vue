<script lang="ts" setup>
import type { TagListItem } from '#layers/thei/shared/tag';

definePageMeta({ layout: 'admin' });
await useAdminTabTitle(computed(() => phrase.value.admin_tags));

const { data: tags, error } = await useFetch<TagListItem[]>('/api/admin/tags');

function placeholderStyle(tag: TagListItem) {
  if (!tag.accentColor) return;
  return {
    color: 'var(--color-text-1)',
    backgroundColor: `color-mix(in oklab, ${tag.accentColor} 18%, var(--color-bg-3))`,
  };
}
</script>

<template>
  <StickyGlassHeader width="var(--width-wide)">
    <div class="flex items-center justify-between gap-xs py-xs">
      <div class="flex items-center gap-xs text-xl font-bold">
        <Icon name="tag" />
        <span>{{ phrase.admin_tags }}</span>
      </div>
      <TheiLink
        to="/admin/tags/new/"
        class="flex shrink-0 items-center gap-xs rounded-normal bg-accent/80
          px-sm py-xs text-sm font-semibold text-white transition
          hocus:bg-accent"
      >
        <Icon name="plus-circle" />
        {{ phrase.new_tag }}
      </TheiLink>
    </div>
  </StickyGlassHeader>

  <div class="m-auto w-(--width-wide) max-w-full px-window py-lg">
    <div
      v-if="error"
      class="mb-md rounded-normal bg-bg-error p-sm text-text-error"
    >
      {{ phrase.failed_to_fetch_data }}
    </div>

    <Box v-if="tags?.length">
      <div class="hidden overflow-auto sm:block">
        <table class="w-full">
          <thead>
            <tr class="th">
              <th class="w-full p-td-tight text-left">
                {{ phrase.tag_title }}
              </th>
              <th class="w-64 min-w-64 p-td-tight text-left">
                {{ phrase.tag_slug }}
              </th>
              <th class="p-td-tight text-center">{{ phrase.tag_usage }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tag in tags" :key="tag.tagUuid" class="tr-normal">
              <td>
                <TheiLink
                  :to="`/admin/tags/${tag.tagUuid}/edit/`"
                  class="flex items-center gap-sm p-sm font-semibold transition
                    hocus:text-accent"
                >
                  <TagIcon v-if="tag.iconMedia" :tag="tag" class="size-8" />
                  <span
                    v-else
                    class="flex size-8 shrink-0 items-center justify-center
                      rounded-sm bg-bg-3 text-text-3"
                    :style="placeholderStyle(tag)"
                  >
                    <Icon name="tag" />
                  </span>
                  {{ tag.title }}
                </TheiLink>
              </td>
              <td class="w-64 max-w-64 min-w-64 p-sm text-sm text-text-2">
                <div class="truncate">{{ tag.slug }}</div>
              </td>
              <td
                class="p-sm"
                :aria-label="
                  phrase.tag_usage_summary(
                    tag.usageCounts.project ?? 0,
                    tag.usageCounts.event ?? 0,
                  )
                "
              >
                <div
                  class="flex items-center justify-center gap-1.5
                    whitespace-nowrap"
                >
                  <Icon name="project" class="text-text-2" />
                  <span
                    class="font-semibold"
                    :class="
                      (tag.usageCounts.project ?? 0) > 0
                        ? 'text-text-1'
                        : 'text-text-3'
                    "
                  >
                    {{ tag.usageCounts.project ?? 0 }}
                  </span>
                  <span class="text-text-3/50">/</span>
                  <Icon name="event" class="text-text-2" />
                  <span
                    class="font-semibold"
                    :class="
                      (tag.usageCounts.event ?? 0) > 0
                        ? 'text-text-1'
                        : 'text-text-3'
                    "
                  >
                    {{ tag.usageCounts.event ?? 0 }}
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="divide-y divide-border-1 sm:hidden">
        <TheiLink
          v-for="tag in tags"
          :key="tag.tagUuid"
          :to="`/admin/tags/${tag.tagUuid}/edit/`"
          class="flex items-center gap-sm p-sm transition hocus:bg-bg-3/50"
        >
          <TagIcon v-if="tag.iconMedia" :tag="tag" class="size-10" />
          <span
            v-else
            class="flex size-10 shrink-0 items-center justify-center rounded-sm
              bg-bg-3 text-text-3"
            :style="placeholderStyle(tag)"
          >
            <Icon name="tag" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ tag.title }}</span>
            <span class="block truncate text-sm text-text-3">
              {{ tag.slug }}
            </span>
          </span>
          <span
            class="flex shrink-0 items-center gap-1 text-xs text-text-2"
            :aria-label="
              phrase.tag_usage_summary(
                tag.usageCounts.project ?? 0,
                tag.usageCounts.event ?? 0,
              )
            "
          >
            <Icon name="project" />
            <span
              class="font-semibold"
              :class="
                (tag.usageCounts.project ?? 0) > 0
                  ? 'text-text-1'
                  : 'text-text-3'
              "
            >
              {{ tag.usageCounts.project ?? 0 }}
            </span>
            <span class="text-text-3/50">/</span>
            <Icon name="event" />
            <span
              class="font-semibold"
              :class="
                (tag.usageCounts.event ?? 0) > 0 ? 'text-text-1' : 'text-text-3'
              "
            >
              {{ tag.usageCounts.event ?? 0 }}
            </span>
          </span>
        </TheiLink>
      </div>
    </Box>

    <Box v-else-if="!error">
      <p class="p-md text-center text-text-3">{{ phrase.tag_empty_list }}</p>
    </Box>
  </div>
</template>

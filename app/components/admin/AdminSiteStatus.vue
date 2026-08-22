<script lang="ts" setup>
import type { SiteAccessLevel } from '#layers/thei/shared/access-level';
import type { AdminDiskUsage } from '#layers/thei/shared/admin/disk-usage';

type AdminSystemInfo = {
  theiVersion: string;
  siteAccessLevel: SiteAccessLevel;
  runtime: { name: string; version: string };
  os: string;
};

const humanSize = useHumanSize();
const [
  { data: systemInfo, error: systemError },
  { data: disk, error: diskError },
] = await Promise.all([
  useFetch<AdminSystemInfo>('/api/admin/system-info', {
    key: 'admin-system-info',
  }),
  useFetch<AdminDiskUsage>('/api/admin/disk-usage', {
    key: 'admin-disk-usage',
  }),
]);

const segments = computed(() => {
  const total = disk.value?.total ?? 0;
  if (!total || !disk.value) return [];
  return [
    {
      key: 'thei',
      label: phrase.value.disk_thei_files,
      size: disk.value.theiUsed,
      class: 'bg-accent',
      textClass: 'text-accent',
    },
    {
      key: 'other',
      label: phrase.value.disk_other_files,
      size: disk.value.otherUsed,
      class: 'bg-bg-4',
      textClass: 'text-text-2',
    },
    {
      key: 'free',
      label: phrase.value.disk_free_space,
      size: disk.value.free,
      class: 'bg-bg-3',
      textClass: 'text-text-3',
    },
  ].map((segment) => ({
    ...segment,
    width: `${(segment.size / total) * 100}%`,
    popup: `${segment.label}: ${humanSize(segment.size)}`,
  }));
});
</script>

<template>
  <Box class="mb-lg" :aria-label="phrase.site_status">
    <div class="flex flex-wrap items-center gap-x-md gap-y-xs p-xs">
      <div
        class="flex shrink-0 items-center gap-xs"
        :data-title-popup="phrase.site_version"
      >
        <Icon name="thei" class="text-text-3" />
        <span class="text-sm font-semibold">
          Thei v{{ systemInfo?.theiVersion ?? '—' }}
        </span>
      </div>

      <div
        class="flex shrink-0 items-center gap-xs text-sm"
        :data-title-popup="phrase.site_access"
      >
        <Icon
          :name="
            systemInfo?.siteAccessLevel === 'private'
              ? 'lock-close'
              : 'lock-open'
          "
          class="text-text-3"
        />
        <span>
          {{
            systemInfo?.siteAccessLevel === 'private'
              ? phrase.site_access_closed
              : phrase.site_access_open
          }}
        </span>
      </div>

      <div
        class="flex min-w-52 flex-1 flex-wrap items-center gap-x-sm gap-y-xs"
      >
        <div
          v-if="disk"
          class="flex h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-bg-3
            ring-1 ring-border-1"
          role="img"
          :aria-label="phrase.disk_usage"
        >
          <span
            v-for="segment in segments"
            :key="segment.key"
            :style="{ width: segment.width }"
            :class="segment.class"
            :data-title-popup="segment.popup"
            tabindex="0"
          ></span>
        </div>
        <span v-else class="text-sm text-text-3">
          {{ phrase.failed_to_fetch_data }}
        </span>

        <div v-if="disk" class="flex flex-wrap items-center gap-x-xs text-xs">
          <template v-for="(segment, index) in segments" :key="segment.key">
            <span v-if="index" aria-hidden="true" class="text-border-3">/</span>
            <span
              :class="segment.textClass"
              :data-title-popup="segment.popup"
              tabindex="0"
            >
              {{ humanSize(segment.size) }}
            </span>
          </template>
        </div>
      </div>
    </div>

    <div
      v-if="systemError || diskError"
      class="border-t border-border-error bg-bg-error px-xs py-1 text-xs
        text-text-error"
    >
      <Icon name="warning" class="mr-1" />
      {{ phrase.failed_to_fetch_data }}
    </div>
  </Box>
</template>

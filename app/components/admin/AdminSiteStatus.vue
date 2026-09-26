<script lang="ts" setup>
import type { SiteAccessLevel } from '#layers/thei/shared/access-level';
import type { AdminDiskUsage } from '#layers/thei/shared/admin/disk-usage';
import type { UpdateStatus } from '#layers/thei/update/types';
import { isBackupStale, type BackupStatus } from '#layers/thei/shared/backup';

type AdminSystemInfo = {
  theiVersion: string;
  siteAccessLevel: SiteAccessLevel;
  runtime: { name: string; version: string };
  os: string;
};

const humanSize = useHumanSize();
const [
  { data: systemInfo, error: systemError },
  { data: disk },
  { data: updates },
  { data: backup },
] = await Promise.all([
  useFetch<AdminSystemInfo>('/api/admin/system-info', {
    key: 'admin-system-info',
  }),
  useFetch<AdminDiskUsage>('/api/admin/disk-usage', {
    key: 'admin-disk-usage',
  }),
  // Uses whatever the last check found, manual or the periodic one.
  useFetch<UpdateStatus>('/api/admin/updates', { key: 'admin-updates' }),
  useFetch<BackupStatus>('/api/admin/backup', { key: 'admin-backup' }),
]);

const isPrivate = computed(
  () => systemInfo.value?.siteAccessLevel === 'private',
);
const lastBackupAt = computed(() => backup.value?.lastBackup?.completedAt);
const backupStale = computed(() => isBackupStale(lastBackupAt.value));

// The disk is a small donut: a circle of circumference 100, so each segment's
// dash length is simply its share of the disk in percent.
const diskSegments = computed(() => {
  const total = disk.value?.total ?? 0;
  if (!total || !disk.value) return [];
  let offset = 0;
  return [
    { key: 'thei', size: disk.value.theiUsed, class: 'stroke-accent' },
    { key: 'other', size: disk.value.otherUsed, class: 'stroke-text-3' },
  ].map((segment) => {
    const share = (segment.size / total) * 100;
    const result = { ...segment, share, offset };
    offset += share;
    return result;
  });
});
const diskPopup = computed(() => {
  if (!disk.value) return phrase.value.failed_to_fetch_data;
  const { total, theiUsed, otherUsed, free } = disk.value;
  return [
    `${phrase.value.disk_usage}: ${humanSize(total)}`,
    `${phrase.value.disk_thei_files}: ${humanSize(theiUsed)}`,
    `${phrase.value.disk_other_files}: ${humanSize(otherUsed)}`,
    `${phrase.value.disk_free_space}: ${humanSize(free)}`,
  ].join('\n');
});
</script>

<template>
  <Box class="mb-md" :aria-label="phrase.site_status">
    <div
      class="flex flex-wrap items-center gap-x-md gap-y-xs px-sm py-xs text-sm"
    >
      <div
        class="flex shrink-0 items-center gap-xs"
        :data-title-popup="phrase.site_version"
        tabindex="0"
      >
        <Icon name="thei" class="text-text-3" />
        <span class="font-semibold">
          v{{ systemInfo?.theiVersion ?? '—' }}
        </span>
      </div>

      <TheiLink
        v-if="updates?.updateAvailable"
        to="/admin/updates/"
        class="flex shrink-0 items-center gap-1 rounded-normal border
          border-border-warning bg-bg-warning px-xs py-0.5 font-semibold
          text-text-warning transition-colors hocus:border-text-warning"
        :data-title-popup="phrase.update_available_hint"
      >
        <Icon name="arrow-cycle" />
        <span>{{ phrase.update_available(updates.latestVersion ?? '') }}</span>
      </TheiLink>

      <div
        class="flex shrink-0 items-center gap-xs"
        :data-title-popup="
          isPrivate
            ? phrase.site_access_closed_hint
            : phrase.site_access_open_hint
        "
        tabindex="0"
      >
        <Icon
          :name="isPrivate ? 'lock-close' : 'lock-open'"
          class="text-text-3"
        />
        <span>
          {{ isPrivate ? phrase.site_access_closed : phrase.site_access_open }}
        </span>
      </div>

      <!-- The disk and the backup each say two things, and break between
      them where even a line of their own is too narrow for both. -->
      <div
        class="flex min-w-0 items-center gap-xs"
        :class="disk ? undefined : 'text-text-error'"
        :data-title-popup="diskPopup"
        tabindex="0"
      >
        <svg
          v-if="disk"
          viewBox="0 0 36 36"
          class="size-5 shrink-0 -rotate-90"
          role="img"
          :aria-label="phrase.disk_usage"
        >
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            class="stroke-bg-4"
            stroke-width="6"
          />
          <circle
            v-for="segment in diskSegments"
            :key="segment.key"
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            :class="segment.class"
            stroke-width="6"
            :stroke-dasharray="`${segment.share} ${100 - segment.share}`"
            :stroke-dashoffset="-segment.offset"
          />
        </svg>
        <Icon v-else name="warning" class="shrink-0" />
        <span v-if="disk" class="flex min-w-0 flex-wrap items-center gap-x-xs"
          ><span class="text-accent">{{
            phrase.disk_thei_short(humanSize(disk.theiUsed))
          }}</span
          ><span class="text-text-3">{{
            phrase.disk_free_short(humanSize(disk.free))
          }}</span></span
        >
        <span v-else>{{ phrase.failed_to_fetch_data }}</span>
      </div>

      <div
        class="flex min-w-0 items-center gap-xs"
        :class="backupStale ? 'text-text-warning' : undefined"
      >
        <Icon
          :name="backupStale ? 'warning' : 'files'"
          class="shrink-0"
          :class="backupStale ? undefined : 'text-text-3'"
        />
        <span class="flex min-w-0 flex-wrap items-center gap-x-xs">
          <TheiLink
            v-if="backupStale"
            to="/admin/settings/"
            class="underline-offset-2 hocus:underline"
            :data-title-popup="phrase.backup_stale_warning"
          >
            {{ lastBackupAt ? phrase.backup_stale_short : phrase.backup_never }}
          </TheiLink>
          <span
            v-if="lastBackupAt"
            class="flex items-center gap-1"
            :class="backupStale ? 'text-text-3' : undefined"
            ><span>{{ phrase.backup_last }}</span
            ><TheiTime :datetime="lastBackupAt"
          /></span>
        </span>
      </div>

      <span v-if="systemError" class="flex items-center gap-1 text-text-error">
        <Icon name="warning" />
        {{ phrase.failed_to_fetch_data }}
      </span>
    </div>
  </Box>
</template>

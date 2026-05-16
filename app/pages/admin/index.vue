<script lang="ts" setup>
definePageMeta({
  layout: 'admin',
});

const { data: loginsData } = await useFetch('/api/admin/last-logins');
const { data: diskData } = await useFetch('/api/admin/disk-usage');
const { data: systemData } = await useFetch('/api/admin/system-info');

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
</script>

<template>
  <div class="space-y-6 p-6">
    <!-- Last Logins -->
    <div class="dark:bg-gray-900 rounded-xl bg-white shadow">
      <div class="border-gray-200 dark:border-gray-700 border-b px-5 py-4">
        <h2 class="text-gray-700 dark:text-gray-300 text-sm font-semibold">
          Last Logins
        </h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr
              class="border-gray-100 text-gray-500 dark:border-gray-800
                dark:text-gray-400 border-b text-left text-xs"
            >
              <th class="px-5 py-3 font-medium">IP</th>
              <th class="px-5 py-3 font-medium">Location</th>
              <th class="w-full px-5 py-3 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-if="!loginsData?.logins.length"
              class="text-gray-400 dark:text-gray-500"
            >
              <td class="px-5 py-3" colspan="3">No logins recorded.</td>
            </tr>
            <tr
              v-for="entry in loginsData?.logins"
              :key="entry.ip + entry.at"
              class="border-gray-50 dark:border-gray-800 border-b last:border-0"
            >
              <td class="text-gray-800 dark:text-gray-200 px-5 py-3 font-mono">
                {{ entry.ip }}
              </td>
              <td class="text-gray-500 dark:text-gray-400 px-5 py-3">
                {{ entry.location ?? '—' }}
              </td>
              <td
                class="text-gray-500 dark:text-gray-400 w-full px-5 py-3
                  text-right"
              >
                <HumanTime :timestamp="entry.at" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Disk Usage -->
    <div class="dark:bg-gray-900 rounded-xl bg-white shadow">
      <div class="border-gray-200 dark:border-gray-700 border-b px-5 py-4">
        <h2 class="text-gray-700 dark:text-gray-300 text-sm font-semibold">
          Disk Usage
        </h2>
      </div>
      <dl class="divide-gray-100 dark:divide-gray-800 divide-y">
        <template v-if="diskData">
          <div
            v-for="row in [
              {
                label: 'Available on disk',
                value: diskData.available,
                sub: false,
              },
              {
                label: 'Thei size',
                value: diskData.installSize,
                sub: false,
              },
              {
                label: 'Temp (.thei)',
                value: diskData.theiTempSize,
                sub: true,
              },
              { label: 'Database', value: diskData.databaseSize, sub: true },
              { label: 'Assets', value: diskData.assetsSize, sub: true },
            ]"
            :key="row.label"
            class="flex items-center justify-between py-3"
            :class="row.sub ? 'pr-5 pl-10' : 'px-5'"
          >
            <dt
              class="dark:text-gray-400 text-sm"
              :class="row.sub ? 'text-gray-400' : 'text-gray-500'"
            >
              {{ row.label }}
            </dt>
            <dd
              class="font-mono text-sm font-medium"
              :class="
                row.sub
                  ? 'text-gray-500 dark:text-gray-400'
                  : 'text-gray-800 dark:text-gray-200'
              "
            >
              {{ formatBytes(row.value) }}
            </dd>
          </div>
        </template>
      </dl>
    </div>

    <!-- System Info -->
    <div class="dark:bg-gray-900 rounded-xl bg-white shadow">
      <div class="border-gray-200 dark:border-gray-700 border-b px-5 py-4">
        <h2 class="text-gray-700 dark:text-gray-300 text-sm font-semibold">
          System Info
        </h2>
      </div>
      <dl class="divide-gray-100 dark:divide-gray-800 divide-y">
        <template v-if="systemData">
          <div
            v-for="row in [
              { label: 'Thei version', value: systemData.theiVersion },
              {
                label: systemData.runtime.name,
                value: systemData.runtime.version,
              },
              { label: 'OS', value: systemData.os },
            ]"
            :key="row.label"
            class="flex items-center justify-between px-5 py-3"
          >
            <dt class="text-gray-500 dark:text-gray-400 text-sm">
              {{ row.label }}
            </dt>
            <dd
              class="text-gray-800 dark:text-gray-200 font-mono text-sm
                font-medium"
            >
              {{ row.value }}
            </dd>
          </div>
        </template>
      </dl>
    </div>
  </div>
</template>

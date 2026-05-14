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
    <div class="rounded-xl bg-white shadow dark:bg-gray-900">
      <div class="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Last Logins
        </h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr
              class="border-b border-gray-100 text-left text-xs text-gray-500
                dark:border-gray-800 dark:text-gray-400"
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
              :key="entry.ip + entry.loggedAt"
              class="border-b border-gray-50 last:border-0 dark:border-gray-800"
            >
              <td class="px-5 py-3 font-mono text-gray-800 dark:text-gray-200">
                {{ entry.ip }}
              </td>
              <td class="px-5 py-3 text-gray-500 dark:text-gray-400">
                {{ entry.location ?? '—' }}
              </td>
              <td
                class="w-full px-5 py-3 text-right text-gray-500
                  dark:text-gray-400"
              >
                <HumanTime :timestamp="entry.loggedAt" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Disk Usage -->
    <div class="rounded-xl bg-white shadow dark:bg-gray-900">
      <div class="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Disk Usage
        </h2>
      </div>
      <dl class="divide-y divide-gray-100 dark:divide-gray-800">
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
              class="text-sm dark:text-gray-400"
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
    <div class="rounded-xl bg-white shadow dark:bg-gray-900">
      <div class="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
          System Info
        </h2>
      </div>
      <dl class="divide-y divide-gray-100 dark:divide-gray-800">
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
            <dt class="text-sm text-gray-500 dark:text-gray-400">
              {{ row.label }}
            </dt>
            <dd
              class="font-mono text-sm font-medium text-gray-800
                dark:text-gray-200"
            >
              {{ row.value }}
            </dd>
          </div>
        </template>
      </dl>
    </div>
  </div>
</template>

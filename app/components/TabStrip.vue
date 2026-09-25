<script lang="ts" setup generic="K extends string">
import type { IconName } from '#thei/icons';

export type TabStripItem<K extends string> = {
  key: K;
  label: string;
  icon?: IconName;
  count?: number;
};

/**
 * A row of tabs that switch one panel in place, on public pages and in the
 * admin alike.
 *
 * On a narrow screen the words give way to the icon and the count: the kind
 * and how many there are is the whole message, and three labels side by side
 * were taking the room the list needs. Each tab still names itself in full
 * for a screen reader and on hover.
 */
defineProps<{
  tabs: TabStripItem<K>[];
  label: string;
  /** The id of the panel the tabs switch. */
  controls?: string;
}>();

const model = defineModel<K>({ required: true });
</script>

<template>
  <div
    role="tablist"
    :aria-label="label"
    class="flex rounded-normal bg-bg-3 p-1 text-sm font-semibold"
  >
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      role="tab"
      :aria-selected="model === tab.key"
      :aria-controls="controls"
      :aria-label="tab.label"
      :data-title-popup="tab.label"
      class="flex min-w-0 flex-1 cursor-pointer items-center justify-center
        gap-xs rounded-sm px-xs py-xs transition focus-visible:ring-2
        focus-visible:ring-accent focus-visible:outline-none"
      :class="
        model === tab.key
          ? 'bg-bg-1 text-text-1 shadow-sm'
          : 'text-text-2 hocus:text-accent'
      "
      @click="model = tab.key"
    >
      <Icon v-if="tab.icon" :name="tab.icon" class="shrink-0" />
      <span class="hidden truncate sm:inline">{{ tab.label }}</span>
      <span v-if="tab.count !== undefined" class="text-text-3 tabular-nums">
        {{ tab.count }}
      </span>
    </button>
  </div>
</template>

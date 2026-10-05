<script lang="ts" setup generic="K extends string">
import type { IconName } from '#thei/icons';

export type TabItem<K extends string> = {
  key: K;
  label: string;
  icon?: IconName;
  count?: number;
};

/**
 * A row of tabs along the top edge of the panel they switch, the chosen one
 * underlined in the accent — the head of a block rather than a control
 * floating above it.
 *
 * On a narrow screen only the chosen tab keeps its words: the others shrink
 * to their icon and count, which still says what there is to switch to.
 * Each tab still names itself in full for a screen reader and on hover.
 *
 * A tab's id is the panel's id and its key, `<controls>-<key>-tab`, so the
 * panel can say which tab names it with `aria-labelledby`.
 */
defineProps<{
  tabs: TabItem<K>[];
  label: string;
  /** The id of the panel the tabs switch. */
  controls?: string;
}>();

const model = defineModel<K>({ required: true });

const list = useTemplateRef<HTMLElement>('list');

/** The arrows move along the row and choose as they go, as tabs do. */
function onKeydown(event: KeyboardEvent, tabs: TabItem<K>[]) {
  const index = tabs.findIndex((tab) => tab.key === model.value);
  const target =
    event.key === 'ArrowRight'
      ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft'
        ? (index - 1 + tabs.length) % tabs.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : undefined;
  const tab = target === undefined ? undefined : tabs[target];
  if (!tab) return;
  event.preventDefault();
  model.value = tab.key;
  void nextTick(() =>
    list.value
      ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ?.focus(),
  );
}
</script>

<template>
  <div
    ref="list"
    role="tablist"
    :aria-label="label"
    class="flex min-w-0 border-b border-border-1 text-sm font-semibold"
    @keydown="onKeydown($event, tabs)"
  >
    <button
      v-for="tab in tabs"
      :key="tab.key"
      :id="controls ? `${controls}-${tab.key}-tab` : undefined"
      type="button"
      role="tab"
      :aria-selected="model === tab.key"
      :aria-controls="controls"
      :aria-label="tab.label"
      :tabindex="model === tab.key ? 0 : -1"
      :data-title-popup="tab.label"
      class="relative flex min-w-0 cursor-pointer items-center gap-xs px-xs
        py-sm transition focus-visible:ring-2 focus-visible:ring-accent
        focus-visible:outline-none focus-visible:ring-inset sm:px-sm"
      :class="
        model === tab.key
          ? 'shrink text-accent'
          : tab.count
            ? 'shrink-0 text-text-2 hocus:bg-bg-3/60 hocus:text-accent'
            : 'shrink-0 text-text-3 hocus:bg-bg-3/60 hocus:text-accent'
      "
      :data-tab-active="model === tab.key || undefined"
      @click="model = tab.key"
    >
      <Icon
        v-if="tab.icon"
        :name="tab.icon"
        class="shrink-0"
        aria-hidden="true"
      />
      <span
        class="min-w-0 truncate"
        :class="{ 'max-sm:hidden': model !== tab.key }"
        data-tab-label
        >{{ tab.label }}</span
      >
      <span
        v-if="tab.count"
        class="shrink-0 rounded-full bg-bg-3 px-2 py-0.5 text-xs leading-none
          tabular-nums"
      >
        {{ tab.count }}
      </span>
      <!-- Straddles the row's lower edge, so it reads as the tab's own mark
           rather than as the line under the row. -->
      <span
        v-if="model === tab.key"
        class="absolute inset-x-xs -bottom-0.5 h-1 rounded-full bg-accent
          shadow-md shadow-accent/50 sm:inset-x-sm"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

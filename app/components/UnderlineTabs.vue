<script lang="ts" setup generic="K extends string">
import type { RouteLocationRaw } from 'vue-router';
import type { IconName } from '#thei/icons';
import TheiLink from './TheiLink';

export type TabItem<K extends string> = {
  key: K;
  label: string;
  icon?: IconName;
  count?: number;
  /** An address of its own: the tab is a link to it, not a switch. */
  to?: RouteLocationRaw;
  /** Nothing to show under it: it is there, and cannot be chosen. */
  disabled?: boolean;
};

/**
 * A row of tabs along the top edge of the panel they switch, the chosen one
 * underlined in the accent — the head of a block rather than a control
 * floating above it.
 *
 * On a narrow screen only the chosen tab keeps its words: the others shrink
 * to their icon and count, which still says what there is to switch to.
 * Each tab still names itself in full, count included, for a screen reader,
 * and in a hint where its words are hidden.
 *
 * Tabs that are addresses of their own (`to`) are links: the arrows move
 * between them, and following one is the page's to do.
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

/**
 * The arrows move along the row and choose as they go, as tabs do; a row of
 * links only moves the focus, and Enter follows the one it is on.
 */
function onKeydown(event: KeyboardEvent, tabs: TabItem<K>[]) {
  const focusable = list.value
    ? Array.from(list.value.querySelectorAll<HTMLElement>('[role="tab"]'))
    : [];
  if (tabs.some((tab) => tab.to)) {
    const at = focusable.indexOf(document.activeElement as HTMLElement);
    const next = arrowTarget(event, at, focusable.length);
    if (next === undefined) return;
    event.preventDefault();
    focusable[next]?.focus();
    return;
  }
  const index = tabs.findIndex((tab) => tab.key === model.value);
  const target = arrowTarget(event, index, tabs.length);
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

/** Where an arrow, Home or End moves to from `index` in a row of `length`. */
function arrowTarget(event: KeyboardEvent, index: number, length: number) {
  if (event.key === 'ArrowRight') return (index + 1) % length;
  if (event.key === 'ArrowLeft') return (index - 1 + length) % length;
  if (event.key === 'Home') return 0;
  if (event.key === 'End') return length - 1;
  return undefined;
}

/** A switch chooses its panel; a link is followed, a disabled tab neither. */
function choose(tab: TabItem<K>) {
  if (tab.to || tab.disabled) return;
  model.value = tab.key;
}

function tabName(tab: TabItem<K>) {
  return tab.count ? `${tab.label} (${tab.count})` : tab.label;
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
    <component
      :is="tab.to && !tab.disabled ? TheiLink : 'button'"
      v-for="tab in tabs"
      :key="tab.key"
      :id="controls ? `${controls}-${tab.key}-tab` : undefined"
      :to="tab.disabled ? undefined : tab.to"
      :type="tab.to && !tab.disabled ? undefined : 'button'"
      role="tab"
      :aria-selected="model === tab.key"
      :aria-controls="controls"
      :aria-disabled="tab.disabled || undefined"
      :aria-label="tabName(tab)"
      :tabindex="model === tab.key ? 0 : -1"
      :data-title-popup="tabName(tab)"
      class="relative flex min-w-0 items-center gap-xs px-xs py-sm no-underline
        transition focus-visible:ring-2 focus-visible:ring-accent
        focus-visible:outline-none focus-visible:ring-inset sm:px-sm"
      :class="
        model === tab.key
          ? 'shrink cursor-pointer text-accent'
          : tab.disabled
            ? 'shrink-0 cursor-not-allowed text-text-3'
            : tab.count
              ? `shrink-0 cursor-pointer text-text-2 hocus:bg-bg-3/60
                hocus:text-accent`
              : `shrink-0 cursor-pointer text-text-3 hocus:bg-bg-3/60
                hocus:text-accent`
      "
      :data-tab-active="model === tab.key || undefined"
      @click="choose(tab)"
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
        data-title-popup-label
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
    </component>
  </div>
</template>

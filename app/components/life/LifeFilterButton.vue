<script lang="ts" setup>
import {
  lifeFilterKinds,
  type LifeEntityKind,
  type LifeFilter,
  type LifeScopeRef,
} from '#layers/thei/shared/life';
import { lifeEntityKindIcon } from './life-entity-icon';

/**
 * What the chronology shows, and the control that changes it.
 *
 * The page carries it where the reader starts — under the Life header, in a
 * project's tabs — and the sticky bar carries a second one once it is stuck.
 * Both edit the same filter, so they never disagree.
 */
const { scope, variant } = defineProps<{
  scope: LifeScopeRef;
  /** A plain icon in the bar, a labelled chip in a header, a tab in tabs. */
  variant: 'bar' | 'header' | 'tabs';
}>();

const filter = defineModel<LifeFilter>('filter');
const open = defineModel<boolean>('open', { default: false });
const anchor = useTemplateRef<HTMLElement>('anchor');

const kinds = computed(() => lifeFilterKinds(scope));
const isCustom = computed(() => Boolean(filter.value?.length));

/**
 * The popup has two groups: actions that replace the whole selection — only
 * "show everything" for now — and the kinds to pick one by one. "Everything"
 * is an action rather than every box ticked, so while it is on no box is.
 */
function isChosen(kind: LifeEntityKind) {
  return filter.value?.includes(kind) ?? false;
}

function toggle(kind: LifeEntityKind) {
  const current = filter.value ?? [];
  const next = current.includes(kind)
    ? current.filter((item) => item !== kind)
    : [...current, kind];
  // Nothing selected reads as "show everything" rather than an empty feed,
  // which is the only reading that leaves a way back. Every kind selected is
  // everything too, which is also how the address reads it back.
  filter.value =
    next.length === 0 || next.length === kinds.value.length
      ? undefined
      : kinds.value.filter((item) => next.includes(item));
}

function showAll() {
  filter.value = undefined;
}

const triggerClass = computed(() => {
  if (variant === 'bar')
    return 'size-9 justify-center rounded-sm text-text-2 hocus:bg-bg-3 hocus:text-text-1';
  if (variant === 'header')
    return [
      'gap-xs rounded-sm border px-sm py-1 text-sm font-semibold',
      isCustom.value
        ? 'border-accent/40 bg-accent/10 text-accent hocus:bg-accent/15'
        : 'border-border-1 bg-bg-2/60 text-text-2 hocus:bg-bg-3 hocus:text-text-1',
    ];
  return [
    'gap-xs px-xs py-sm text-sm sm:px-sm font-semibold hocus:bg-white/6',
    'focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset',
    isCustom.value ? 'text-white' : 'text-white/60 hocus:text-white',
  ];
});
</script>

<template>
  <div class="shrink-0">
    <button
      ref="anchor"
      type="button"
      class="relative flex cursor-pointer items-center transition"
      :class="triggerClass"
      :aria-label="phrase.life_filter"
      :aria-expanded="open"
      :data-title-popup="variant === 'header' ? undefined : phrase.life_filter"
      @click="open = !open"
    >
      <Icon name="filter" class="shrink-0" />
      <span
        v-if="variant !== 'bar'"
        :class="{ 'hidden sm:inline': variant === 'tabs' }"
        >{{ phrase.life_filter }}</span
      >
      <!-- A chip says it in its colours; the others need the dot. -->
      <span
        v-if="isCustom && variant !== 'header'"
        class="absolute top-1 right-1 size-2 rounded-full bg-accent"
        aria-hidden="true"
      ></span>
    </button>
    <FloatingPopup
      v-model:open="open"
      :anchor="anchor"
      :placement="variant === 'header' ? 'bottom-start' : 'bottom-end'"
      max-width="16rem"
    >
      <section
        class="flex flex-col gap-1 rounded-normal border border-border-1 bg-bg-2
          p-xs text-left text-text-1"
        role="dialog"
        :aria-label="phrase.life_filter"
      >
        <button
          type="button"
          class="flex cursor-pointer items-center gap-sm rounded-sm px-xs py-1
            text-left text-sm transition"
          :class="
            isCustom
              ? 'hocus:bg-bg-3'
              : 'bg-accent/10 font-semibold text-accent'
          "
          :aria-pressed="!isCustom"
          @click="showAll"
        >
          <span class="min-w-0 flex-1 truncate">{{
            phrase.life_filter_all
          }}</span>
        </button>
        <hr class="my-1 border-border-1" />
        <label
          v-for="kind in kinds"
          :key="kind"
          class="flex cursor-pointer items-center gap-sm rounded-sm px-xs py-1
            text-sm transition hocus:bg-bg-3"
        >
          <input
            type="checkbox"
            class="accent-accent"
            :checked="isChosen(kind)"
            @change="toggle(kind)"
          />
          <Icon :name="lifeEntityKindIcon(kind)" class="shrink-0 text-text-3" />
          <span class="min-w-0 flex-1 truncate">{{
            phrase.life_filter_kind(kind)
          }}</span>
        </label>
      </section>
    </FloatingPopup>
  </div>
</template>

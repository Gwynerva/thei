<script lang="ts" setup generic="V extends string">
import type { IconName } from '#thei/icons';

export type PopupSelectOption<V extends string> = {
  value: V;
  label: string;
  icon: IconName;
  /** How many there are of it, shown beside it; nothing while unknown. */
  count?: number;
  /** A line after this option, setting it apart from the ones below. */
  divider?: boolean;
};

/**
 * A choice of one option among a few, each with its icon: the trigger stands
 * where a select would, as tall as the field beside it, and shows the chosen
 * option; the options open in a popup under it, with how many there are of
 * each.
 *
 * The first option is the one that narrows nothing; any other choice is
 * marked in the accent, so a narrowed list is never taken for the whole of
 * it. Any other option counted as empty could only empty the list, so it is
 * offered faded and cannot be picked — unless it is the choice already. The
 * first option is always offered, even counted as empty: it is the way back
 * from a choice that found nothing. With `collapsible`, a narrow screen shows the
 * chosen option by its icon alone; it is still named in full for a screen
 * reader and on hover, and the popup says what is being chosen.
 */
const props = defineProps<{
  options: PopupSelectOption<V>[];
  /** What is being chosen. */
  label: string;
  collapsible?: boolean;
  /** Where the popup goes: `dialog` inside a modal. */
  teleportTo?: string;
}>();

const model = defineModel<V>({ required: true });
const open = ref(false);
const trigger = useTemplateRef<HTMLButtonElement>('trigger');
const list = useTemplateRef<HTMLElement>('list');

const chosen = computed(
  () =>
    props.options.find((option) => option.value === model.value) ??
    props.options[0],
);
const narrowed = computed(() => model.value !== props.options[0]?.value);
const triggerLabel = computed(
  () => `${props.label}: ${chosen.value?.label ?? ''}`,
);

function offered(option: PopupSelectOption<V>) {
  return (
    option.count !== 0 ||
    option.value === model.value ||
    option.value === props.options[0]?.value
  );
}

function choose(option: PopupSelectOption<V>) {
  if (!offered(option)) return;
  model.value = option.value;
  open.value = false;
  trigger.value?.focus({ preventScroll: true });
}

function optionButtons() {
  return Array.from(
    list.value?.querySelectorAll<HTMLButtonElement>(
      '[role="option"]:not([aria-disabled="true"])',
    ) ?? [],
  );
}

/** Opened, the popup starts on the choice. */
function focusChosen() {
  const buttons = optionButtons();
  (
    buttons.find((button) => button.getAttribute('aria-selected') === 'true') ??
    buttons[0]
  )?.focus({ preventScroll: true });
}

/** The arrows walk the options that can be picked, as in a select. */
function onKeydown(event: KeyboardEvent) {
  const buttons = optionButtons();
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const target =
    event.key === 'ArrowDown'
      ? (index + 1) % buttons.length
      : event.key === 'ArrowUp'
        ? (index - 1 + buttons.length) % buttons.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : undefined;
  if (target === undefined) return;
  event.preventDefault();
  buttons[target]?.focus({ preventScroll: true });
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  open.value = true;
}
</script>

<template>
  <div class="flex min-w-0">
    <button
      ref="trigger"
      type="button"
      class="group flex min-w-0 flex-1 cursor-pointer items-center gap-xs
        rounded-normal border-2 bg-bg-1 pr-2 pl-xs text-sm transition"
      :class="
        open ? 'border-border-3' : 'border-border-1 hocus:border-border-3'
      "
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-label="triggerLabel"
      :data-title-popup="collapsible ? triggerLabel : undefined"
      @click="open = !open"
      @keydown="onTriggerKeydown"
    >
      <Icon
        v-if="chosen"
        :name="chosen.icon"
        class="shrink-0"
        :class="narrowed ? 'text-accent' : 'text-text-2'"
      />
      <span
        class="min-w-0 truncate"
        :class="{ 'max-sm:hidden': collapsible, 'text-accent': narrowed }"
        >{{ chosen?.label }}</span
      >
      <Icon
        name="chevron-right"
        class="shrink-0 text-text-3 transition group-hocus:text-text-1"
        :class="open ? '-rotate-90' : 'rotate-90'"
      />
    </button>
    <FloatingPopup
      v-model:open="open"
      :anchor="trigger"
      placement="bottom-end"
      :fallback-placements="['top-end', 'bottom-start']"
      max-width="18rem"
      :teleport-to="teleportTo"
      fit-content
      @opened="focusChosen"
    >
      <div
        class="flex scrollbar-hover max-h-(--floating-popup-available-height)
          min-w-48 flex-col overflow-y-auto rounded-normal border
          border-border-1 bg-bg-2 p-xs text-text-1"
      >
        <p class="px-xs pt-0.5 pb-1 text-xs font-semibold text-text-3">
          {{ label }}
        </p>
        <div
          ref="list"
          role="listbox"
          :aria-label="label"
          class="flex flex-col gap-0.5"
          @keydown="onKeydown"
        >
          <template v-for="option in options" :key="option.value">
            <button
              type="button"
              role="option"
              :aria-selected="option.value === model"
              :aria-disabled="!offered(option) || undefined"
              :tabindex="-1"
              class="flex items-center gap-sm rounded-sm px-xs py-1.5 text-left
                text-sm transition focus-visible:outline-none"
              :class="
                option.value === model
                  ? 'bg-accent/10 font-semibold text-accent'
                  : offered(option)
                    ? 'cursor-pointer focus-visible:bg-bg-3 hocus:bg-bg-3'
                    : 'cursor-not-allowed opacity-40'
              "
              @click="choose(option)"
            >
              <Icon
                :name="option.icon"
                class="shrink-0"
                :class="{ 'text-text-3': option.value !== model }"
              />
              <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
              <span
                v-if="option.count"
                class="shrink-0 rounded-full bg-bg-3 px-2 py-0.5 text-xs
                  leading-none font-normal text-text-2 tabular-nums"
                >{{ option.count }}</span
              >
            </button>
            <hr v-if="option.divider" class="my-1 border-border-1" />
          </template>
        </div>
      </div>
    </FloatingPopup>
  </div>
</template>

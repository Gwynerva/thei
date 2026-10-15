<script lang="ts" setup generic="V extends string">
import type { IconName } from '#thei/icons';

export type SelectOption<V extends string = string> = {
  value: V;
  label: string;
  icon?: IconName;
  /** A quieter line under the label. */
  hint?: string;
  /** How many there are of it, shown beside it; nothing while unknown. */
  count?: number;
  /** A line after this option, setting it apart from the ones below. */
  divider?: boolean;
};

/**
 * A choice of one option among several: the trigger stands where a field
 * would, as tall as a text field beside it — or, `compact`, as a toolbar's
 * controls — and shows the chosen option, with its icon where the options
 * have icons; the options open in a popup under it. The same everywhere, so
 * no select of the site is the browser's own and another a popup.
 *
 * `options` is a list, or a record of labels by value for options with no
 * more to them: only real choices, never a «choose…» standing for none —
 * while nothing is chosen, the trigger shows `placeholder`, faded. `label`
 * says what is being chosen: it names the trigger and heads the popup; an
 * `aria-label` only names it; in a field, its `FieldLabel` stands for both.
 *
 * As a `filter`, the first option narrows nothing; any other choice is
 * marked in the accent, so a narrowed list is never taken for the whole of
 * it, and an option counted as empty could only empty the list, so it is
 * offered faded and cannot be picked — unless it is the choice already. With
 * `collapsible`, a narrow screen shows the chosen option by its icon alone,
 * still named in full for a screen reader and on hover.
 */
defineOptions({ inheritAttrs: false });

const props = defineProps<{
  options: readonly SelectOption<V>[] | Readonly<Record<string, string>>;
  label?: string;
  /** What the trigger says while none of the options is chosen. */
  placeholder?: string;
  filter?: boolean;
  collapsible?: boolean;
  /** As wide as its place, rather than its chosen option. */
  wide?: boolean;
  /** As tall as a toolbar's controls rather than a form's fields. */
  compact?: boolean;
  disabled?: boolean;
}>();

const model = defineModel<V>({ required: true });
const attrs = useAttrs();
const open = ref(false);
const trigger = useTemplateRef<HTMLButtonElement>('trigger');
const list = useTemplateRef<HTMLElement>('list');
const listId = useId();

/** The root takes the class and style; the trigger everything else. */
const triggerAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs;
  return rest;
});

const items = computed<SelectOption<V>[]>(() =>
  Array.isArray(props.options)
    ? (props.options as SelectOption<V>[])
    : Object.entries(props.options as Record<string, string>).map(
        ([value, label]) => ({ value: value as V, label }),
      ),
);
const iconed = computed(() => items.value.some((option) => option.icon));

const chosen = computed(
  () =>
    items.value.find((option) => option.value === model.value) ??
    (props.placeholder === undefined ? items.value[0] : undefined),
);
const narrowed = computed(
  () => props.filter && model.value !== items.value[0]?.value,
);
/** What it is chosen for: `label`, or an `aria-label` with no heading. */
const named = computed(
  () => props.label ?? (attrs['aria-label'] as string | undefined),
);
/** The trigger says both what is chosen and what it is chosen for. */
const triggerLabel = computed(() =>
  named.value
    ? `${named.value}: ${chosen.value?.label ?? props.placeholder ?? ''}`
    : undefined,
);

function offered(option: SelectOption<V>) {
  return (
    !props.filter ||
    option.count !== 0 ||
    option.value === model.value ||
    option.value === items.value[0]?.value
  );
}

function choose(option: SelectOption<V>) {
  if (!offered(option)) return;
  model.value = option.value;
  open.value = false;
  trigger.value?.focus({ preventScroll: true });
}

/** The popup is at least as wide as the trigger it opens from. */
const triggerWidth = ref(0);
function toggle() {
  if (props.disabled) return;
  triggerWidth.value = trigger.value?.offsetWidth ?? 0;
  open.value = !open.value;
}

function optionButtons() {
  return Array.from(
    list.value?.querySelectorAll<HTMLButtonElement>(
      '[role="option"]:not([aria-disabled="true"])',
    ) ?? [],
  );
}

/**
 * A long list scrolls to keep an option in sight — the popup, never the page
 * or the dialog under it.
 */
function reveal(button: HTMLElement) {
  const box = button.closest<HTMLElement>('[data-select-popup]');
  if (!box) return;
  const inset = parseFloat(getComputedStyle(box).paddingTop) || 0;
  const shown = box.getBoundingClientRect();
  const item = button.getBoundingClientRect();
  if (item.top < shown.top + inset)
    box.scrollTop -= shown.top + inset - item.top;
  else if (item.bottom > shown.bottom - inset)
    box.scrollTop += item.bottom - shown.bottom + inset;
}

function focusOption(button: HTMLElement | undefined) {
  if (!button) return;
  button.focus({ preventScroll: true });
  reveal(button);
}

/**
 * Opened, the popup starts on the choice — brought into sight once the popup
 * has its height, which it is given as it is placed, a moment after it opens.
 */
function focusChosen() {
  const buttons = optionButtons();
  const chosenButton =
    buttons.find((button) => button.getAttribute('aria-selected') === 'true') ??
    buttons[0];
  if (!chosenButton) return;
  chosenButton.focus({ preventScroll: true });
  setTimeout(() => reveal(chosenButton));
}

/** Letters typed one after another find the option they begin, as in a select. */
let typed = '';
let typedAt = 0;
function typeAhead(key: string, buttons: HTMLButtonElement[]) {
  const now = Date.now();
  typed = now - typedAt > 700 ? key : typed + key;
  typedAt = now;
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const ordered = [
    ...buttons.slice(current + (typed.length > 1 ? 0 : 1)),
    ...buttons.slice(0, current + (typed.length > 1 ? 0 : 1)),
  ];
  focusOption(
    ordered.find((button) =>
      (button.textContent ?? '')
        .trim()
        .toLocaleLowerCase()
        .startsWith(typed.toLocaleLowerCase()),
    ),
  );
}

/**
 * The arrows walk the options that can be picked, as in a select. Tab leaves
 * the popup for good: it closes, and the focus goes on from the trigger.
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab') {
    open.value = false;
    trigger.value?.focus({ preventScroll: true });
    return;
  }
  const buttons = optionButtons();
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
    if (event.key === ' ') return;
    event.preventDefault();
    typeAhead(event.key, buttons);
    return;
  }
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
  focusOption(buttons[target]);
}

/** Escape gives the focus back to the trigger; a click elsewhere keeps it there. */
function onDismiss(reason: string) {
  if (reason === 'escape') trigger.value?.focus({ preventScroll: true });
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  if (!open.value) toggle();
}
</script>

<template>
  <div
    class="flex min-w-0"
    :class="[wide ? 'w-full' : 'w-fit max-w-full shrink-0', attrs.class]"
    :style="attrs.style as never"
  >
    <button
      v-bind="triggerAttrs"
      ref="trigger"
      type="button"
      class="group flex min-w-0 flex-1 cursor-pointer items-center gap-xs
        rounded-normal border-2 bg-bg-1 pr-2.5 pl-xs text-left transition
        disabled:cursor-not-allowed"
      :class="[
        compact
          ? 'h-10 text-sm pointer-coarse:h-11'
          : 'h-[calc(var(--spacing-xs)*2+1.5em+4px)] text-base',
        open
          ? 'border-border-3'
          : 'border-border-1 enabled:hocus:border-border-3',
      ]"
      :disabled
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? listId : undefined"
      :aria-label="triggerLabel"
      :data-title-popup="collapsible ? triggerLabel : undefined"
      data-label-focus
      data-select
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <!-- Disabled, what it says fades; the field itself stays opaque. -->
      <Icon
        v-if="chosen?.icon"
        :name="chosen.icon"
        class="shrink-0 group-disabled:opacity-55"
        :class="narrowed ? 'text-accent' : 'text-text-2'"
      />
      <!-- As wide as its longest option, as a select is, so a choice never
           moves what stands beside it; narrower only where it has to be. -->
      <span
        class="grid min-w-0 flex-1 grid-cols-1 *:col-start-1 *:row-start-1
          *:truncate group-disabled:opacity-55"
        :class="{ 'max-sm:hidden': collapsible }"
        data-title-popup-label
      >
        <span :class="{ 'text-accent': narrowed, 'text-text-3': !chosen }">{{
          chosen?.label ?? placeholder
        }}</span>
        <template v-if="!wide">
          <span
            v-for="option in items"
            :key="option.value"
            class="invisible"
            aria-hidden="true"
            >{{ option.label }}</span
          >
        </template>
      </span>
      <Icon
        name="chevron-right"
        class="shrink-0 text-text-3 transition group-disabled:opacity-55
          group-enabled:group-hocus:text-text-1"
        :class="open ? '-rotate-90' : 'rotate-90'"
      />
    </button>
    <FloatingPopup
      v-model:open="open"
      :anchor="trigger"
      placement="bottom-start"
      :fallback-placements="['top-start', 'bottom-end', 'top-end']"
      fit-content
      @opened="focusChosen"
      @dismiss="onDismiss"
    >
      <div
        class="flex scrollbar-hover max-h-(--floating-popup-available-height)
          flex-col overflow-y-auto rounded-normal border border-border-1 bg-bg-2
          p-xs text-text-1"
        :style="{
          minWidth: `${triggerWidth}px`,
          maxWidth: `max(18rem, ${triggerWidth}px)`,
        }"
        data-select-popup
      >
        <p
          v-if="label"
          class="px-xs pt-0.5 pb-1 text-xs font-semibold text-text-3"
        >
          {{ label }}
        </p>
        <div
          :id="listId"
          ref="list"
          role="listbox"
          :aria-label="named"
          class="flex flex-col gap-0.5"
          @keydown="onKeydown"
        >
          <template v-for="option in items" :key="option.value">
            <button
              type="button"
              role="option"
              :aria-selected="option.value === model"
              :aria-disabled="!offered(option) || undefined"
              :tabindex="-1"
              class="flex min-h-9 items-center gap-sm rounded-sm px-xs py-1.5
                text-left text-sm transition focus-visible:outline-none
                pointer-coarse:min-h-11"
              :class="
                option.value === model
                  ? 'bg-accent/10 font-semibold text-accent'
                  : offered(option)
                    ? 'cursor-pointer focus-visible:bg-bg-3 hocus:bg-bg-3'
                    : 'cursor-not-allowed opacity-40'
              "
              :data-select-option="option.value"
              @click="choose(option)"
            >
              <Icon
                v-if="option.icon"
                :name="option.icon"
                class="shrink-0"
                :class="{ 'text-text-3': option.value !== model }"
              />
              <span
                v-else-if="iconed"
                class="size-[1em] shrink-0"
                aria-hidden="true"
              ></span>
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate">{{ option.label }}</span>
                <span
                  v-if="option.hint"
                  class="text-xs font-normal text-text-3"
                  >{{ option.hint }}</span
                >
              </span>
              <span
                v-if="option.count"
                class="shrink-0 rounded-full bg-bg-3 px-2 py-0.5 text-xs
                  leading-none font-normal text-text-2 tabular-nums"
                >{{ option.count }}</span
              >
              <Icon
                v-else-if="!filter && option.value === model"
                name="check"
                class="shrink-0"
              />
            </button>
            <hr
              v-if="option.divider"
              role="none"
              class="my-1 border-border-1"
            />
          </template>
        </div>
      </div>
    </FloatingPopup>
  </div>
</template>

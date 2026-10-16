<script lang="ts" setup generic="V extends string">
import type { IconName } from '#thei/icons';
import { normalizeTermText } from '#layers/thei/shared/text-terms';

export type SelectOption<V extends string = string> = {
  value: V;
  label: string;
  icon?: IconName;
  /** A quieter line under the label. */
  hint?: string;
  /** How many there are of it, shown beside it; nothing while unknown. */
  count?: number;
  /** A short mark beside it, such as a stage's place: «2/3». */
  badge?: string;
  /** The heading of the group it begins, shown above it. */
  group?: string;
  /** Set in under the option before it: a subheading under a heading. */
  indent?: boolean;
  /** Choosing it goes further, as into a level below: marked with a chevron. */
  leads?: boolean;
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
 * The popup opens with a small filter on top, in focus: a few letters and
 * Enter pick an option, and the arrows still walk them. It grows to 20rem
 * at most; a longer list scrolls inside it.
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
  /** What the trigger shows in place of the chosen option, in a warning. */
  warning?: string;
}>();

const model = defineModel<V>({ required: true });
const attrs = useAttrs();
const open = ref(false);
const trigger = useTemplateRef<HTMLButtonElement>('trigger');
const list = useTemplateRef<HTMLElement>('list');
const search = useTemplateRef<HTMLInputElement>('search');
const listId = useId();
const query = ref('');
/** The option Enter would pick: where the arrows or the pointer are. */
const active = ref<V>();

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
    ? `${named.value}: ${props.warning ?? chosen.value?.label ?? props.placeholder ?? ''}`
    : undefined,
);

/** The options the filter leaves, each with the group it begins, if any. */
const visible = computed(() => {
  const needle = normalizeTermText(query.value.trim());
  const shown = needle
    ? items.value.filter((option) =>
        normalizeTermText(`${option.label} ${option.hint ?? ''}`).includes(
          needle,
        ),
      )
    : items.value;
  // A group's heading stands above the first of its options still shown.
  return shown.map((option, index) => {
    const group = groupOf(option);
    const before = index > 0 ? groupOf(shown[index - 1]!) : undefined;
    return { option, heading: group !== before ? group : undefined };
  });
});

/** The group an option belongs to: the last heading at or above it. */
function groupOf(option: SelectOption<V>): string | undefined {
  let group: string | undefined;
  for (const item of items.value) {
    if (item.group !== undefined) group = item.group;
    if (item === option) return group;
  }
  return group;
}

function offered(option: SelectOption<V>) {
  return (
    !props.filter ||
    option.count !== 0 ||
    option.value === model.value ||
    option.value === items.value[0]?.value
  );
}

const pickable = computed(() =>
  visible.value.map((entry) => entry.option).filter(offered),
);

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

watch(open, (isOpen) => {
  if (!isOpen) return;
  query.value = '';
  active.value = chosen.value?.value;
});

// What is typed narrows the list; the first option left is the one Enter
// takes, unless the arrows chose another still shown.
watch(query, () => {
  if (!pickable.value.some((option) => option.value === active.value))
    active.value = pickable.value[0]?.value;
});

function optionId(value: V) {
  return `${listId}-${value}`;
}

/**
 * A long list scrolls to keep an option in sight — the popup, never the page
 * or the dialog under it.
 */
function reveal(value: V | undefined) {
  if (value === undefined) return;
  const button = document.getElementById(optionId(value));
  const box = button?.closest<HTMLElement>('[data-select-options]');
  if (!button || !box) return;
  const shown = box.getBoundingClientRect();
  const item = button.getBoundingClientRect();
  if (item.top < shown.top) box.scrollTop -= shown.top - item.top;
  else if (item.bottom > shown.bottom)
    box.scrollTop += item.bottom - shown.bottom;
}

/**
 * Opened, the popup starts on the choice, the filter in focus — brought into
 * sight once the popup has its height, a moment after it opens. On a touch
 * screen the filter waits for a tap: in focus at once, it would raise the
 * keyboard over the options a finger is about to pick from.
 */
function opened() {
  if (!window.matchMedia('(pointer: coarse)').matches)
    search.value?.focus({ preventScroll: true });
  setTimeout(() => reveal(active.value));
}

/**
 * In the filter: the arrows walk the options that can be picked, Enter picks
 * the one they are on. Tab leaves the popup for good: it closes, and the
 * focus goes on from the trigger.
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab') {
    open.value = false;
    trigger.value?.focus({ preventScroll: true });
    return;
  }
  const options = pickable.value;
  if (event.key === 'Enter') {
    event.preventDefault();
    const option = options.find((item) => item.value === active.value);
    if (option) choose(option);
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  if (!options.length) return;
  const index = options.findIndex((item) => item.value === active.value);
  const step = event.key === 'ArrowDown' ? 1 : -1;
  const next =
    index < 0
      ? step > 0
        ? 0
        : options.length - 1
      : (index + step + options.length) % options.length;
  active.value = options[next]!.value;
  reveal(active.value);
}

/** The mouse takes the option it is over; a finger only picks what it taps. */
function pointAt(event: PointerEvent, option: SelectOption<V>) {
  if (event.pointerType === 'mouse' && offered(option))
    active.value = option.value;
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

defineExpose({
  /** Opens the options, as a click on the trigger does. */
  open: () => {
    if (!open.value) toggle();
  },
  focus: () => trigger.value?.focus({ preventScroll: true }),
});
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
        rounded-normal border-2 pr-2.5 pl-xs text-left transition
        disabled:cursor-not-allowed"
      :class="[
        compact
          ? 'h-10 text-sm pointer-coarse:h-11'
          : 'h-[calc(var(--spacing-xs)*2+1.5em+4px)] text-base',
        warning
          ? 'border-border-warning bg-bg-warning text-text-warning'
          : open
            ? 'border-border-3 bg-bg-1'
            : 'border-border-1 bg-bg-1 enabled:hocus:border-border-3',
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
        v-if="warning"
        name="warning"
        class="shrink-0 group-disabled:opacity-55"
      />
      <Icon
        v-else-if="chosen?.icon"
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
        <span
          :class="{
            'text-accent': narrowed && !warning,
            'text-text-3': !chosen && !warning,
          }"
          >{{ warning ?? chosen?.label ?? placeholder }}</span
        >
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
      @opened="opened"
      @dismiss="onDismiss"
    >
      <div
        class="flex max-h-[min(20rem,var(--floating-popup-available-height))]
          flex-col rounded-normal border border-border-1 bg-bg-2 p-xs
          text-text-1"
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
        <div class="relative mb-1 shrink-0">
          <Icon
            name="search"
            class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2
              text-xs text-text-3"
            aria-hidden="true"
          />
          <input
            ref="search"
            v-model="query"
            type="text"
            autocomplete="off"
            spellcheck="false"
            role="combobox"
            aria-autocomplete="list"
            :aria-controls="listId"
            :aria-expanded="true"
            :aria-activedescendant="
              active === undefined ? undefined : optionId(active)
            "
            :aria-label="phrase.select_filter"
            :placeholder="phrase.select_filter"
            class="h-8 w-full rounded-sm border-2 border-border-1 bg-bg-1 pr-2
              pl-6 text-sm text-text-1 transition outline-none
              placeholder:text-text-3 focus:border-accent pointer-coarse:h-10"
            data-select-filter
            @keydown="onKeydown"
          />
        </div>
        <div
          :id="listId"
          ref="list"
          role="listbox"
          :aria-label="named"
          class="flex scrollbar-hover min-h-0 flex-col gap-0.5 overflow-y-auto"
          data-select-options
        >
          <template v-for="{ option, heading } in visible" :key="option.value">
            <p
              v-if="heading"
              role="presentation"
              class="px-xs pt-1.5 pb-0.5 text-2xs font-bold tracking-wider
                text-text-3 uppercase"
            >
              {{ heading }}
            </p>
            <button
              :id="optionId(option.value)"
              type="button"
              role="option"
              :aria-selected="option.value === model"
              :aria-disabled="!offered(option) || undefined"
              :tabindex="-1"
              class="flex min-h-9 items-center gap-sm rounded-sm px-xs py-1.5
                text-left text-sm transition focus-visible:outline-none
                pointer-coarse:min-h-11"
              :class="[
                option.indent ? 'pl-7' : '',
                option.value === model
                  ? 'bg-accent/10 font-semibold text-accent'
                  : !offered(option)
                    ? 'cursor-not-allowed opacity-40'
                    : option.value === active
                      ? 'cursor-pointer bg-bg-3'
                      : 'cursor-pointer hocus:bg-bg-3',
                option.value === model && option.value === active
                  ? 'ring-1 ring-accent/40 ring-inset'
                  : '',
              ]"
              :data-select-option="option.value"
              :data-active="option.value === active || undefined"
              @pointermove="pointAt($event, option)"
              @mousedown.prevent
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
                v-if="option.badge"
                class="shrink-0 rounded-full bg-bg-3 px-2 py-0.5 text-2xs
                  leading-none font-normal text-text-2 tabular-nums"
                >{{ option.badge }}</span
              >
              <span
                v-if="option.count"
                class="shrink-0 rounded-full bg-bg-3 px-2 py-0.5 text-xs
                  leading-none font-normal text-text-2 tabular-nums"
                >{{ option.count }}</span
              >
              <Icon
                v-else-if="option.leads"
                name="chevron-right"
                class="shrink-0 text-text-3"
              />
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
          <p
            v-if="!visible.length"
            class="px-xs py-1.5 text-center text-xs text-text-3"
          >
            {{ phrase.search_entity_no_results }}
          </p>
        </div>
      </div>
    </FloatingPopup>
  </div>
</template>

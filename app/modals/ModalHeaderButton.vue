<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import TheiLink from '#layers/thei/app/components/TheiLink';

const props = withDefaults(
  defineProps<{
    icon?: IconName;
    /** The icon's own colour, as the ✦ of AI wears the accent. */
    iconClass?: string;
    /**
     * On a phone the words give way to this icon, the button a square named
     * by its label: the floppy disk of a Save.
     */
    phoneIcon?: IconName;
    /**
     * All of it is saved: the phone's square shows `check` in place of its
     * icon. Both stay in the page, one hidden: pointing an icon's `<use>`
     * elsewhere while the owner types in a text ends the browser's run of
     * typing, and Ctrl+Z would then stop after the first letter.
     */
    phoneDone?: boolean;
    label: string;
    variant?: 'default' | 'delete' | 'accent';
    size?: 'default' | 'compact';
    disabled?: boolean;
    /**
     * Why it cannot act yet (`useFormNeeds`), a line per need: it looks
     * disabled but stays pressable, for the modal to answer a press — a tap
     * on a phone too — by saying the same; and it is its hint, under the
     * label, and what a screen reader hears with it.
     */
    reason?: string;
    /**
     * Where it leads, as a path in data: a link with the same look, loading
     * the page in full as the admin's other ways to the site do. `disabled`
     * and `reason` are a button's alone.
     */
    to?: string;
  }>(),
  // Without it Vue would read a missing `phoneDone` as false, and every
  // phone square would carry a hidden check.
  {
    variant: 'default',
    size: 'default',
    disabled: false,
    phoneDone: undefined,
  },
);

const slots = useSlots();
const reasonId = useId();
const blocked = computed(() =>
  Boolean(!props.to && !props.disabled && props.reason),
);
const hint = computed(() => {
  if (blocked.value)
    return titlePopup(
      { text: props.label, bold: true },
      ...props.reason!.split('\n').map((text) => ({ text, italic: true })),
    );
  return props.icon && !slots.default
    ? { 'data-title-popup': props.label }
    : {};
});
const attributes = computed(() => ({
  ...(props.to
    ? { to: sitePath(props.to), external: true }
    : {
        type: 'button',
        disabled: props.disabled,
        'aria-disabled': blocked.value ? 'true' : undefined,
        'aria-describedby': blocked.value ? reasonId : undefined,
      }),
  ...hint.value,
}));
</script>

<template>
  <component
    :is="to ? TheiLink : 'button'"
    v-bind="attributes"
    :aria-label="label"
    class="flex shrink-0 cursor-pointer items-center justify-center gap-1
      rounded-normal text-sm font-semibold transition-colors off:cursor-auto"
    :class="{
      'h-9 px-xs pointer-coarse:h-11': size === 'default',
      'size-7 px-0': size === 'compact',
      'bg-bg-3 text-text-2': variant !== 'accent',
      // Its popup open, it looks as it does under the pointer.
      [`popup-open:bg-bg-4 popup-open:text-text-1 not-off:hocus:bg-bg-4
      not-off:hocus:text-text-1`]: variant === 'default',
      [`popup-open:bg-bg-error popup-open:text-text-error
      not-off:hocus:bg-bg-error not-off:hocus:text-text-error`]:
        variant === 'delete',
      'bg-accent/80 text-white popup-open:bg-accent not-off:hocus:bg-accent':
        variant === 'accent',
      'off:bg-bg-accent off:text-text-2': variant === 'accent',
      'pointer-events-none opacity-40': !to && disabled && size === 'compact',
      'w-9 px-0 pointer-coarse:w-11':
        size === 'default' && icon && !$slots.default,
      'max-sm:w-9 max-sm:px-0 max-sm:pointer-coarse:w-11':
        size === 'default' && phoneIcon,
    }"
  >
    <Icon v-if="icon" :name="icon" :class="iconClass" />
    <Icon
      v-if="phoneIcon"
      :name="phoneIcon"
      class="sm:hidden"
      :class="{ hidden: phoneDone }"
    />
    <Icon
      v-if="phoneIcon && phoneDone !== undefined"
      name="check"
      class="sm:hidden"
      :class="{ hidden: !phoneDone }"
    />
    <span v-if="phoneIcon" class="max-sm:hidden"><slot></slot></span>
    <slot v-else></slot>
    <span v-if="blocked" :id="reasonId" hidden>{{ reason }}</span>
  </component>
</template>

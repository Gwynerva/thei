<script lang="ts" setup>
/**
 * A box ticked in an action's card: a row of a bundle, a part of a new
 * entity (`small`). Unticked, its border says what ticking it means — a
 * change that cannot be undone, or one left to the owner's call.
 */
defineProps<{
  checked: boolean;
  label: string;
  small?: boolean;
  tone?: 'error' | 'warning';
  disabled?: boolean;
}>();
const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    type="button"
    role="checkbox"
    :aria-checked="checked"
    :aria-label="label"
    :disabled
    class="flex shrink-0 cursor-pointer items-center justify-center rounded-sm
      bg-transparent focus-visible:ring-2 focus-visible:ring-accent"
    :class="
      small
        ? '-m-1 p-1 pointer-coarse:-m-2 pointer-coarse:p-2'
        : '-m-1.5 p-1.5 pointer-coarse:-m-2.5 pointer-coarse:p-2.5'
    "
    @click="emit('toggle')"
  >
    <span
      class="flex items-center justify-center rounded-sm border-[1.5px]
        transition"
      :class="[
        small ? 'size-4' : 'size-4.5',
        checked
          ? 'border-accent bg-accent text-white dark:text-bg-1'
          : tone === 'error'
            ? 'border-text-error bg-bg-1'
            : tone === 'warning'
              ? 'border-text-warning bg-bg-1'
              : 'border-border-2 bg-bg-1',
      ]"
    >
      <Icon
        v-if="checked"
        name="check"
        :class="small ? 'text-2xs' : 'text-xs'"
      />
    </span>
  </button>
</template>

<script lang="ts" setup>
/**
 * A form's main action, at the end of its sticky header: its words —
 * «Сохранить», «Сохранено», «Создать». On a phone, where the header holds a
 * title and a few squares, it is a square with a floppy disk, named by the
 * same words — and a check once all of the form is saved, so a pale
 * square never has to be read as «saved».
 */
defineProps<{
  label: string;
  saving?: boolean;
  disabled?: boolean;
  /** Everything in the form is saved: nothing left to save. */
  done?: boolean;
}>();
</script>

<template>
  <Button
    class="flex h-9 shrink-0 items-center justify-center gap-xs font-semibold
      max-sm:w-9 max-sm:px-0 max-sm:text-base pointer-coarse:h-11
      max-sm:pointer-coarse:w-11"
    :disabled
    :aria-label="label"
    :data-admin-save="done ? 'done' : ''"
  >
    <Icon v-if="saving" name="loading" class="shrink-0" />
    <Icon v-else :name="done ? 'check' : 'save'" class="shrink-0 sm:hidden" />
    <span class="max-sm:hidden">{{ label }}</span>
  </Button>
</template>

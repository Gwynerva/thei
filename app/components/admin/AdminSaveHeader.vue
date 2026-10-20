<script setup lang="ts">
import type { ComputedRef } from 'vue';
import type { IconName } from '#thei/icons';

/**
 * The sticky header of an admin form: its icon and title, then its controls
 * (the slot — the ✦ of AI), the delete square of what can be deleted, and
 * Save at the end. Under it, the line of why the last save failed or what
 * the form still needs; a press of Save, as Ctrl+S, goes to the form's
 * `useFormNeeds`, which saves or says so.
 */
defineProps<{
  title: string;
  icon: IconName;
  /** Something in the form differs from what is stored. */
  dirty: boolean;
  saving: boolean;
  /** The form of something not made yet: its Save says «Create», never «Saved». */
  creating?: boolean;
  /** Shows the delete square, which emits `delete`. */
  deletable?: boolean;
  /** The form's `useFormNeeds`: its reason, its line and its submit. */
  needs: {
    reason: ComputedRef<string | undefined>;
    line: ComputedRef<{ message?: string; again: number }>;
    submit: () => unknown;
  };
}>();
defineEmits<{ delete: [] }>();
</script>
<template>
  <StickyGlassHeader
    width="var(--width-wide)"
    :error="needs.line.value.message"
    :error-again="needs.line.value.again"
  >
    <div class="flex items-center justify-between gap-xs py-xs">
      <h1 class="flex min-w-0 items-center gap-xs text-lg font-bold sm:text-xl">
        <Icon :name="icon" class="shrink-0" /><span class="truncate">{{
          title
        }}</span>
      </h1>
      <div class="flex shrink-0 items-center gap-xs">
        <slot />
        <Button
          v-if="deletable"
          variant="delete"
          size="icon"
          class="pointer-coarse:size-11"
          :aria-label="phrase.delete"
          :data-title-popup="phrase.delete"
          @click="$emit('delete')"
        >
          <Icon name="delete" />
        </Button>
        <AdminSaveButton
          :label="creating ? phrase.create : dirty ? phrase.save : phrase.saved"
          :saving
          :done="!creating && !dirty"
          :disabled="saving || (!creating && !dirty)"
          :reason="needs.reason.value"
          @click="needs.submit()"
        />
      </div>
    </div>
  </StickyGlassHeader>
</template>

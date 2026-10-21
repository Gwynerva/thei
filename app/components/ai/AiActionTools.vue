<script lang="ts" setup>
/**
 * The tools of an action's card, wherever they stand — the first line of a
 * row of a bundle, or the card's footer — one group at a time: the squares
 * that lead (correct its words, open its parts, or comment), the two that
 * end a correction, or the way back once it is decided. A row of a bundle
 * keeps a correction with a square (`inRow`): the bundle is applied at its
 * foot.
 */
const props = defineProps<{
  group: 'lead' | 'editing' | 'back';
  /** Neutral buttons stand out from the ground they stand on. */
  variant: 'secondary' | 'raised';
  inRow?: boolean;
  editable?: boolean;
  /** Its parts are gone through on a screen of their own, not commented. */
  opens?: boolean;
  saving?: boolean;
  busy?: boolean;
  /** What applying the corrected words does, said on it in a footer. */
  applyWord?: string;
  undoable?: boolean;
  restorable?: boolean;
  restoreLabel?: string;
}>();
const emit = defineEmits<{
  edit: [];
  open: [];
  comment: [];
  cancel: [];
  save: [];
  undo: [];
  restore: [];
}>();

/** The comment button, which its popup points at and marks open. */
const trigger = useTemplateRef<{ $el: HTMLElement }>('trigger');
defineExpose({ commentButton: computed(() => trigger.value?.$el) });

/** A button with its word beside its icon. */
const worded = computed(
  () =>
    `flex h-8 items-center gap-1 text-sm pointer-coarse:h-11 ${props.inRow ? 'px-2' : 'px-2.5'}`,
);
</script>

<template>
  <template v-if="group === 'lead'">
    <Button
      v-if="editable"
      :variant
      size="icon-sm"
      class="pointer-coarse:size-11"
      :aria-label="phrase.ai_action_edit"
      :data-title-popup="phrase.ai_action_edit"
      data-action-edit
      @click="emit('edit')"
    >
      <Icon name="edit" />
    </Button>
    <Button
      v-if="opens"
      :variant
      size="icon-sm"
      class="pointer-coarse:size-11"
      :aria-label="phrase.ai_action_open"
      :data-title-popup="phrase.ai_action_open"
      data-action-open
      @click="emit('open')"
    >
      <Icon name="chevron-right" />
    </Button>
    <span v-else class="inline-flex">
      <Button
        ref="trigger"
        :variant
        size="icon-sm"
        class="pointer-coarse:size-11"
        :aria-label="phrase.ai_action_comment"
        :data-title-popup="phrase.ai_action_comment"
        data-action-comment
        @click="emit('comment')"
      >
        <Icon name="comment" />
      </Button>
    </span>
  </template>

  <!-- Correcting its words: back as it was, or kept — in a footer, applied
       as corrected. -->
  <template v-else-if="group === 'editing'">
    <Button
      :variant
      size="icon-sm"
      class="pointer-coarse:size-11"
      :aria-label="phrase.ai_action_edit_cancel"
      :data-title-popup="phrase.ai_action_edit_cancel"
      data-action-edit-cancel
      @click="emit('cancel')"
    >
      <Icon name="undo" />
    </Button>
    <Button
      v-if="inRow"
      size="icon-sm"
      class="pointer-coarse:size-11"
      :disabled="saving || busy"
      :aria-label="phrase.ai_action_edit_save"
      :data-title-popup="phrase.ai_action_edit_save"
      data-action-edit-apply
      @click="emit('save')"
    >
      <Icon :name="saving ? 'loading' : 'check'" />
    </Button>
    <Button
      v-else
      class="flex h-8 items-center gap-1 px-2.5 text-sm font-semibold
        pointer-coarse:h-11"
      :disabled="saving || busy"
      :aria-label="phrase.ai_action_edit_apply"
      :data-title-popup="phrase.ai_action_edit_apply"
      data-action-edit-apply
      @click="emit('save')"
    >
      <Icon :name="saving ? 'loading' : 'check'" />{{ applyWord }}
    </Button>
  </template>

  <template v-else>
    <Button
      v-if="undoable"
      :variant
      :class="worded"
      :disabled="busy"
      :data-title-popup="phrase.ai_action_undo"
      data-action-undo
      @click="emit('undo')"
    >
      <Icon name="history" />{{ phrase.ai_action_undo }}
    </Button>
    <Button
      v-else-if="restorable"
      :variant
      :class="worded"
      :disabled="busy"
      :aria-label="restoreLabel"
      :data-title-popup="restoreLabel"
      data-action-restore
      @click="emit('restore')"
    >
      <Icon name="undo" />{{ phrase.ai_action_restore_short }}
    </Button>
  </template>
</template>

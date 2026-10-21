<script lang="ts" setup>
import { wearFieldLabelName } from './field-label';

const props = defineProps<{
  required?: boolean;
  onActivate?: (element: HTMLElement) => void;
}>();

const root = useTemplateRef('root');
/**
 * Its words, without the asterisk and the ✦, name the field's control where
 * it has no name of its own (`field-label.ts`).
 */
const nameId = wearFieldLabelName();
/** What an AI proposes for the field: the label turns accent, with a ✦. */
const { place, offered } = useFieldOffers('label');
/**
 * A save was refused for this field (`form-needs.ts`): the label turns to
 * the error's colour, its ✦ keeping its own, until the field is filled.
 */
const needed = inject(FIELD_NEED_MARKED, undefined);

function handleClick() {
  const target = root.value
    ?.closest('[data-field]')
    ?.querySelector<HTMLElement>('[data-label-focus]');

  if (!target) {
    return;
  }

  if (props.onActivate) {
    props.onActivate(target);
  } else {
    target.focus();
  }
}
</script>

<template>
  <div
    ref="root"
    class="cursor-pointer font-semibold tracking-tight transition-colors"
    data-field-label
    :data-field-needed="needed ? '' : undefined"
    :class="needed ? 'text-text-error' : offered ? 'text-accent' : ''"
    @click="handleClick"
  >
    <span v-if="nameId" :id="nameId" class="contents"><slot></slot></span
    ><slot v-else></slot
    ><span
      v-if="required"
      class="relative -top-1 -right-1.5 text-xs transition-colors"
      :class="needed ? 'text-text-error' : 'text-accent'"
      data-field-label-extra
      >*</span
    ><AiFieldOffer
      v-if="place"
      :place
      :class="required ? 'ml-3' : 'ml-1.5'"
      data-field-label-extra
    />
  </div>
</template>

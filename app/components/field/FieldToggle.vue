<script lang="ts" setup>
defineProps<{
  label?: string;
  /** Names the switch when nothing visible next to it does. */
  switchLabel?: string;
}>();

const model = defineModel<boolean>();
/** In a field with no label, the switch's words show what an AI proposes. */
const { place, offered } = useFieldOffers('switch');
</script>

<template>
  <div class="flex items-center gap-sm">
    <div
      v-if="label"
      class="cursor-pointer font-semibold tracking-tight transition-colors
        select-none"
      :class="offered ? 'text-accent' : ''"
      @click="model = !model"
    >
      {{ label }}
    </div>
    <span v-else :class="offered ? 'text-accent' : ''"><slot></slot></span>
    <AiFieldOffer v-if="place" :place />

    <div
      v-if="$slots.inactive"
      class="cursor-pointer font-semibold tracking-tight transition-colors
        select-none"
      :class="model ? 'text-text-2' : ''"
      @click="model = !model"
    >
      <slot name="inactive"></slot>
    </div>
    <div
      class="group rounded-full border-2 border-border-1 transition
        hocus:border-border-3"
    >
      <button
        type="button"
        role="switch"
        :aria-checked="model"
        :aria-label="switchLabel"
        @click="model = !model"
        class="relative block h-6 w-11 shrink-0 cursor-pointer rounded-full
          transition-colors pointer-coarse:before:absolute
          pointer-coarse:before:-inset-x-1 pointer-coarse:before:-inset-y-2.5
          pointer-coarse:before:content-['']"
        :class="model ? 'bg-accent' : 'bg-bg-1'"
      >
        <span
          class="absolute top-1 size-4 rounded-full transition-all"
          :class="
            model
              ? 'left-6 bg-white'
              : 'left-1 bg-border-1 group-hocus:bg-border-2'
          "
        />
      </button>
    </div>
    <div
      v-if="$slots.active"
      class="cursor-pointer font-semibold tracking-tight transition-colors
        select-none"
      :class="model ? '' : 'text-text-2'"
      @click="model = !model"
    >
      <slot name="active"></slot>
    </div>
  </div>
</template>

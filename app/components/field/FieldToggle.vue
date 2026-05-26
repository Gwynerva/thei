<script lang="ts" setup>
const model = defineModel<boolean>();
</script>

<template>
  <div class="flex items-center gap-sm">
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
      v-if="$slots.default"
      class="cursor-pointer font-semibold tracking-tight select-none"
      @click="model = !model"
    >
      <slot></slot>
    </div>
    <div
      class="group rounded-full border-2 border-border-1 transition
        hocus:border-border-3"
    >
      <button
        type="button"
        role="switch"
        :aria-checked="model"
        @click="model = !model"
        class="relative block h-6 w-11 shrink-0 cursor-pointer rounded-full
          transition-colors"
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

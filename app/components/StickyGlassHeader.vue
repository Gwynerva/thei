<script lang="ts" setup>
defineOptions({ inheritAttrs: false });

const { error } = defineProps<{ width?: string; error?: string }>();
const attrs = useAttrs();

const isAdmin = useIsAdmin();
const errorClosed = ref(false);

watch(
  () => error,
  () => {
    errorClosed.value = false;
  },
);
</script>

<template>
  <Sticky
    :style="`--_width-sticky-content: ${width || '100%'}`"
    class="z-10 shadow-lg shadow-transparent transition-shadow
      sticky-stuck:shadow-shadow-1"
    :class="isAdmin ? 'top-(--height-admin-bar)' : 'top-0'"
  >
    <!-- Header Content -->
    <div class="border-b border-border-1 bg-bg-1/40 backdrop-blur-md">
      <div class="m-auto w-(--_width-sticky-content) px-window" v-bind="attrs">
        <slot></slot>
      </div>
    </div>

    <!-- Header Error -->
    <div
      v-if="error && !errorClosed"
      class="border-b border-border-error bg-bg-error py-xs text-sm
        text-text-error"
    >
      <div class="relative m-auto w-(--_width-sticky-content) px-window">
        <button
          class="float-right cursor-pointer pb-1 pl-1"
          @click="errorClosed = true"
        >
          <Icon name="plus" class="rotate-45" />
        </button>
        <Icon name="warning" class="mr-xs" />
        <span>{{ error }}</span>
      </div>
    </div>
  </Sticky>
</template>

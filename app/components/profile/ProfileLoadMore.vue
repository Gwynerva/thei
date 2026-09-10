<script setup lang="ts">
const props = defineProps<{
  more: boolean;
  loading: boolean;
  error: boolean;
}>();
const emit = defineEmits<{ load: [] }>();
const root = useTemplateRef<HTMLElement>('root');
let observer: IntersectionObserver | undefined;
watch(
  root,
  (element) => {
    observer?.disconnect();
    if (!element || !import.meta.client) return;
    observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((e) => e.isIntersecting) &&
          props.more &&
          !props.loading &&
          !props.error
        )
          emit('load');
      },
      { root: root.value?.parentElement, rootMargin: '160px' },
    );
    observer.observe(element);
  },
  { flush: 'post' },
);
onUnmounted(() => observer?.disconnect());
</script>
<template>
  <div
    v-if="more || loading || error"
    ref="root"
    class="flex shrink-0 items-center justify-center p-sm"
  >
    <button
      type="button"
      :disabled="loading"
      class="cursor-pointer text-sm text-accent"
      @click="$emit('load')"
    >
      <Icon v-if="loading" name="loading" /><span v-else>{{
        error ? phrase.profile_load_error : phrase.profile_more
      }}</span>
    </button>
  </div>
</template>

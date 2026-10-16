<script lang="ts" setup>
defineOptions({ inheritAttrs: false });

/**
 * A card over the blurred page. Its ground is a surface's; a text's editor
 * takes the page's own (`ground="page"`), so a text is written on what it
 * is read on.
 */
const { ground = 'surface' } = defineProps<{ ground?: 'surface' | 'page' }>();

const root = useTemplateRef<HTMLElement>('root');
defineExpose({ root });

function overlayClick() {
  closeModal();
}
</script>

<template>
  <section
    ref="root"
    class="absolute inset-0 sm:flex sm:items-center sm:justify-center sm:py-10"
  >
    <!-- Around the card a click closes it. The blurred page under it is the
         dialog's own, one for every card (`Modal.vue`). -->
    <div
      @click="overlayClick"
      class="absolute inset-0 max-sm:pointer-events-none"
    ></div>
    <!-- Modal -->
    <div
      v-bind="$attrs"
      class="relative scrollbar-mini max-h-full w-full min-w-[320px]
        overflow-auto border-border-1 shadow-shadow-2 max-sm:max-w-none
        sm:rounded-normal sm:border sm:shadow-xl"
      :class="ground === 'page' ? 'bg-bg-1' : 'bg-bg-2'"
    >
      <header
        class="sticky top-0 z-10 border-b border-border-1 bg-bg-2/30
          backdrop-blur-md"
      >
        <slot name="header"></slot>
      </header>
      <main>
        <slot></slot>
      </main>
      <footer
        v-if="$slots.footer"
        class="sticky bottom-0 z-10 border-t border-border-1 bg-bg-2/80
          backdrop-blur-md"
      >
        <slot name="footer"></slot>
      </footer>
    </div>
  </section>
</template>

<script lang="ts" setup>
defineOptions({ inheritAttrs: false });

const { flushMobile } = defineProps<{
  width?: string;
  error?: string;
  /** Counts the times the same error is said again: see `HeaderErrorLine`. */
  errorAgain?: number;
  /** Drops the side window padding on mobile for edge-to-edge controls. */
  flushMobile?: boolean;
}>();
const attrs = useAttrs();

const isAdmin = useIsAdmin();
const stickyTop = computed(() =>
  isAdmin.value ? 'var(--height-admin-bar)' : '0px',
);
const headerContent = useTemplateRef<HTMLElement>('headerContent');
const stickyHeaderContext = useStickyHeaderContext();
let unregisterHeader: (() => void) | undefined;

onMounted(() => {
  if (headerContent.value) {
    unregisterHeader = stickyHeaderContext?.register(headerContent.value);
  }
});

onBeforeUnmount(() => unregisterHeader?.());
</script>

<template>
  <Sticky
    :top="stickyTop"
    :style="`--_width-sticky-content: ${width || '100%'}`"
    class="z-10 shadow-lg shadow-transparent transition-shadow"
    :class="
      stickyHeaderContext?.secondaryStuck.value
        ? undefined
        : 'sticky-stuck:shadow-shadow-1'
    "
  >
    <div ref="headerContent">
      <!-- Header Content -->
      <GlassSurface>
        <div
          class="m-auto w-(--_width-sticky-content) max-w-full"
          :class="flushMobile ? 'sm:px-window' : 'px-xs sm:px-window'"
          v-bind="attrs"
        >
          <slot></slot>
        </div>
      </GlassSurface>

      <HeaderErrorLine :message="error" :again="errorAgain" />
    </div>
  </Sticky>
</template>

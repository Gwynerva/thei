<script lang="ts" setup>
import {
  useFloating,
  offset,
  flip,
  shift,
  size,
  hide,
  autoUpdate,
} from '@floating-ui/vue';
import { isTitlePopupGap } from '#layers/thei/app/composables/title-popup-content';

const { anchor, lines, visible, popupClass } = useTitlePopup();

const floatingEl = ref<HTMLElement>();

const teleportTarget = computed<string | HTMLElement>(
  () => anchor.value?.closest('dialog') ?? 'body',
);

const hasText = computed(() =>
  lines.value.some((line) => !isTitlePopupGap(line) && line.spans.length),
);

/** Keeps clear of the viewport edge, like a native tooltip. */
const EDGE_PADDING = 8;

// `fixed` keeps the popup out of the document flow: an absolutely positioned
// popup near the page edge would grow the page and bring scrollbars with it.
const { floatingStyles, middlewareData } = useFloating(anchor, floatingEl, {
  strategy: 'fixed',
  placement: 'bottom',
  middleware: [
    offset(6),
    flip({ padding: EDGE_PADDING }),
    shift({ padding: EDGE_PADDING }),
    // Too much text for the room left: cut at the edge rather than spill out.
    size({
      padding: EDGE_PADDING,
      apply({ availableWidth, availableHeight, elements }) {
        Object.assign(elements.floating.style, {
          maxWidth: `min(18.75rem, ${Math.max(0, availableWidth)}px)`,
          maxHeight: `${Math.max(0, availableHeight)}px`,
        });
      },
    }),
    hide(),
  ],
  whileElementsMounted: autoUpdate,
});

const hidden = computed(() => middlewareData.value.hide?.referenceHidden);
</script>

<template>
  <Teleport :to="teleportTarget">
    <TransitionFade>
      <div
        v-if="visible && hasText"
        ref="floatingEl"
        data-title-popup-el
        :style="[floatingStyles, hidden ? { visibility: 'hidden' } : {}]"
        :class="popupClass || undefined"
        class="pointer-events-none z-9999 w-max max-w-75 overflow-hidden rounded
          bg-bw-reverse px-2 py-1 text-xs font-normal wrap-break-word text-bw
          shadow-md"
      >
        <template v-for="(line, index) in lines" :key="index">
          <div v-if="isTitlePopupGap(line)" class="h-1.5" aria-hidden="true" />
          <div v-else :class="line.clamp && 'line-clamp-3'">
            <span
              v-for="(span, spanIndex) in line.spans"
              :key="spanIndex"
              :class="[span.italic && 'italic', span.bold && 'font-semibold']"
              >{{ span.text }}</span
            >
          </div>
        </template>
      </div>
    </TransitionFade>
  </Teleport>
</template>

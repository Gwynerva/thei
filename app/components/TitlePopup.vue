<script lang="ts" setup>
import { isTitlePopupGap } from '#layers/thei/app/composables/title-popup-content';
import {
  POPUP_ARROW_SIZE,
  POPUP_ARROW_TIP,
  POPUP_GAP,
  POPUP_VIEWPORT_PADDING,
  usePopupPlacement,
} from '#layers/thei/app/composables/popup-placement';

/**
 * The hint of the site: a small dark label by what it explains, with an
 * arrow at it, placed as every popup is (`usePopupPlacement`). Under a
 * pointer it hangs below; a finger would cover it there, so a hint a finger
 * opened sits above. It points, and takes no pointer and no focus.
 */
const { anchor, lines, visible, popupClass, placement } = useTitlePopup();

const floatingEl = ref<HTMLElement>();
const arrowEl = ref<HTMLElement>();

/**
 * The anchor the hint was last shown at. A hidden hint fades out where it
 * was: moved from a modal's dialog to the page under it as its anchor goes,
 * it would vanish at once behind the dialog.
 */
const shownAt = shallowRef<HTMLElement>();
watch(anchor, (el) => {
  if (el) shownAt.value = el;
});
const teleportTarget = computed<string | HTMLElement>(
  () => shownAt.value?.closest('dialog') ?? 'body',
);

const hasText = computed(() =>
  lines.value.some((line) => !isTitlePopupGap(line) && line.spans.length),
);
const shown = computed(() => visible.value && hasText.value);

const { floatingStyles, side, hidden, arrowStyle, origin } = usePopupPlacement(
  anchor,
  floatingEl,
  arrowEl,
  {
    open: shown,
    placement,
    gap: POPUP_GAP,
    padding: POPUP_VIEWPORT_PADDING,
    arrowSize: POPUP_ARROW_SIZE.hint,
    border: 0,
    // Too much text for the room left: cut at the edge rather than spill out.
    onRoom: (room, element) => {
      Object.assign(element.style, {
        maxWidth: `min(18.75rem, ${room.width}px)`,
        maxHeight: `${room.height}px`,
      });
      element.style.setProperty('--hint-room', `${room.height}px`);
    },
  },
);
</script>

<template>
  <Teleport :to="teleportTarget">
    <Transition
      enter-from-class="scale-95 opacity-0 motion-reduce:scale-100"
      enter-active-class="transition-[opacity,scale] motion-reduce:duration-0"
      leave-to-class="scale-95 opacity-0 motion-reduce:scale-100"
      leave-active-class="transition-[opacity,scale] motion-reduce:duration-0"
    >
      <div
        v-if="shown"
        ref="floatingEl"
        role="tooltip"
        data-title-popup-el
        :data-popup-side="side"
        :style="[
          floatingStyles,
          { transformOrigin: origin },
          hidden ? { visibility: 'hidden' } : {},
        ]"
        :class="popupClass || undefined"
        class="pointer-events-none z-9999 w-max max-w-75 rounded bg-bw-reverse
          px-2 py-1 text-xs font-normal wrap-break-word text-bw shadow-hint"
      >
        <!-- Its lines are cut inside the label's padding: the label itself
             may not clip, or its arrow would go with what it cuts. -->
        <div
          class="max-h-[calc(var(--hint-room,100dvh)-0.5rem)] overflow-hidden"
        >
          <template v-for="(line, index) in lines" :key="index">
            <div
              v-if="isTitlePopupGap(line)"
              class="h-1.5"
              aria-hidden="true"
            />
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
        <span
          ref="arrowEl"
          class="absolute rotate-45 bg-bw-reverse"
          :class="POPUP_ARROW_TIP[side]"
          :style="arrowStyle"
          aria-hidden="true"
          data-popup-arrow
        ></span>
      </div>
    </Transition>
  </Teleport>
</template>

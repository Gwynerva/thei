<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import AsideModalButton from './AssetModalButton.vue';
import { provideAssetModalActions } from './actions';

/**
 * A file's window: the file, and beside it — under it on a phone — its
 * panel. The panel's header is one slim row: what is open, by its kind's icon
 * and its name, after a Back of the `lead` slot when the panel goes screen by
 * screen; a phone folds the panel from it. The `aside` slot scrolls; the
 * `footer` slot is the panel's slim foot, its main action.
 */
const { closable = true } = defineProps<{
  asideTitle?: string;
  asideIcon?: IconName;
  /** The file's own name, as a visitor reads it: in the text's colour. */
  titleStrong?: boolean;
  /** A window waiting between two steps of a flow has nothing to close. */
  closable?: boolean;
}>();

const isAsideOpen = ref(true);
/** The buttons of a view inside: a file opened out of an archive's. */
const viewActions = provideAssetModalActions();

const root = useTemplateRef<HTMLElement>('root');
defineExpose({ root });
</script>

<template>
  <section ref="root" class="absolute flex h-dvh w-dvw flex-col sm:flex-row">
    <div
      class="relative flex min-h-0 min-w-0 flex-1 items-center justify-center
        bg-bg-1"
    >
      <div
        class="absolute top-0 right-0 z-10 flex flex-row-reverse gap-sm p-sm
          sm:flex-col"
      >
        <AsideModalButton
          v-if="closable"
          icon="close"
          :aria-label="phrase.close_modal"
          @click="closeModal"
        />
        <AsideModalButton
          v-for="action in viewActions"
          :key="action.key"
          :icon="action.icon"
          :href="action.href"
          :download="action.href ? action.download : undefined"
          :aria-label="action.label"
          :data-title-popup="action.label"
          :data-asset-action="action.key"
          @click="action.onClick?.()"
        >
          <span v-if="action.text" class="text-xs font-bold tabular-nums">{{
            action.text
          }}</span>
        </AsideModalButton>
        <!-- The window's own are the file's: a file opened out of it brings
             its own, and they come back with the file. -->
        <slot v-if="!viewActions.length" name="buttons"></slot>
      </div>
      <div v-if="$slots.nav" class="absolute top-0 left-0 z-10 p-sm">
        <slot name="nav"></slot>
      </div>

      <slot name="preview"></slot>
    </div>
    <div
      class="relative flex max-h-3/5 w-full shrink-0 flex-col border-t-2
        border-border-1 bg-bg-2 shadow-xl shadow-shadow-3 sm:max-h-none
        sm:max-w-75 sm:border-t-0 sm:border-l"
    >
      <div
        class="flex min-h-11 shrink-0 items-center gap-xs border-b
          border-border-1 py-1 pr-xs"
        :class="$slots.lead ? 'pl-1' : 'pl-sm'"
      >
        <slot name="lead"></slot>
        <h2
          class="flex min-w-0 flex-1 items-center gap-xs font-semibold
            tracking-tight"
          :class="titleStrong ? 'text-text-1' : 'text-text-2'"
          data-asset-panel-title
        >
          <Icon v-if="asideIcon" :name="asideIcon" class="shrink-0" />
          <span class="min-w-0 truncate">{{ asideTitle || phrase.asset }}</span>
        </h2>
        <button
          type="button"
          :aria-expanded="isAsideOpen"
          :aria-label="asideTitle || phrase.asset"
          class="flex size-7 shrink-0 cursor-pointer items-center justify-center
            rounded-normal text-text-2 transition sm:hidden hocus:text-text-1"
          @click="isAsideOpen = !isAsideOpen"
        >
          <Icon
            :name="isAsideOpen ? 'collapse-vertical' : 'expand-vertical'"
            class="size-5"
          />
        </button>
      </div>
      <div
        class="aside-content-panel min-h-0"
        :style="{ '--aside-h': isAsideOpen ? 'auto' : '0px' }"
      >
        <div class="flex h-full flex-col">
          <div class="min-h-0 flex-1 overflow-y-auto">
            <slot name="aside"></slot>
          </div>
          <div
            v-if="$slots.footer"
            class="flex shrink-0 items-center gap-xs border-t border-border-1
              bg-bg-2/80 p-xs backdrop-blur-md"
            data-asset-panel-footer
          >
            <slot name="footer"></slot>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

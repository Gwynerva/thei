<script setup lang="ts">
import { moveItemById } from '#layers/thei/app/composables/drag-sort';

/**
 * One of everything a hint can sit on, for `press-hints.spec.ts`: controls
 * whose tap acts, things whose tap does nothing, text fields, a link card,
 * a sortable list, scrollers and a dialog. Each counts its clicks.
 */
definePageMeta({ layout: false });

const clicks = reactive({ menu: 0, disabled: 0, chip: 0, dialog: 0 });
const menuOpen = ref(false);
const menuButton = useTemplateRef<HTMLElement>('menuButton');
const cardRoot = useTemplateRef<HTMLElement>('cardRoot');
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const chipList = useTemplateRef<HTMLElement>('chipList');
const chips = ref(['one', 'two', 'three']);

useDragSort(chipList, {
  onDrop: ({ id, newIndex }) => {
    chips.value = moveItemById(chips.value, id, newIndex, (chip) => chip);
  },
});
</script>

<template>
  <!-- Tailwind writes only the classes the layer's own app uses, so the
       geometry the spec relies on is set inline. -->
  <main
    class="flex flex-col items-start gap-md p-md"
    style="padding-top: 6rem"
  >
    <button
      ref="menuButton"
      type="button"
      class="rounded-normal bg-bg-3 px-sm py-xs"
      data-test-menu-button
      data-title-popup="Menu hint"
      :data-clicks="clicks.menu"
      @click="
        clicks.menu++;
        menuOpen = !menuOpen;
      "
    >
      Menu
    </button>
    <FloatingPopup
      v-model:open="menuOpen"
      :anchor="menuButton"
      placement="bottom-start"
    >
      <div data-test-menu class="bg-bg-2 p-sm">Menu content</div>
    </FloatingPopup>

    <a href="#followed" data-test-link data-title-popup="Link hint">Link</a>

    <button
      type="button"
      disabled
      data-test-disabled
      data-title-popup="Disabled hint"
      :data-clicks="clicks.disabled"
      @click="clicks.disabled++"
    >
      Disabled
    </button>

    <p>
      Some text with
      <abbr data-test-abbr data-title-popup="Abbr hint">TLA</abbr> inside.
    </p>

    <a href="#card" data-test-icon-link>
      Card
      <span role="img" tabindex="0" data-test-icon data-title-popup="Icon hint"
        >★</span
      >
    </a>

    <input
      data-test-input
      data-title-popup="Input hint"
      placeholder="Input"
      class="border border-border-1 p-xs"
    />
    <div contenteditable="true" data-test-editable class="p-xs">
      Editable
      <abbr data-test-editable-abbr data-title-popup="Editable hint">ED</abbr>
    </div>

    <div class="flex gap-md">
      <div
        data-test-scroller
        class="overflow-auto bg-bg-2"
        style="height: 6rem; width: 10rem"
      >
        <div class="pt-xs" style="height: 24rem">
          <abbr data-test-scroll-abbr data-title-popup="Scroll hint"
            >Scroll</abbr
          >
        </div>
      </div>
      <div
        data-test-other-scroller
        class="overflow-auto bg-bg-2"
        style="height: 6rem; width: 10rem"
      >
        <div style="height: 24rem">Other</div>
      </div>
    </div>

    <div ref="cardRoot">
      <a href="#card-followed" data-test-card-link>Card link</a>
    </div>
    <LinkHoverPopup
      v-slot="{ anchor }"
      :root="cardRoot"
      selector="a[data-test-card-link]"
    >
      <div data-test-card class="p-sm">Card of {{ anchor.textContent }}</div>
    </LinkHoverPopup>

    <div ref="chipList" class="flex gap-xs">
      <button
        v-for="chip in chips"
        :key="chip"
        type="button"
        class="rounded-normal bg-bg-3 px-md py-xs"
        :data-drag-id="chip"
        data-title-popup="Chip hint"
        data-test-chip
        @click="clicks.chip++"
      >
        {{ chip }}
      </button>
    </div>
    <output data-test-chip-clicks>{{ clicks.chip }}</output>

    <button type="button" data-test-open-dialog @click="dialog?.showModal()">
      Open dialog
    </button>
    <dialog ref="dialog" data-test-dialog class="p-md">
      <button type="button" data-test-dialog-first>First</button>
      <button
        type="button"
        data-test-dialog-button
        data-title-popup="Dialog hint"
        @click="clicks.dialog++"
      >
        In dialog
      </button>
    </dialog>
  </main>
</template>

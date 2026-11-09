<script lang="ts" setup>
import { analyzeContentData } from '#layers/thei/shared/content';
import {
  excerptsAssetUsageDelta,
  type ExcerptItem,
} from '#layers/thei/shared/excerpt';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import { adminExcerptModal } from './excerpt-modals';
import { excerptsFormKey } from './excerpts-form';
import AdminExcerptRow from './AdminExcerptRow.vue';

/**
 * The excerpts of a diary entry, an event or a project, in their form: the
 * block a project's sections are, without the tabs — one list in the order
 * the owner drags them into, each a row that opens the excerpt in its modal,
 * the same one "+" opens for a new one. The form it is in provides what the
 * block needs of it (`excerptsFormKey`).
 */
const form = inject(excerptsFormKey)!;
const route = useRoute();
const root = useTemplateRef<HTMLElement>('root');
const excerpts = computed(() => form.excerpts());
const parts = useModalParts({
  uuid: 'excerptUuid',
  // `?excerpt=<publicId>`: the admin bar on an excerpt's page lands here.
  query: 'excerpt',
  items: () => excerpts.value,
  setItems: form.setExcerpts,
  savedItems: form.savedExcerpts,
  atOwnAddress: () => {
    const parentId = form.parentId();
    return Boolean(parentId && route.path.includes(parentId));
  },
  open: (target) => openItem(target),
  root,
  handle: '[data-excerpt-handle]',
});
const itemViews = computed(() =>
  excerpts.value.map((item) => ({
    item,
    id: parts.itemId(item),
    media:
      item.bannerMedia ?? analyzeContentData(item.content?.data).preview.media,
  })),
);

function openItem(target?: ExcerptItem): Promise<void> {
  return parts.edit(target, (edit) =>
    openModal(adminExcerptModal, {
      form,
      item: target,
      onSave: (item: ExcerptItem) => {
        const merged = edit.take(item);
        form.saveAfterItemEdit(merged, merged.excerptUuid);
      },
      stored: edit.stored,
      // The excerpt as the modal holds it, in place of the one it was
      // opened with, against the excerpts as last saved.
      usageDelta: (draft: ExcerptItem) =>
        excerptsAssetUsageDelta(edit.withDraft(draft), form.savedExcerpts()),
    }),
  );
}
</script>

<template>
  <div>
    <SectionHeader
      :icon="entityTypeIcon('excerpt')"
      :title="phrase.excerpts"
      :description="phrase.excerpts_hint"
      class="mb-md"
    >
      <template #action>
        <SectionAddButton :label="phrase.excerpt_add" @click="openItem()" />
      </template>
    </SectionHeader>

    <Box class="flex flex-col overflow-hidden" data-excerpts>
      <div ref="root" class="flex flex-col gap-2 p-sm sm:p-md">
        <AdminExcerptRow
          v-for="{ item, id, media } in itemViews"
          :key="id"
          :data-drag-id="id"
          :title="item.title"
          :summary="item.summary"
          :about="item.about"
          :media
          :is-private="item.isPrivate"
          @open="parts.guardClick(() => openItem(item))"
          @move="parts.moveWithKeyboard(item, $event)"
        />
        <p
          v-if="!itemViews.length"
          class="text-sm text-text-3 italic"
          data-excerpts-empty
        >
          {{ phrase.excerpts_empty }}
        </p>
      </div>
    </Box>
  </div>
</template>

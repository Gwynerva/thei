<script lang="ts" setup>
import type { ProfileHistoryPage } from '#layers/thei/shared/profile';
import type {
  NewStatus,
  StatusHistoryItem,
  UpdatedStatus,
} from '#layers/thei/shared/status';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { statusModal } from '#layers/thei/app/modals/status/modal';

/**
 * The status history editor, shared by the profile and by a project.
 *
 * Both owners edit statuses the same way, so the three edit lists, the pending
 * previews and the "empty only after a regular one" rule live here once rather
 * than in each form.
 */
const { historyUrl, initial, usageDelta } = defineProps<{
  /** The owner's admin history endpoint. */
  historyUrl: string;
  initial?: ProfileHistoryPage<StatusHistoryItem>;
  /** The rest of the form's pending asset changes, for the picker. */
  usageDelta: Record<string, number>;
  title: string;
  description: string;
  addLabel: string;
  emptyLabel: string;
}>();

const newStatuses = defineModel<NewStatus[]>('newStatuses', {
  required: true,
});
const updatedStatuses = defineModel<UpdatedStatus[]>('updatedStatuses', {
  required: true,
});
const deletedStatusIds = defineModel<string[]>('deletedStatusIds', {
  required: true,
});

const history = useProfileHistory<StatusHistoryItem>(historyUrl, initial);
const pendingPreviews = reactive(
  new Map<string, { createdAt: number; media?: MediaDescriptor }>(),
);
// Media previews of saved statuses edited since the last save.
const editedMedia = reactive(new Map<string, MediaDescriptor | undefined>());

const visibleStatuses = computed<StatusHistoryItem[]>(() => {
  // Looked up per row of a history that may run to hundreds.
  const updates = new Map(updatedStatuses.value.map((s) => [s.id, s]));
  const deleted = new Set(deletedStatusIds.value);
  return newStatuses.value
    .map((status): StatusHistoryItem => {
      const preview = pendingPreviews.get(status.id);
      return {
        id: status.id,
        createdAt: preview?.createdAt ?? 0,
        kind: status.kind,
        text: status.kind === 'regular' ? status.text : '',
        ...(status.kind === 'regular' && status.assetUuid
          ? { assetUuid: status.assetUuid }
          : {}),
        ...(preview?.media ? { media: preview.media } : {}),
      };
    })
    .reverse()
    .concat(
      history.items.value.map((status) => {
        const update = updates.get(status.id);
        if (!update) return status;
        const { assetUuid: _assetUuid, media: _media, ...rest } = status;
        const media = editedMedia.get(status.id);
        return {
          ...rest,
          // Editing is how an empty status is filled in.
          kind: 'regular' as const,
          text: update.text,
          ...(update.assetUuid ? { assetUuid: update.assetUuid } : {}),
          ...(media ? { media } : {}),
        };
      }),
    )
    .filter((status) => !deleted.has(status.id));
});
const canAddEmptyStatus = computed(
  () => visibleStatuses.value[0]?.kind === 'regular',
);

async function addStatus() {
  const result = await openModal(statusModal, {
    usageDelta,
    canAddEmptyStatus: canAddEmptyStatus.value,
  });
  if (result.type !== 'save') return;
  if (result.kind === 'regular')
    newStatuses.value = [
      ...newStatuses.value,
      {
        id: result.id,
        kind: 'regular',
        text: result.text,
        assetUuid: result.assetUuid,
      },
    ];
  else
    newStatuses.value = [
      ...newStatuses.value,
      { id: result.id, kind: 'empty' },
    ];
  pendingPreviews.set(result.id, {
    createdAt: Date.now(),
    media: result.kind === 'regular' ? result.media : undefined,
  });
}

async function editStatus(item: StatusHistoryItem) {
  // An empty status opens blank and becomes a regular one once filled in.
  const result = await openModal(statusModal, {
    usageDelta,
    canAddEmptyStatus: false,
    initial:
      item.kind === 'regular'
        ? {
            id: item.id,
            text: item.text,
            assetUuid: item.assetUuid,
            media: item.media,
          }
        : { id: item.id, text: '' },
  });
  if (result.type !== 'save' || result.kind !== 'regular') return;
  if (newStatuses.value.some((s) => s.id === item.id)) {
    newStatuses.value = newStatuses.value.map((s) =>
      s.id === item.id
        ? {
            id: s.id,
            kind: 'regular',
            text: result.text,
            assetUuid: result.assetUuid,
          }
        : s,
    );
    const preview = pendingPreviews.get(item.id);
    if (preview) preview.media = result.media;
    return;
  }
  const saved = history.items.value.find((s) => s.id === item.id);
  const updates = updatedStatuses.value.filter((s) => s.id !== item.id);
  // Editing a status back to what is stored leaves nothing to save.
  if (
    saved?.kind !== 'regular' ||
    saved.text !== result.text ||
    (saved?.assetUuid ?? undefined) !== result.assetUuid
  )
    updates.push({
      id: item.id,
      text: result.text,
      ...(result.assetUuid ? { assetUuid: result.assetUuid } : {}),
    });
  updatedStatuses.value = updates;
  editedMedia.set(item.id, result.media);
}

function removeStatus(id: string) {
  if (newStatuses.value.some((s) => s.id === id)) {
    newStatuses.value = newStatuses.value.filter((s) => s.id !== id);
    pendingPreviews.delete(id);
  } else {
    updatedStatuses.value = updatedStatuses.value.filter((s) => s.id !== id);
    deletedStatusIds.value = [...deletedStatusIds.value, id];
  }
}

function reset(page?: ProfileHistoryPage<StatusHistoryItem>) {
  pendingPreviews.clear();
  editedMedia.clear();
  if (page) history.reset(page);
}

defineExpose({ items: history.items, reset });
</script>

<template>
  <section>
    <div class="mb-md flex items-center justify-between gap-md">
      <SectionHeader icon="pulse" :title="title" :description="description" />
      <button
        type="button"
        class="size-12 shrink-0 cursor-pointer rounded-normal bg-bg-3
          text-text-2 transition-colors hocus:bg-bg-accent hocus:text-accent"
        :aria-label="addLabel"
        :data-title-popup="addLabel"
        @click="addStatus"
      >
        <Icon name="plus" />
      </button>
    </div>
    <Box class="max-h-120 overflow-y-auto px-sm sm:px-md"
      ><div class="divide-y divide-border-1">
        <ProfileStatusItem
          v-for="status in visibleStatuses"
          :key="status.id"
          :item="status"
          removable
          editable
          short-date
          @remove="removeStatus"
          @edit="editStatus"
        />
      </div>
      <p
        v-if="!visibleStatuses.length"
        class="py-md text-sm text-text-3 italic"
      >
        {{ emptyLabel }}
      </p>
      <ProfileLoadMore
        :more="Boolean(history.cursor.value)"
        :loading="history.loading.value"
        :error="history.error.value"
        @load="history.load"
    /></Box>
  </section>
</template>

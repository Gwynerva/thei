<script lang="ts" setup>
import type { ProfileHistoryPage } from '#layers/thei/shared/profile';
import {
  canAppendEmptyStatus,
  compareStatusesNewestFirst,
  type NewStatus,
  type StatusHistoryItem,
  type UpdatedStatus,
} from '#layers/thei/shared/status';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { toDateString } from '#layers/thei/shared/date-range';
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
        date: status.date ?? toDateString(new Date()),
        createdAt: preview?.createdAt ?? 0,
        kind: status.kind,
        text: status.kind === 'regular' ? status.text : '',
        ...(status.kind === 'regular' && status.assetUuid
          ? { assetUuid: status.assetUuid }
          : {}),
        ...(preview?.media ? { media: preview.media } : {}),
      };
    })
    .concat(
      history.items.value.map((status) => {
        const update = updates.get(status.id);
        if (!update) return status;
        const { assetUuid: _assetUuid, media: _media, ...rest } = status;
        const media = editedMedia.get(status.id);
        return {
          ...rest,
          // Anything to say is how an empty status is filled in; without it
          // an empty one has only moved to another day.
          kind:
            update.text || update.assetUuid ? ('regular' as const) : rest.kind,
          text: update.text,
          date: update.date ?? rest.date,
          ...(update.assetUuid ? { assetUuid: update.assetUuid } : {}),
          ...(media ? { media } : {}),
        };
      }),
    )
    .filter((status) => !deleted.has(status.id))
    .sort(compareStatusesNewestFirst);
});

/**
 * Whether an empty status may stand on this day: only right above a regular
 * one, and never right under another empty one. A new status is written after
 * everything else, so it goes on top of its day; an edited one keeps its place
 * among the statuses of the day. Pages load from the newest, so the status
 * above is always at hand; when the loaded pages hold nothing older, the rest
 * of the history decides, and only the server has it.
 */
function canBeEmptyOn(date: string, item?: StatusHistoryItem) {
  const self = {
    id: item?.id ?? '',
    date,
    createdAt: item?.createdAt ?? Number.MAX_SAFE_INTEGER,
  };
  const others = visibleStatuses.value.filter(
    (status) => status.id !== self.id,
  );
  const olderIndex = others.findIndex(
    (status) => compareStatusesNewestFirst(self, status) < 0,
  );
  const older = olderIndex < 0 ? undefined : others[olderIndex];
  const newer = others[(olderIndex < 0 ? others.length : olderIndex) - 1];
  if (newer?.kind === 'empty') return false;
  return older
    ? canAppendEmptyStatus(older.kind)
    : Boolean(history.cursor.value);
}

async function addStatus() {
  const result = await openModal(statusModal, {
    usageDelta,
    canBeEmptyOn: (date: string) => canBeEmptyOn(date),
  });
  if (result.type !== 'save') return;
  newStatuses.value = [
    ...newStatuses.value,
    result.kind === 'regular'
      ? {
          id: result.id,
          kind: 'regular',
          text: result.text,
          assetUuid: result.assetUuid,
          date: result.date,
        }
      : { id: result.id, kind: 'empty', date: result.date },
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
    canBeEmptyOn: (date: string) => canBeEmptyOn(date, item),
    initial: {
      id: item.id,
      kind: item.kind,
      date: item.date,
      text: item.kind === 'regular' ? item.text : '',
      ...(item.kind === 'regular'
        ? { assetUuid: item.assetUuid, media: item.media }
        : {}),
    },
  });
  if (result.type !== 'save') return;
  const text = result.kind === 'regular' ? result.text : '';
  const assetUuid = result.kind === 'regular' ? result.assetUuid : undefined;
  if (newStatuses.value.some((s) => s.id === item.id)) {
    newStatuses.value = newStatuses.value.map((s) =>
      s.id !== item.id
        ? s
        : result.kind === 'regular'
          ? { id: s.id, kind: 'regular', text, assetUuid, date: result.date }
          : { id: s.id, kind: 'empty', date: result.date },
    );
    const preview = pendingPreviews.get(item.id);
    if (preview)
      preview.media = result.kind === 'regular' ? result.media : undefined;
    return;
  }
  const saved = history.items.value.find((s) => s.id === item.id);
  const updates = updatedStatuses.value.filter((s) => s.id !== item.id);
  // Editing a status back to what is stored leaves nothing to save.
  if (
    saved?.kind !== result.kind ||
    saved.text !== text ||
    (saved.assetUuid ?? undefined) !== assetUuid ||
    saved.date !== result.date
  )
    updates.push({
      id: item.id,
      text,
      date: result.date,
      ...(assetUuid ? { assetUuid } : {}),
    });
  updatedStatuses.value = updates;
  editedMedia.set(
    item.id,
    result.kind === 'regular' ? result.media : undefined,
  );
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
    <SectionHeader
      icon="pulse"
      :title="title"
      :description="description"
      class="mb-md"
    >
      <template #action>
        <SectionAddButton :label="addLabel" @click="addStatus" />
      </template>
    </SectionHeader>
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

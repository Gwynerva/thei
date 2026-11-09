<script lang="ts" setup>
import { analyzeContentData } from '#layers/thei/shared/content';
import {
  excerptsAssetUsageDelta,
  type ExcerptItem,
} from '#layers/thei/shared/excerpt';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import {
  moveItemById,
  useDragSort,
} from '#layers/thei/app/composables/drag-sort';
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
const ai = useEntityAi();
const route = useRoute();
const root = useTemplateRef<HTMLElement>('root');
const unsavedIds = new WeakMap<object, string>();
const excerpts = computed(() => form.excerpts());
const itemViews = computed(() =>
  excerpts.value.map((item) => ({
    item,
    id: itemId(item),
    media:
      item.bannerMedia ?? analyzeContentData(item.content?.data).preview.media,
  })),
);

function itemId(item: ExcerptItem) {
  if (item.excerptUuid) return item.excerptUuid;
  let generated = unsavedIds.get(item);
  if (!generated) {
    generated = crypto.randomUUID();
    unsavedIds.set(item, generated);
  }
  return generated;
}

/**
 * Excerpts are addressed by the object the form holds, never by their
 * position: a modal or a confirmation stays open over the list while it is
 * dragged. The form mutates its excerpts in place when a save assigns them
 * identities, so the object stays a valid handle.
 */
function replaceItem(previous: ExcerptItem | undefined, next: ExcerptItem) {
  const index = previous ? excerpts.value.indexOf(previous) : -1;
  const list = [...excerpts.value];
  if (index < 0) list.push(next);
  else list[index] = next;
  form.setExcerpts(list);
}

/**
 * Removing is never saved on its own: it takes the excerpt's text, files
 * and page with it, so it waits for the form's Save button.
 */
function removeItem(target: ExcerptItem) {
  form.setExcerpts(
    excerpts.value.filter((item) => toRaw(item) !== toRaw(target)),
  );
}

/**
 * The modal keeps its own draft and does not learn what a save gives back:
 * the identity the server assigned to a new excerpt, and the time stamped
 * on its content. Both are carried over from the excerpt the form holds.
 */
function mergeSaved(
  previous: ExcerptItem | undefined,
  next: ExcerptItem,
): ExcerptItem {
  if (!previous) return next;
  const merged = { ...next };
  merged.excerptUuid ??= previous.excerptUuid;
  if (
    previous.content &&
    merged.content &&
    JSON.stringify(previous.content.data) ===
      JSON.stringify(merged.content.data) &&
    previous.content.contentUuid === merged.content.contentUuid
  )
    merged.content = previous.content;
  return merged;
}

const dragSort = useDragSort(root, {
  handle: '[data-excerpt-handle]',
  onDrop: ({ id, newIndex }) => move(id, newIndex),
});

function move(id: string, newIndex: number) {
  form.setExcerpts(moveItemById(excerpts.value, id, newIndex, itemId));
}

/** One modal at a time from this list. */
let busy = false;
async function exclusively(run: () => Promise<void>) {
  if (busy) return;
  busy = true;
  try {
    await run();
  } finally {
    busy = false;
  }
}

/**
 * Whether the form's last save holds the excerpt as the form holds it now.
 * An excerpt handed over from its modal waits in the form until the form
 * is saved with it.
 */
function excerptStored(excerpt: ExcerptItem | undefined) {
  const held =
    excerpt && excerpts.value.find((item) => toRaw(item) === toRaw(excerpt));
  const uuid = held?.excerptUuid;
  const stored = form
    .savedExcerpts()
    .find((item) => uuid && item.excerptUuid === uuid);
  return Boolean(stored) && JSON.stringify(held) === JSON.stringify(stored);
}

function openItem(target?: ExcerptItem) {
  return exclusively(async () => {
    const current = shallowRef(target);
    const result = await openModal(adminExcerptModal, {
      form,
      item: target,
      onSave: (item: ExcerptItem) => {
        const merged = mergeSaved(current.value, item);
        replaceItem(current.value, merged);
        current.value = merged;
        form.saveAfterItemEdit(merged, merged.excerptUuid);
      },
      stored: () => excerptStored(current.value),
      // The excerpt as the modal holds it, in place of the one it was
      // opened with, against the excerpts as last saved.
      usageDelta: (draft: ExcerptItem) =>
        excerptsAssetUsageDelta(
          current.value
            ? excerpts.value.map((item) =>
                toRaw(item) === toRaw(current.value) ? draft : item,
              )
            : [...excerpts.value, draft],
          form.savedExcerpts(),
        ),
    });
    if (result.type === 'deleted' && current.value) removeItem(current.value);
  });
}

/**
 * `?excerpt=<publicId>` opens that excerpt straight away: it is how the
 * admin bar on an excerpt's page lands here, and a link to an excerpt from
 * anywhere in the admin. Only once the form is on its entity's own address;
 * the query is dropped before the modal opens, so going back or reloading
 * does not open it again.
 */
async function openWanted() {
  const wanted = route.query.excerpt;
  if (typeof wanted !== 'string') return;
  const parentId = form.parentId();
  if (!parentId || !route.path.includes(parentId)) return;
  const target = excerpts.value.find((item) => item.publicId === wanted);
  const query = { ...route.query };
  delete query.excerpt;
  await navigateTo({ path: route.path, query }, { replace: true });
  if (target) await openItem(target);
}
onMounted(openWanted);
watch(() => route.query.excerpt, openWanted);

/** Moving a row moves its element, which loses the focus: the grip takes it back. */
async function moveWithKeyboard(target: ExcerptItem, direction: -1 | 1) {
  const newIndex = excerpts.value.indexOf(target) + direction;
  if (newIndex < 0 || newIndex >= excerpts.value.length) return;
  const id = itemId(target);
  move(id, newIndex);
  await nextTick();
  root.value
    ?.querySelector<HTMLElement>(`[data-drag-id="${id}"] [data-excerpt-handle]`)
    ?.focus();
}

// The parent's AI reads again when it saves: the excerpts' own with it.
void ai;
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
          :about="item.relations"
          :media
          :is-private="item.isPrivate"
          @open="dragSort.guardClick(() => openItem(item))"
          @move="moveWithKeyboard(item, $event)"
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

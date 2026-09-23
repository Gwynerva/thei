<script lang="ts" setup>
import { analyzeContentData } from '#layers/thei/shared/content';
import {
  compareProjectStages,
  type ProjectSectionContentItem,
  type ProjectStageContentItem,
} from '#layers/thei/shared/project-content-item';
import {
  moveItemById,
  useDragSort,
} from '#layers/thei/app/composables/drag-sort';
import {
  currentProjectUuidKey,
  projectDataInjectionKey,
  saveAfterItemEditKey,
} from '../composables';
import { projectContentItemModal } from './project-content-item-modal';
import { projectContentItemDeleteModal } from './project-content-item-delete-modal';
import ProjectContentItemRow from './ProjectContentItemRow.vue';

type Item = ProjectSectionContentItem | ProjectStageContentItem;

const props = defineProps<{ kind: 'stage' | 'section' }>();
const projectData = inject(projectDataInjectionKey)!;
const saveAfterItemEdit = inject(saveAfterItemEditKey, undefined);
const currentProjectUuid = inject(currentProjectUuidKey)!;
const route = useRoute();
const root = useTemplateRef<HTMLElement>('root');
const unsavedIds = new WeakMap<object, string>();
const items = computed<Item[]>(() =>
  props.kind === 'stage'
    ? (projectData.value.stages ?? [])
    : (projectData.value.contentSections ?? []),
);
const itemViews = computed(() =>
  items.value.map((item) => ({
    item,
    id: itemId(item),
    periods: 'periods' in item ? item.periods : [],
    analysis: analyzeContentData(item.content?.data),
  })),
);
const labels = computed(() =>
  props.kind === 'stage'
    ? {
        icon: 'calendar' as const,
        title: phrase.value.project_stages,
        description: phrase.value.project_stages_hint,
        add: phrase.value.project_stage_add,
        empty: phrase.value.project_stages_empty,
        private: phrase.value.project_stage_private,
        delete: phrase.value.delete_project_stage,
      }
    : {
        icon: 'file-tray-stack' as const,
        title: phrase.value.project_content_sections,
        description: phrase.value.project_content_sections_hint,
        add: phrase.value.content_section_add,
        empty: phrase.value.project_content_sections_empty,
        private: phrase.value.content_section_private,
        delete: phrase.value.delete_content_section,
      },
);

function itemId(item: Item) {
  const id = 'periods' in item ? item.stageUuid : item.sectionUuid;
  if (id) return id;
  let generated = unsavedIds.get(item);
  if (!generated) {
    generated = crypto.randomUUID();
    unsavedIds.set(item, generated);
  }
  return generated;
}

/** Stages keep their chronological order; sections keep the owner's. */
function setItems(next: Item[]) {
  if (props.kind === 'stage')
    projectData.value.stages = (next as ProjectStageContentItem[]).sort(
      compareProjectStages,
    );
  else projectData.value.contentSections = next as ProjectSectionContentItem[];
}

/**
 * Items are addressed by the object the project form holds, never by their
 * position: stages re-sort by their periods, sections are dragged, and a modal
 * or a confirmation stays open over the list while that happens. The project
 * form mutates its items in place when a save assigns them identities, so the
 * object stays a valid handle for as long as the item exists.
 */
function replaceItem(previous: Item | undefined, next: Item) {
  const index = previous ? items.value.indexOf(previous) : -1;
  const list = [...items.value];
  if (index < 0) list.push(next);
  else list[index] = next;
  setItems(list);
}

/**
 * Removing is never saved on its own: it takes the item's content, files and
 * page with it, so it waits for the project's Save button like any other
 * decision that cannot be taken back.
 */
function removeItem(target: Item) {
  // The list holds reactive proxies, while an item the modal has just handed
  // over is the plain object behind one.
  setItems(items.value.filter((item) => toRaw(item) !== toRaw(target)));
}

/** Saves the project when this item is all that changed since its last save. */
function saveProject(item: Item) {
  saveAfterItemEdit?.(
    props.kind === 'stage' ? 'stages' : 'contentSections',
    item,
    item.isStage ? item.stageUuid : item.sectionUuid,
  );
}

/**
 * The modal keeps its own draft and does not learn what a project save gives
 * back: the identity the server assigned to a new item, and the time stamped on
 * its content. Both are carried over from the item the form already holds, so
 * handing the draft over again neither loses them nor reads as a change.
 */
function mergeSaved(previous: Item | undefined, next: Item): Item {
  if (!previous) return next;
  const merged = { ...next } as Item;
  if (merged.isStage && previous.isStage)
    merged.stageUuid ??= previous.stageUuid;
  if (!merged.isStage && !previous.isStage)
    merged.sectionUuid ??= previous.sectionUuid;
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
  handle: '[data-content-section-handle]',
  onDrop: ({ id, newIndex }) => {
    if (props.kind !== 'section') return;
    setItems(moveItemById(items.value, id, newIndex, itemId));
  },
});

/**
 * One modal at a time from this list. `openModal` loads the component before
 * the modal enters the stack, so a quick second click would otherwise stack a
 * duplicate on top of the first.
 */
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

function openItem(target?: Item) {
  return exclusively(async () => {
    let current = target;
    const modalData = {
      projectHumanReadableSlug: projectData.value.humanReadableSlug,
      projectPublicId: projectData.value.publicId,
      onSave: (item: Item) => {
        const merged = mergeSaved(current, item);
        replaceItem(current, merged);
        current = merged;
        saveProject(merged);
      },
    };
    const result =
      props.kind === 'stage'
        ? await openModal(projectContentItemModal, {
            ...modalData,
            isStage: true,
            item: target as ProjectStageContentItem | undefined,
          })
        : await openModal(projectContentItemModal, {
            ...modalData,
            isStage: false,
            item: target as ProjectSectionContentItem | undefined,
          });
    if (result.type === 'deleted' && current) removeItem(current);
  });
}

/**
 * `?stage=<publicId>` or `?section=<publicId>` opens that part straight away:
 * it is how the admin bar on a public stage or section page lands here.
 *
 * Only on the UUID address — reached by public ID, the editor first moves
 * there, and the page mounted at the old address must not open it too. The
 * query is dropped before the modal opens, so going back or reloading does
 * not open it again.
 */
onMounted(async () => {
  const wanted = route.query[props.kind];
  if (typeof wanted !== 'string') return;
  if (route.params.projectUuid !== currentProjectUuid.value) return;
  const target = items.value.find((item) => item.publicId === wanted);
  const query = { ...route.query };
  delete query[props.kind];
  await navigateTo({ query }, { replace: true });
  if (target) await openItem(target);
});

function deleteItem(target: Item) {
  return exclusively(async () => {
    const result = await openModal(projectContentItemDeleteModal, {
      kind: props.kind,
      title: target.title,
    });
    if (result.type === 'deleted') removeItem(target);
  });
}

function moveSectionWithKeyboard(target: Item, direction: -1 | 1) {
  const newIndex = items.value.indexOf(target) + direction;
  if (newIndex < 0 || newIndex >= items.value.length) return;
  setItems(moveItemById(items.value, itemId(target), newIndex, itemId));
}
</script>

<template>
  <div>
    <div class="mb-md flex items-center gap-md">
      <SectionHeader
        :icon="labels.icon"
        :title="labels.title"
        :description="labels.description"
        class="flex-1"
      />
      <button
        type="button"
        class="size-12 shrink-0 cursor-pointer rounded-normal bg-bg-3
          text-text-2 transition-colors hocus:bg-bg-accent hocus:text-accent"
        :aria-label="labels.add"
        :data-title-popup="labels.add"
        @click="openItem()"
      >
        <Icon name="plus" />
      </button>
    </div>

    <div v-if="itemViews.length" ref="root" class="flex flex-col gap-xs">
      <ProjectContentItemRow
        v-for="{ item, id, periods, analysis } in itemViews"
        :key="id"
        :data-drag-id="id"
        :title="item.title"
        :summary="item.summary"
        :periods
        :analysis
        :is-private="item.isPrivate"
        :private-label="labels.private"
        @open="dragSort.guardClick(() => openItem(item))"
      >
        <template #actions>
          <Button
            v-if="kind === 'section'"
            type="button"
            size="icon-sm"
            variant="secondary"
            drag-handle
            :aria-label="`${phrase.content_section_sort}: ${item.title}`"
            data-content-section-handle
            @keydown.up.prevent.stop="moveSectionWithKeyboard(item, -1)"
            @keydown.down.prevent.stop="moveSectionWithKeyboard(item, 1)"
          >
            <Icon name="grip" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="delete"
            :aria-label="`${labels.delete}: ${item.title}`"
            :data-title-popup="labels.delete"
            data-drag-ignore
            @click="deleteItem(item)"
          >
            <Icon name="delete" />
          </Button>
        </template>
      </ProjectContentItemRow>
    </div>
    <Box v-else>
      <div class="flex min-h-16 items-center p-sm sm:p-md">
        <p class="text-sm text-text-3 italic">{{ labels.empty }}</p>
      </div>
    </Box>
  </div>
</template>

<script lang="ts" setup>
import { analyzeContentData } from '#layers/thei/shared/content';
import {
  compareDatedSections,
  isDatedSection,
  orderProjectSections,
  type ProjectSectionItem,
} from '#layers/thei/shared/project-content-item';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import type { TabStripItem } from '#layers/thei/app/components/TabStrip.vue';
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

/**
 * A project's sections, in two tabs: the ones about a stretch of time, newest
 * first, where the owner is working, and the ones about a topic, in the order
 * they are dragged into. A section moves between the tabs as its dates come
 * and go; the strip shows only when both hold something.
 */
type Group = 'undated' | 'dated';

const projectData = inject(projectDataInjectionKey)!;
const saveAfterItemEdit = inject(saveAfterItemEditKey, undefined);
const currentProjectUuid = inject(currentProjectUuidKey)!;
const route = useRoute();
const root = useTemplateRef<HTMLElement>('root');
const unsavedIds = new WeakMap<object, string>();
const sections = computed(() => projectData.value.sections ?? []);
const undated = computed(() =>
  sections.value.filter((section) => !isDatedSection(section)),
);
const dated = computed(() =>
  sections.value.filter(isDatedSection).sort(compareDatedSections).reverse(),
);
const selected = ref<Group>(undated.value.length ? 'undated' : 'dated');
const showTabs = computed(
  () => undated.value.length > 0 && dated.value.length > 0,
);
/** The tab in view: the chosen one, or the only one that holds anything. */
const group = computed<Group>(() => {
  if (showTabs.value) return selected.value;
  return dated.value.length ? 'dated' : 'undated';
});
const tabs = computed<TabStripItem<Group>[]>(() => [
  {
    key: 'undated',
    label: phrase.value.project_sections_undated,
    icon: 'text',
    count: undated.value.length,
  },
  {
    key: 'dated',
    label: phrase.value.project_sections_dated,
    icon: 'calendar',
    count: dated.value.length,
  },
]);
const itemViews = computed(() =>
  (group.value === 'dated' ? dated.value : undated.value).map((item) => ({
    item,
    id: itemId(item),
    analysis: analyzeContentData(item.content?.data),
  })),
);

function groupOf(item: ProjectSectionItem): Group {
  return isDatedSection(item) ? 'dated' : 'undated';
}

function itemId(item: ProjectSectionItem) {
  if (item.sectionUuid) return item.sectionUuid;
  let generated = unsavedIds.get(item);
  if (!generated) {
    generated = crypto.randomUUID();
    unsavedIds.set(item, generated);
  }
  return generated;
}

function setItems(next: ProjectSectionItem[]) {
  projectData.value.sections = orderProjectSections(next);
}

/**
 * Sections are addressed by the object the project form holds, never by
 * their position: dated ones re-sort by their periods, undated ones are
 * dragged, and a modal or a confirmation stays open over the list while that
 * happens. The project form mutates its sections in place when a save assigns
 * them identities, so the object stays a valid handle for as long as the
 * section exists.
 */
function replaceItem(
  previous: ProjectSectionItem | undefined,
  next: ProjectSectionItem,
) {
  const index = previous ? sections.value.indexOf(previous) : -1;
  const list = [...sections.value];
  if (index < 0) list.push(next);
  else list[index] = next;
  setItems(list);
}

/**
 * Removing is never saved on its own: it takes the section's content, files
 * and page with it, so it waits for the project's Save button like any other
 * decision that cannot be taken back.
 */
function removeItem(target: ProjectSectionItem) {
  // The list holds reactive proxies, while a section the modal has just
  // handed over is the plain object behind one.
  setItems(sections.value.filter((item) => toRaw(item) !== toRaw(target)));
}

/** Saves the project when this section is all that changed since its last save. */
function saveProject(item: ProjectSectionItem) {
  saveAfterItemEdit?.(item, item.sectionUuid);
}

/**
 * The modal keeps its own draft and does not learn what a project save gives
 * back: the identity the server assigned to a new section, and the time
 * stamped on its content. Both are carried over from the section the form
 * already holds, so handing the draft over again neither loses them nor reads
 * as a change.
 */
function mergeSaved(
  previous: ProjectSectionItem | undefined,
  next: ProjectSectionItem,
): ProjectSectionItem {
  if (!previous) return next;
  const merged = { ...next };
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

const dragSort = useDragSort(
  () => (group.value === 'undated' ? root.value : null),
  {
    handle: '[data-content-section-handle]',
    onDrop: ({ id, newIndex }) => moveUndated(id, newIndex),
  },
);

/** Moves an undated section within its tab; the dated ones keep their time order. */
function moveUndated(id: string, newIndex: number) {
  setItems([
    ...moveItemById(undated.value, id, newIndex, itemId),
    ...dated.value,
  ]);
}

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

function openItem(target?: ProjectSectionItem) {
  return exclusively(async () => {
    let current = target;
    const result = await openModal(projectContentItemModal, {
      projectHumanReadableSlug: projectData.value.humanReadableSlug,
      projectPublicId: projectData.value.publicId,
      item: target,
      onSave: (item: ProjectSectionItem) => {
        const merged = mergeSaved(current, item);
        replaceItem(current, merged);
        current = merged;
        // A section that gained or lost its dates is now in the other tab;
        // the list follows it there.
        selected.value = groupOf(merged);
        saveProject(merged);
      },
    });
    if (result.type === 'deleted' && current) removeItem(current);
  });
}

/**
 * `?section=<publicId>` opens that section straight away, in its tab: it is
 * how the admin bar on a public section page lands here.
 *
 * Only on the UUID address — reached by public ID, the editor first moves
 * there, and the page mounted at the old address must not open it too. The
 * query is dropped before the modal opens, so going back or reloading does
 * not open it again.
 */
onMounted(async () => {
  const wanted = route.query.section;
  if (typeof wanted !== 'string') return;
  if (route.params.projectUuid !== currentProjectUuid.value) return;
  const target = sections.value.find((item) => item.publicId === wanted);
  const query = { ...route.query };
  delete query.section;
  // The path goes along: without it the router rebuilds the address from the
  // route's pattern, which has no trailing slash, and the admin bar no longer
  // recognizes the editor.
  await navigateTo({ path: route.path, query }, { replace: true });
  if (!target) return;
  selected.value = groupOf(target);
  await openItem(target);
});

function deleteItem(target: ProjectSectionItem) {
  return exclusively(async () => {
    const result = await openModal(projectContentItemDeleteModal, {
      title: target.title,
    });
    if (result.type === 'deleted') removeItem(target);
  });
}

function moveWithKeyboard(target: ProjectSectionItem, direction: -1 | 1) {
  const newIndex = undated.value.indexOf(target) + direction;
  if (newIndex < 0 || newIndex >= undated.value.length) return;
  moveUndated(itemId(target), newIndex);
}
</script>

<template>
  <div>
    <SectionHeader
      :icon="entityTypeIcon('project-section')"
      :title="phrase.project_content_sections"
      :description="phrase.project_content_sections_hint"
      class="mb-md"
    >
      <template #action>
        <SectionAddButton
          :label="phrase.content_section_add"
          @click="openItem()"
        />
      </template>
    </SectionHeader>

    <TabStrip
      v-if="showTabs"
      v-model="selected"
      :tabs="tabs"
      :label="phrase.project_content_sections"
      controls="project-sections-list"
      class="mb-sm"
    />
    <div
      v-if="itemViews.length"
      id="project-sections-list"
      ref="root"
      :role="showTabs ? 'tabpanel' : undefined"
      :data-section-group="group"
      class="flex flex-col gap-xs"
    >
      <ProjectContentItemRow
        v-for="{ item, id, analysis } in itemViews"
        :key="id"
        :data-drag-id="id"
        :title="item.title"
        :summary="item.summary"
        :periods="item.periods"
        :analysis
        :is-private="item.isPrivate"
        :private-label="phrase.content_section_private"
        @open="dragSort.guardClick(() => openItem(item))"
      >
        <template #actions>
          <Button
            v-if="group === 'undated'"
            type="button"
            size="icon-sm"
            variant="secondary"
            drag-handle
            :aria-label="`${phrase.content_section_sort}: ${publicText(item.title)}`"
            data-content-section-handle
            @keydown.up.prevent.stop="moveWithKeyboard(item, -1)"
            @keydown.down.prevent.stop="moveWithKeyboard(item, 1)"
          >
            <Icon name="grip" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="delete"
            :aria-label="`${phrase.delete_content_section}: ${publicText(item.title)}`"
            :data-title-popup="phrase.delete_content_section"
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
        <p class="text-sm text-text-3 italic">
          {{ phrase.project_content_sections_empty }}
        </p>
      </div>
    </Box>
  </div>
</template>

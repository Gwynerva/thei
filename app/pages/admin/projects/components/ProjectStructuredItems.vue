<script lang="ts" setup>
import { analyzeContentData } from '#layers/thei/shared/content';
import type { ProjectContentSectionEditItem } from '#layers/thei/shared/project-content-section';
import {
  compareProjectStages,
  type ProjectStageEditItem,
} from '#layers/thei/shared/project-stage';
import {
  moveItemById,
  useDragSort,
} from '#layers/thei/app/composables/drag-sort';
import { projectDataInjectionKey } from '../composables';
import { projectContentItemModal } from './project-content-section-modal';
import { projectStructuredItemDeleteModal } from './project-structured-item-delete-modal';

type Item = ProjectContentSectionEditItem | ProjectStageEditItem;

const props = defineProps<{ kind: 'stage' | 'section' }>();
const projectData = inject(projectDataInjectionKey)!;
const humanSize = useHumanSize();
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
    analysis: analyzeContentData(item.content?.data),
  })),
);
const title = computed(() =>
  props.kind === 'stage'
    ? phrase.value.project_stages
    : phrase.value.project_content_sections,
);
const description = computed(() =>
  props.kind === 'stage'
    ? phrase.value.project_stages_hint
    : phrase.value.project_content_sections_hint,
);
const addLabel = computed(() =>
  props.kind === 'stage'
    ? phrase.value.project_stage_add
    : phrase.value.content_section_add,
);
const emptyText = computed(() =>
  props.kind === 'stage'
    ? phrase.value.project_stages_empty
    : phrase.value.project_content_sections_empty,
);

function itemId(item: Item) {
  const id = 'period' in item ? item.stageUuid : item.sectionUuid;
  if (id) return id;
  let generated = unsavedIds.get(item);
  if (!generated) {
    generated = crypto.randomUUID();
    unsavedIds.set(item, generated);
  }
  return generated;
}

function replaceStages(next: ProjectStageEditItem[]) {
  projectData.value.stages = [...next].sort(compareProjectStages);
}

function replaceSections(next: ProjectContentSectionEditItem[]) {
  projectData.value.contentSections = next;
}

const dragSort = useDragSort(root, {
  handle: '[data-content-section-handle]',
  onDrop: ({ id, newIndex }) => {
    if (props.kind !== 'section') return;
    replaceSections(
      moveItemById(
        projectData.value.contentSections ?? [],
        id,
        newIndex,
        itemId,
      ),
    );
  },
});

async function openItem(index?: number) {
  if (props.kind === 'stage') {
    const stages = projectData.value.stages ?? [];
    const result = await openModal(
      projectContentItemModal,
      { kind: 'stage', item: index === undefined ? undefined : stages[index] },
      { label: stages[index ?? -1]?.title ?? addLabel.value },
    );
    if (result.type !== 'save' || result.kind !== 'stage') return;
    const next = [...stages];
    if (index === undefined) next.push(result.item);
    else next[index] = result.item;
    replaceStages(next);
    return;
  }

  const sections = projectData.value.contentSections ?? [];
  const result = await openModal(
    projectContentItemModal,
    {
      kind: 'section',
      item: index === undefined ? undefined : sections[index],
    },
    { label: sections[index ?? -1]?.title ?? addLabel.value },
  );
  if (result.type !== 'save' || result.kind !== 'section') return;
  const next = [...sections];
  if (index === undefined) next.push(result.item);
  else next[index] = result.item;
  replaceSections(next);
}

async function deleteItem(index: number) {
  const item = items.value[index];
  if (!item) return;
  const result = await openModal(
    projectStructuredItemDeleteModal,
    { kind: props.kind, title: item.title },
    {
      label:
        props.kind === 'stage'
          ? phrase.value.delete_project_stage
          : phrase.value.delete_content_section,
    },
  );
  if (result.type !== 'deleted') return;
  if (props.kind === 'stage') {
    replaceStages(
      (projectData.value.stages ?? []).filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    );
    return;
  }
  replaceSections(
    (projectData.value.contentSections ?? []).filter(
      (_, itemIndex) => itemIndex !== index,
    ),
  );
}

function moveSectionWithKeyboard(index: number, direction: -1 | 1) {
  const sections = projectData.value.contentSections ?? [];
  const item = sections[index];
  const newIndex = index + direction;
  if (!item || newIndex < 0 || newIndex >= sections.length) return;
  replaceSections(moveItemById(sections, itemId(item), newIndex, itemId));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(language.value.code, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(value.includes('T')
      ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const }
      : {}),
  }).format(new Date(value.includes('T') ? value : `${value}T00:00`));
}
</script>

<template>
  <div>
    <div class="mb-md flex items-center gap-md">
      <SectionHeader
        :icon="kind === 'stage' ? 'calendar' : 'file-tray-stack'"
        :title="title"
        :description="description"
        class="flex-1"
      />
      <button
        type="button"
        class="size-12 shrink-0 cursor-pointer rounded-normal bg-bg-3
          text-text-2 transition-colors hocus:bg-bg-accent hocus:text-accent"
        :aria-label="addLabel"
        :data-title-popup="addLabel"
        @click="openItem()"
      >
        <Icon name="plus" />
      </button>
    </div>

    <div v-if="itemViews.length" ref="root" class="flex flex-col gap-xs">
      <Box
        v-for="({ item, id, analysis }, index) in itemViews"
        :key="id"
        :data-drag-id="id"
        class="group flex items-stretch overflow-hidden p-0 transition
          hocus:border-border-3"
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 cursor-pointer flex-col gap-2
            mask-r-from-50% px-sm py-xs text-left transition sm:px-md
            hocus:bg-bg-3"
          @click="dragSort.guardClick(() => openItem(index))"
        >
          <span class="min-w-0 leading-snug font-semibold">
            <span class="wrap-break-word">{{ item.title }}</span>
          </span>
          <span class="min-h-5 truncate text-sm text-text-2">
            {{ item.summary }}
          </span>
          <span class="flex flex-wrap items-center gap-xs text-sm text-text-3">
            <span
              v-if="kind === 'stage' && 'period' in item"
              :data-title-popup="phrase.project_stage_period"
            >
              {{ formatDate(item.period.startDate) }} —
              {{ formatDate(item.period.endDate) }}
            </span>
            <span
              class="inline-flex cursor-help items-center gap-1
                whitespace-nowrap transition-colors hocus:text-text-1"
              :data-title-popup="
                phrase.content_block_count(analysis.summary.blockCount)
              "
            >
              <Icon name="blocks" />
              {{ analysis.summary.blockCount }}
            </span>
            <span
              class="inline-flex cursor-help items-center gap-1
                whitespace-nowrap transition-colors hocus:text-text-1"
              :data-title-popup="
                phrase.content_file_count(analysis.summary.assetCount)
              "
            >
              <Icon name="file" />
              {{ analysis.summary.assetCount }} /
              {{ humanSize(analysis.summary.assetTotalSize) }}
            </span>
            <span
              v-if="item.isPrivate"
              class="inline-flex cursor-help items-center gap-1
                whitespace-nowrap transition-colors hocus:text-text-1"
              :data-title-popup="
                kind === 'stage'
                  ? phrase.project_stage_private
                  : phrase.content_section_private
              "
            >
              <Icon name="lock-close" />
            </span>
          </span>
        </button>
        <div
          class="flex shrink-0 items-center gap-xs py-xs pr-xs text-xs
            sm:text-sm"
        >
          <button
            v-if="kind === 'section'"
            type="button"
            class="flex shrink-0 cursor-grab items-center justify-center
              rounded-normal bg-bg-3 p-2 text-text-2 transition-colors
              active:cursor-grabbing hocus:bg-bg-accent hocus:text-accent"
            :aria-label="`${phrase.content_section_sort}: ${item.title}`"
            data-content-section-handle
            @keydown.up.prevent.stop="moveSectionWithKeyboard(index, -1)"
            @keydown.down.prevent.stop="moveSectionWithKeyboard(index, 1)"
          >
            <Icon name="grip" />
          </button>
          <button
            type="button"
            class="flex shrink-0 cursor-pointer items-center justify-center
              rounded-normal bg-bg-3 p-2 text-text-2 transition-colors
              hocus:bg-bg-error hocus:text-text-error"
            :aria-label="`${kind === 'stage' ? phrase.delete_project_stage : phrase.delete_content_section}: ${item.title}`"
            :data-title-popup="
              kind === 'stage'
                ? phrase.delete_project_stage
                : phrase.delete_content_section
            "
            data-drag-ignore
            @click="deleteItem(index)"
          >
            <Icon name="delete" />
          </button>
        </div>
      </Box>
    </div>
    <Box v-else>
      <div class="flex min-h-16 items-center p-sm sm:p-md">
        <p class="text-sm text-text-3 italic">{{ emptyText }}</p>
      </div>
    </Box>
  </div>
</template>

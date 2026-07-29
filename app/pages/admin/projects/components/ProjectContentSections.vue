<script lang="ts" setup>
import {
  collectContentAssetSizeMap,
  normalizeContentData,
  summarizeContentData,
} from '#layers/thei/shared/content';
import type { ProjectContentSectionEditItem } from '#layers/thei/shared/project-content-section';
import { projectDataInjectionKey } from '../composables';
import { useDragSort } from '#layers/thei/app/composables/drag-sort';
import { projectContentSectionModal } from './project-content-section-modal';

const projectData = inject(projectDataInjectionKey)!;
const humanSize = useHumanSize();
const sections = computed(() => projectData.value.contentSections ?? []);
function replaceSections(value: ProjectContentSectionEditItem[]) {
  projectData.value.contentSections = value;
}

const dragSort = useDragSort((from, to) => {
  const next = [...sections.value];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  replaceSections(next);
});

async function openSection(index?: number) {
  const result = await openModal(
    projectContentSectionModal,
    {
      section: index === undefined ? undefined : sections.value[index],
    },
    {
      label: sections.value[index ?? -1]?.title ?? phrase.value.content_section,
    },
  );
  if (result.type === 'empty' || result.type === 'error') return;
  if (result.type === 'delete') {
    if (index !== undefined) removeSection(index, false);
    return;
  }
  if (index === undefined) replaceSections([...sections.value, result.section]);
  else {
    const next = [...sections.value];
    next[index] = result.section;
    replaceSections(next);
  }
}

function removeSection(index: number, requireConfirmation = true) {
  if (
    requireConfirmation &&
    !window.confirm(`${phrase.value.delete_content_section}?`)
  )
    return;
  replaceSections(sections.value.filter((_, itemIndex) => itemIndex !== index));
}

function summary(section: ProjectContentSectionEditItem) {
  const content = normalizeContentData(section.content?.data);
  return summarizeContentData(content, collectContentAssetSizeMap(content));
}

function periodBounds(section: ProjectContentSectionEditItem) {
  if (!section.periods.length) return undefined;
  const first = section.periods[0]!;
  const last = section.periods.at(-1)!;
  return `${formatDate(first.startDate)} — ${formatDate(last.endDate)}`;
}

function formatDate(value: string) {
  const hasTime = value.includes('T');
  return new Intl.DateTimeFormat(language.value.code, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(hasTime
      ? {
          hour: '2-digit' as const,
          minute: '2-digit' as const,
          hourCycle: 'h23' as const,
        }
      : {}),
  }).format(new Date(hasTime ? value : `${value}T00:00`));
}
</script>

<template>
  <div>
    <SectionHeader
      icon="file-tray-stack"
      :title="phrase.project_content_sections"
      :description="phrase.project_content_sections_hint"
      class="mb-md"
    />
    <Box class="flex flex-col gap-md p-sm sm:p-md">
      <div class="flex items-center justify-between gap-sm">
        <div class="font-semibold">{{ phrase.project_content_sections }}</div>
        <Button @click="openSection()"
          ><Icon name="plus" class="mr-xs" />{{
            phrase.content_section_add
          }}</Button
        >
      </div>

      <div
        v-if="sections.length"
        class="overflow-hidden rounded-normal border border-border-1"
      >
        <div
          v-for="(section, index) in sections"
          :key="section.sectionUuid ?? `${section.title}-${index}`"
          :data-drag-index="index"
          class="group flex touch-none items-center gap-sm border-b
            border-border-1 bg-bg-1 p-sm transition last:border-b-0
            hocus:bg-bg-3"
          :class="{
            'opacity-50': dragSort.draggingIndex.value === index,
            'ring-2 ring-accent':
              dragSort.dragOverIndex.value === index &&
              dragSort.draggingIndex.value !== index,
          }"
          @pointerdown="dragSort.onPointerDown(index, $event)"
          @click="dragSort.guardClick(() => openSection(index))"
        >
          <Icon name="expand-vertical" class="shrink-0 text-text-3" />
          <div class="min-w-0 flex-1">
            <div class="truncate font-semibold">{{ section.title }}</div>
            <div v-if="section.summary" class="truncate text-sm text-text-2">
              {{ section.summary }}
            </div>
            <div
              class="mt-1 flex flex-wrap items-center gap-xs text-sm
                text-text-3"
            >
              <span
                v-if="section.isPrivate"
                :data-title-popup="phrase.content_section_private"
                ><Icon name="lock-close"
              /></span>
              <span :data-title-popup="phrase.content_section_periods"
                ><Icon name="event" class="mr-0.5" />{{
                  section.periods.length
                }}</span
              >
              <span v-if="periodBounds(section)">{{
                periodBounds(section)
              }}</span>
              <span :data-title-popup="phrase.content_section_content"
                ><Icon name="file" class="mr-0.5" />{{
                  summary(section).blockCount
                }}</span
              >
              <span v-if="summary(section).assetCount"
                >{{ summary(section).assetCount }} /
                {{ humanSize(summary(section).assetTotalSize) }}</span
              >
            </div>
          </div>
          <button
            type="button"
            class="flex size-10 shrink-0 cursor-pointer items-center
              justify-center rounded-normal text-text-3 transition
              hocus:bg-bg-error hocus:text-text-error"
            :data-title-popup="phrase.delete_content_section"
            @click.stop="removeSection(index)"
          >
            <Icon name="delete" />
          </button>
        </div>
      </div>
      <div
        v-else
        class="rounded-normal border border-dashed border-border-2 px-sm py-md
          text-center text-sm text-text-3"
      >
        {{ phrase.content_empty }}
      </div>
    </Box>
  </div>
</template>

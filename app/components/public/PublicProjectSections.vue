<script lang="ts" setup>
import type { PublicProjectSection } from '#layers/thei/shared/api/public';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import { PROJECT_SECTIONS_ANCHOR } from '#layers/thei/shared/project-url';

/**
 * A project's sections on its page, under tabs heading the block, as its
 * relations are: the general ones, in the owner's order, and the stages,
 * newest first, each with the stretch it covers. They are one kind of thing
 * read two ways, so a tab is there only for a way that holds something; a
 * project with sections of one kind shows its one tab, which says what they
 * are.
 */

const props = defineProps<{ sections: PublicProjectSection[] }>();

const undated = computed(() =>
  props.sections.filter((section) => !section.period),
);
const dated = computed(() =>
  props.sections.filter((section) => section.period),
);
const tabs = computed(() =>
  sectionGroupTabs({
    undated: undated.value.length,
    dated: dated.value.length,
  }).filter((tab) => tab.count),
);
const selected = ref<SectionGroup>(undated.value.length ? 'undated' : 'dated');
const shown = computed(() =>
  selected.value === 'dated' ? dated.value : undated.value,
);
</script>

<template>
  <section
    v-if="sections.length"
    :id="PROJECT_SECTIONS_ANCHOR"
    aria-labelledby="sections-heading"
    class="flex scroll-mt-[var(--public-anchor-offset,8rem)] flex-col gap-sm"
  >
    <PublicSectionHeader
      heading-id="sections-heading"
      :title="phrase.project_content_sections"
      :icon="entityTypeIcon('project-section')"
    />
    <UnderlineTabs
      v-model="selected"
      :tabs="tabs"
      :label="phrase.project_content_sections"
      controls="project-sections-panel"
    />
    <div
      id="project-sections-panel"
      role="tabpanel"
      :aria-labelledby="`project-sections-panel-${selected}-tab`"
      class="grid min-w-0 gap-sm sm:grid-cols-2"
    >
      <PublicSectionCard
        v-for="section in shown"
        :key="section.href"
        :section
      />
    </div>
  </section>
</template>

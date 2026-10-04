<script lang="ts" setup>
import type { PublicProjectSection } from '#layers/thei/shared/api/public';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import type { TabStripItem } from '../TabStrip.vue';

/**
 * A project's sections on its page, in two tabs: the ones about a topic, in
 * the owner's order, and the dated ones, newest first, each with the stretch
 * it covers. They are one kind of thing, so the strip shows only when there
 * are both; a project with sections of one kind lists them plainly.
 */
type Group = 'undated' | 'dated';

const props = defineProps<{ sections: PublicProjectSection[] }>();

const undated = computed(() =>
  props.sections.filter((section) => !section.period),
);
const dated = computed(() =>
  props.sections.filter((section) => section.period),
);
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
const showTabs = computed(
  () => undated.value.length > 0 && dated.value.length > 0,
);
const selected = ref<Group>(undated.value.length ? 'undated' : 'dated');
const shown = computed(() => {
  if (showTabs.value)
    return selected.value === 'dated' ? dated.value : undated.value;
  return dated.value.length ? dated.value : undated.value;
});
</script>

<template>
  <section
    v-if="sections.length"
    id="project-sections"
    aria-labelledby="sections-heading"
    class="flex scroll-mt-[var(--public-anchor-offset,8rem)] flex-col gap-sm"
  >
    <PublicSectionHeader
      heading-id="sections-heading"
      :title="phrase.project_content_sections"
      :icon="entityTypeIcon('project-section')"
    />
    <TabStrip
      v-if="showTabs"
      v-model="selected"
      :tabs="tabs"
      :label="phrase.project_content_sections"
      controls="project-sections-panel"
    />
    <div
      id="project-sections-panel"
      :role="showTabs ? 'tabpanel' : undefined"
      class="grid gap-md"
    >
      <PublicProjectChildCard
        v-for="section in shown"
        :key="section.href"
        :item="section"
      />
    </div>
  </section>
</template>

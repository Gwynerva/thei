<script lang="ts" setup>
import { contentExternalLinkIdentities } from '#layers/thei/shared/public-content-reference';
import { projectDataInjectionKey } from '../composables';

/**
 * The hand-made links of a project, or of an event, which keeps its body
 * where a project keeps its description. A link the text already makes is
 * marked: the page would list it twice.
 */
const projectData = inject(projectDataInjectionKey)!;
const props = defineProps<{
  title?: string;
  description?: string;
  emptyText?: string;
  /** What to say of a link the text already makes. */
  contentHint?: string;
}>();
const links = computed({
  get: () => projectData.value.externalLinks ?? [],
  set: (value) => {
    projectData.value.externalLinks = value;
  },
});
const contentLinks = computed(() => ({
  identities: contentExternalLinkIdentities(
    projectData.value.descriptionContent?.data,
  ),
  hint: props.contentHint ?? phrase.value.external_link_in_project_description,
}));
</script>

<template>
  <ExternalLinksEditor
    v-model="links"
    :title="props.title ?? phrase.project_external_links"
    :description="props.description ?? phrase.project_external_links_hint"
    :empty-text="props.emptyText ?? phrase.project_external_links_empty"
    :content-links="contentLinks"
  />
</template>

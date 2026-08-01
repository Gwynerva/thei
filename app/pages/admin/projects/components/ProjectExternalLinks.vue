<script lang="ts" setup>
import { projectDataInjectionKey } from '../composables';

const projectData = inject(projectDataInjectionKey)!;
const links = computed({
  get: () => projectData.value.externalLinks ?? [],
  set: (value) => {
    projectData.value.externalLinks = value;
  },
});
</script>

<template>
  <ExternalLinksEditor
    v-model="links"
    :title="phrase.project_external_links"
    :description="phrase.project_external_links_hint"
    :empty-text="phrase.project_external_links_empty"
  />
</template>

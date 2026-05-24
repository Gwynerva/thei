<script lang="ts" setup>
import { debounce } from 'perfect-debounce';
import type { ProjectSlugCheckResponse } from '#layers/thei/shared/api/project';
import {
  ProjectEventAccessLevel,
  SiteAccessLevel,
} from '#layers/thei/shared/access-level';
import {
  projectDataInjectionKey,
  projectValidationKey,
  currentProjectUuidKey,
} from '../composables';

const projectData = inject(projectDataInjectionKey)!;
const projectValidation = inject(projectValidationKey)!;
const currentProjectUuid = inject(currentProjectUuidKey);

const publicAdmin = await usePublicAdmin();

const accessHint = computed(() => {
  switch (projectData.value.access) {
    case ProjectEventAccessLevel.Public:
      return phrase.value.public_hint;
    case ProjectEventAccessLevel.LinkOnly:
      return phrase.value.link_only_hint;
    case ProjectEventAccessLevel.Private:
      return phrase.value.private_hint;
  }
});

const { randomArrayElement } = useRandom();
const sampleProject = randomArrayElement(language.value.sampleProjects);

type SlugError = { message: string; hard: true } | false;

const slugError = ref<SlugError>(false);

let slugCheckId = 0;

const checkSlugUniqueness = debounce(async (slug: string) => {
  const id = ++slugCheckId;
  try {
    const { taken } = await $fetch<ProjectSlugCheckResponse>(
      '/api/admin/projects/slug-check/',
      { query: { slug, excludeProjectUuid: currentProjectUuid?.value } },
    );
    if (id !== slugCheckId) return;
    slugError.value = taken
      ? { message: phrase.value.duplicate_slug, hard: true }
      : false;
    projectValidation.value.isSlugUnique = !taken;
  } catch {}
}, 500);

watch(
  () => projectData.value.slug,
  (slug) => {
    if (!slug.trim()) {
      slugError.value = false;
      projectValidation.value.isSlugUnique = true;
      return;
    }

    checkSlugUniqueness(slug);
  },
);
</script>

<template>
  <Box class="flex flex-col gap-md p-sm sm:p-md">
    <Field>
      <FieldLabel required>{{ phrase.project_title }}</FieldLabel>
      <FieldInput
        v-model="projectData.title"
        type="text"
        autocomplete="off"
        spellcheck="false"
        required
        :placeholder="sampleProject.title"
      />
      <FieldHint>{{ phrase.project_title_hint }}</FieldHint>
    </Field>

    <Field>
      <FieldLabel required>{{ phrase.project_summary }}</FieldLabel>
      <FieldTextarea
        v-model="projectData.summary"
        autocomplete="off"
        spellcheck="false"
        required
        :placeholder="sampleProject.summary"
      />
      <FieldHint>{{ phrase.project_summary_hint }}</FieldHint>
    </Field>

    <div class="flex flex-wrap gap-md">
      <Field class="flex-1">
        <FieldLabel required>{{ phrase.project_slug }}</FieldLabel>
        <div class="flex items-start">
          <FieldInput
            v-model="projectData.slug"
            autocomplete="off"
            spellcheck="false"
            type="text"
            wrapper-class="flex-1 min-w-50"
            class="rounded-r-none"
            :placeholder="sampleProject.slug"
            :error="slugError"
            required
          />
          <Button
            variant="secondary"
            class="h-12 rounded-l-none"
            :data-title-popup="phrase.generate_random"
            @mousedown.prevent
            @click="projectData.slug = randomId(14)"
          >
            <Icon name="dice" class="scale-125" />
          </Button>
        </div>
        <FieldHint>{{ phrase.project_slug_hint }}</FieldHint>
      </Field>
      <Field>
        <FieldLabel required>{{ phrase.project_access }}</FieldLabel>
        <FieldOptions
          v-model="projectData.access"
          direction="row"
          :options="{
            [ProjectEventAccessLevel.Public]: {
              icon: 'lock-open',
              title: phrase.public,
            },
            [ProjectEventAccessLevel.LinkOnly]: {
              icon: 'lock-partial',
              title: phrase.link_only,
            },
            [ProjectEventAccessLevel.Private]: {
              icon: 'lock-close',
              title: phrase.private,
            },
          }"
        />
        <FieldHint v-if="accessHint">{{ accessHint }}</FieldHint>
        <FieldHint
          v-if="publicAdmin.siteAccessLevel === SiteAccessLevel.Private"
          class="font-semibold text-text-warning"
        >
          <Icon name="warning" class="mr-xs" />
          {{ phrase.site_access_close_priority }}
        </FieldHint>
      </Field>
    </div>

    <div class="flex flex-wrap gap-md">
      <Field class="flex-1">
        <FieldToggle v-model="projectData.important">{{
          phrase.important_project
        }}</FieldToggle>
        <FieldHint>{{ phrase.important_project_hint }}</FieldHint>
      </Field>
      <Field class="flex-1">
        <FieldToggle v-model="projectData.cv">{{
          phrase.cv_project
        }}</FieldToggle>
        <FieldHint>{{ phrase.cv_project_hint }}</FieldHint>
      </Field>
    </div>
  </Box>
</template>

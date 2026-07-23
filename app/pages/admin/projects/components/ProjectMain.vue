<script lang="ts" setup>
import {
  ProjectEventAccessLevel,
  SiteAccessLevel,
} from '#layers/thei/shared/access-level';
import { projectDataInjectionKey, publicIdErrorKey } from '../composables';
import FieldContent from '#layers/thei/app/components/content/FieldContent.vue';
import LinkField from '../../components/LinkField.vue';

const projectData = inject(projectDataInjectionKey)!;
const publicIdError = inject(publicIdErrorKey)!;

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
</script>

<template>
  <Box class="flex flex-col gap-md p-sm sm:p-md">
    <div class="flex flex-wrap gap-md">
      <Field class="min-w-50 flex-1">
        <FieldLabel required>{{ phrase.project_title }}</FieldLabel>
        <FieldInput
          v-model="projectData.title"
          type="text"
          autocomplete="off"
          spellcheck="false"
          required
        />
        <FieldHint>{{ phrase.project_title_hint }}</FieldHint>
      </Field>

      <Field class="min-w-50">
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

    <Field>
      <FieldLabel required>{{ phrase.project_summary }}</FieldLabel>
      <FieldTextarea
        v-model="projectData.summary"
        autocomplete="off"
        spellcheck="false"
        required
      />
      <FieldHint>{{ phrase.project_summary_hint }}</FieldHint>
    </Field>

    <LinkField
      v-model:title="projectData.title"
      v-model:human-readable-slug="projectData.humanReadableSlug"
      v-model:public-id="projectData.publicId"
      :link-description="phrase.project_link_example"
      :public-id-error="publicIdError"
    />

    <div class="flex flex-wrap gap-md">
      <Field class="flex-1">
        <FieldToggle v-model="projectData.important">
          {{ phrase.important_project }}
        </FieldToggle>
        <FieldHint>{{ phrase.important_project_hint }}</FieldHint>
      </Field>
      <Field class="flex-1">
        <FieldToggle v-model="projectData.cv">
          {{ phrase.cv_project }}
        </FieldToggle>
        <FieldHint>{{ phrase.cv_project_hint }}</FieldHint>
      </Field>
    </div>

    <FieldContent
      v-model="projectData.descriptionContent"
      :label="phrase.project_description"
      :hint="phrase.project_description_hint"
    />
  </Box>
</template>

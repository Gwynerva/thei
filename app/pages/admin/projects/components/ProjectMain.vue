<script lang="ts" setup>
import { projectDataInjectionKey } from '../composables';
import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';

const projectData = inject(projectDataInjectionKey)!;

const { randomArrayElement } = useRandom();
const sampleProject = randomArrayElement(language.value.sampleProjects);

// Preview URL is built from the upload result — not stored in projectData
const iconPreviewUrl = ref<string>();

function removeIcon() {
  projectData.value.iconAssetUuid = undefined;
  iconPreviewUrl.value = undefined;
}
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
      <Field>
        <FieldLabel required>Доступ к проекту</FieldLabel>
        <FieldOptions
          direction="row"
          :options="{
            public: { title: 'Публичный' },
            link: { title: 'По ссылке' },
            private: { title: 'Приватный' },
          }"
        />
      </Field>
      <Field class="flex-1">
        <FieldLabel required>Ссылка на проект</FieldLabel>
        <div class="flex items-center gap-xs">
          <FieldInput
            type="text"
            class="flex-1"
            :placeholder="sampleProject.slug"
          />
          <Button variant="secondary">
            <Icon name="dice" />
          </Button>
        </div>
        <FieldHint>Входит в состав ссылки на проект.</FieldHint>
      </Field>
    </div>

    <div class="flex flex-wrap gap-md">
      <Field>
        <FieldLabel>Иконка проекта</FieldLabel>
        <div class="relative inline-block">
          <AssetUpload
            profile-id="icon"
            v-model="projectData.iconAssetUuid"
            @uploaded="
              (e: AssetUploadResponse) =>
                (iconPreviewUrl = `/api/admin/assets/preview/${e.link}.${e.extension}`)
            "
          >
            <div
              class="flex size-12 items-center justify-center overflow-hidden
                rounded-normal border-2 border-border-1 bg-bg-1 transition
                hover:border-border-3 hover:bg-bg-3"
            >
              <img
                v-if="iconPreviewUrl"
                :src="iconPreviewUrl"
                class="h-full w-full object-cover"
                alt="Project icon"
              />
              <Icon v-else name="plus" class="text-xl text-text-2" />
            </div>
          </AssetUpload>
          <button
            v-if="iconPreviewUrl"
            class="absolute -top-1.5 -right-1.5 rounded-full bg-bg-1 p-0.5
              text-text-2 shadow-shadow-1 transition hover:bg-bg-error
              hover:text-text-error"
            @click="removeIcon"
          >
            <Icon name="delete" class="text-xs" />
          </button>
        </div>
        <FieldHint>Яркая и запоминающаяся.</FieldHint>
      </Field>
      <Field class="flex-1">
        <FieldToggle>Важный проект?</FieldToggle>
        <FieldHint>
          Проект запомнился надолго и/или сильно повлиял на вашу жизнь.
        </FieldHint>
      </Field>
      <Field class="flex-1">
        <FieldToggle>Часть резюме?</FieldToggle>
        <FieldHint>
          Потенциальному работодателю будет интересно увидеть этот проект.
        </FieldHint>
      </Field>
    </div>
  </Box>
</template>

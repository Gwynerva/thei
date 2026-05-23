<script lang="ts" setup>
import { projectDataInjectionKey } from '../composables';

const projectData = inject(projectDataInjectionKey)!;

const { randomArrayElement } = useRandom();
const sampleProject = computed(() =>
  randomArrayElement(language.value.sampleProjects),
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
    <div class="flex flex-wrap gap-md">
      <Field class="flex-1">
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
        <FieldLabel required>Часть URL проекта</FieldLabel>
        <div class="flex items-center gap-xs">
          <FieldInput type="text" class="flex-1" />
          <Button variant="secondary">
            <Icon name="dice" />
          </Button>
        </div>
      </Field>
    </div>
  </Box>
</template>

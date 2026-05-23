<script lang="ts" setup>
import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import {
  type LanguageCode,
  languagesInfo,
  loadLanguage,
} from '#layers/thei/shared/language';

const languageCode = ref<LanguageCode>(language.value.code);
watch(languageCode, async (newCode) => {
  _language.value = await loadLanguage(newCode);
});

const accessModel = defineModel<SiteAccessLevel>('access');
</script>

<template>
  <div>
    <SectionHeader
      icon="globe"
      :title="phrase.global_settings"
      :description="phrase.global_settings_description"
      class="mb-md"
    />
    <Box>
      <div class="flex flex-col gap-md p-sm sm:p-md">
        <Field>
          <FieldLabel>{{ phrase.ui_language }}</FieldLabel>
          <FieldSelect
            :options="
              Object.fromEntries(
                Object.entries(languagesInfo).map(([code, label]) => [
                  code,
                  `${code.toUpperCase()} - ${label}`,
                ]),
              )
            "
            v-model="languageCode"
          />
          <FieldHint>{{ phrase.ui_language_hint }}</FieldHint>
        </Field>

        <Field>
          <FieldLabel required>{{ phrase.site_access }}</FieldLabel>
          <FieldOptions
            direction="column"
            :options="{
              [SiteAccessLevel.Public]: {
                icon: 'lock-open',
                title: phrase.site_access_open,
                description: phrase.site_access_open_description,
              },
              [SiteAccessLevel.Private]: {
                icon: 'lock-close',
                title: phrase.site_access_closed,
                description: phrase.site_access_closed_description,
              },
            }"
            v-model="accessModel"
          />
        </Field>
      </div>
    </Box>
  </div>
</template>

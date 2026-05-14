<script lang="ts" setup>
import { type LanguageCode, languagesInfo } from '#layers/thei/shared/language';
import { useInstallLanguage, useInstallPhrases } from '../install-language';

const {
  global_settings_title,
  global_settings_description,
  ui_language,
  ui_language_hint,
  site_access,
  site_access_open,
  site_access_closed,
  site_access_open_description,
  site_access_closed_description,
} = useInstallPhrases();

const { language, loadLanguage } = useInstallLanguage();
const languageSelectElement = shallowRef<HTMLSelectElement>();
const languageCode = ref<LanguageCode>(language.value.code);
watch(languageCode, async (newCode) => {
  await loadLanguage(newCode);
});

const siteAccess = ref<'open' | 'admin'>('open');
</script>

<template>
  <Box
    icon="globe"
    :title="global_settings_title"
    :description="global_settings_description"
  >
    <div class="flex flex-col gap-md">
      <Field>
        <FieldLabel :focus="languageSelectElement">{{
          ui_language
        }}</FieldLabel>
        <FieldSelect
          v-on:element="languageSelectElement = $event"
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
        <FieldHint>{{ ui_language_hint }}</FieldHint>
      </Field>

      <Field>
        <FieldLabel>{{ site_access }}</FieldLabel>
        <FieldOptions
          direction="column"
          :options="{
            open: {
              icon: 'lock-open',
              title: site_access_open,
              description: site_access_open_description,
            },
            admin: {
              icon: 'lock-close',
              title: site_access_closed,
              description: site_access_closed_description,
            },
          }"
          v-model="siteAccess"
        />
      </Field>
    </div>
  </Box>
</template>

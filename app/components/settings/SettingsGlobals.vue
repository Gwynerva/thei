<script lang="ts" setup>
import {
  type LanguageCode,
  languagesInfo,
  loadLanguage,
} from '#layers/thei/shared/language';

const languageSelectElement = shallowRef<HTMLSelectElement>();
const languageCode = ref<LanguageCode>(language.value!.code);
watch(languageCode, async (newCode) => {
  language.value = await loadLanguage(newCode);
});

const siteAccess = ref<'open' | 'admin'>('open');
</script>

<template>
  <Box
    icon="globe"
    :title="phrase.global_settings_title"
    :description="phrase.global_settings_description"
  >
    <div class="flex flex-col gap-md">
      <Field>
        <FieldLabel :focus="languageSelectElement">{{
          phrase.ui_language
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
        <FieldHint>{{ phrase.ui_language_hint }}</FieldHint>
      </Field>

      <Field>
        <FieldLabel>{{ phrase.site_access }}</FieldLabel>
        <FieldOptions
          direction="column"
          :options="{
            open: {
              icon: 'lock-open',
              title: phrase.site_access_open,
              description: phrase.site_access_open_description,
            },
            admin: {
              icon: 'lock-close',
              title: phrase.site_access_closed,
              description: phrase.site_access_closed_description,
            },
          }"
          v-model="siteAccess"
        />
      </Field>
    </div>
  </Box>
</template>

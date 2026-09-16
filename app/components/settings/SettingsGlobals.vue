<script lang="ts" setup>
import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import {
  type LanguageCode,
  languagesInfo,
  loadLanguage,
} from '#layers/thei/shared/language';
import { normalizeSiteUrl } from '#layers/thei/shared/site-url';

const languageCode = ref<LanguageCode>(language.value.code);
watch(languageCode, async (newCode) => {
  _language.value = await loadLanguage(newCode);
});

const accessModel = defineModel<SiteAccessLevel>('access');
const siteUrlModel = defineModel<string>('siteUrl', { default: '' });
const siteUrlError = computed(() =>
  normalizeSiteUrl(siteUrlModel.value) === undefined
    ? phrase.value.site_url_invalid
    : undefined,
);
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

        <Field>
          <FieldLabel>{{ phrase.site_url }}</FieldLabel>
          <FieldInput
            v-model="siteUrlModel"
            autocomplete="off"
            inputmode="url"
            placeholder="https://example.com"
            :error="siteUrlError"
          />
          <FieldHint>{{ phrase.site_url_hint }}</FieldHint>
        </Field>
      </div>
    </Box>
  </div>
</template>

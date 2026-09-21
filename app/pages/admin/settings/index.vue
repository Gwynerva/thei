<script setup lang="ts">
import type { SiteSettingsData } from '#layers/thei/shared/profile';
import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import { languagesInfo, loadLanguage } from '#layers/thei/shared/language';
import {
  normalizeSiteUrl,
  siteUrlBasePath,
} from '#layers/thei/shared/site-url';
import { robotsTxtBody } from '#layers/thei/shared/robots';
import {
  normalizeAnalyticsValue,
  type SiteAnalyticsSettings,
} from '#layers/thei/shared/analytics';
definePageMeta({ layout: 'admin' });
await useAdminTabTitle(computed(() => phrase.value.site_settings));
const initial = await useRequestFetch()<SiteSettingsData>(
  '/api/admin/settings',
);
const {
  value: data,
  isDirty: dataDirty,
  markSaved,
} = useSerializableState(initial);
const confirmPassword = ref('');
const saving = ref(false);
const error = ref<string>();
const isDirty = computed(
  () => dataDirty.value || Boolean(confirmPassword.value),
);
const site = useSiteUrl();
const savedSiteUrl = ref(initial.siteUrl);
// The build decides the folder, so a saved change waits for the next rebuild.
const pendingBasePath = computed(() =>
  siteUrlBasePath(savedSiteUrl.value) === site.base ? undefined : site.base,
);
const rootRobotsTxt = computed(() =>
  site.base === '/'
    ? undefined
    : robotsTxtBody(site.base, site.resolve('/sitemap.xml')),
);
const analyticsFields: {
  key: keyof SiteAnalyticsSettings;
  label: () => string;
  hint: () => string;
  placeholder: string;
}[] = [
  {
    key: 'googleTagId',
    label: () => phrase.value.analytics_google_tag,
    hint: () => phrase.value.analytics_google_tag_hint,
    placeholder: 'G-XXXXXXXXXX',
  },
  {
    key: 'yandexMetrikaId',
    label: () => phrase.value.analytics_yandex_metrika,
    hint: () => phrase.value.analytics_yandex_metrika_hint,
    placeholder: '12345678',
  },
  {
    key: 'googleSiteVerification',
    label: () => phrase.value.analytics_google_verification,
    hint: () => phrase.value.analytics_google_verification_hint,
    placeholder: 'abc123…',
  },
  {
    key: 'yandexVerification',
    label: () => phrase.value.analytics_yandex_verification,
    hint: () => phrase.value.analytics_yandex_verification_hint,
    placeholder: 'abc123…',
  },
];
const analyticsErrors = computed(() =>
  Object.fromEntries(
    analyticsFields.map((field) => [
      field.key,
      normalizeAnalyticsValue(field.key, data.value.analytics[field.key]) ===
      undefined
        ? phrase.value.analytics_invalid
        : undefined,
    ]),
  ),
);
const analyticsValid = computed(() =>
  Object.values(analyticsErrors.value).every((error) => !error),
);
const siteUrlError = computed(() =>
  normalizeSiteUrl(data.value.siteUrl) === undefined
    ? phrase.value.site_url_invalid
    : undefined,
);
const canSave = computed(
  () =>
    isDirty.value &&
    !saving.value &&
    Boolean(data.value.secretPhrase.trim()) &&
    !siteUrlError.value &&
    analyticsValid.value &&
    data.value.password === confirmPassword.value,
);
async function save() {
  if (!canSave.value) return;
  saving.value = true;
  error.value = undefined;
  try {
    data.value = await $fetch<SiteSettingsData>('/api/admin/settings', {
      method: 'PUT',
      body: data.value,
    });
    confirmPassword.value = '';
    savedSiteUrl.value = data.value.siteUrl;
    markSaved();
    _language.value = await loadLanguage(data.value.languageCode);
    await refreshNuxtData('admin-profile');
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}
useSavedForm(isDirty, save, canSave);
</script>
<template>
  <div>
    <AdminSaveHeader
      :title="phrase.site_settings"
      icon="cog"
      :dirty="isDirty"
      :saving="saving"
      :can-save="canSave"
      :error="error"
      @save="save"
    />
    <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
      <fieldset :disabled="saving" class="flex min-w-0 flex-col gap-lg">
        <div>
          <SectionHeader
            icon="globe"
            :title="phrase.global_settings"
            class="mb-md"
          /><Box class="flex flex-col gap-md p-sm sm:p-md">
            <Field
              ><FieldLabel>{{ phrase.ui_language }}</FieldLabel
              ><FieldSelect
                v-model="data.languageCode"
                :options="languagesInfo"
            /></Field>
            <Field
              ><FieldLabel required>{{ phrase.site_access }}</FieldLabel
              ><FieldOptions
                v-model="data.siteAccessLevel"
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
            /></Field>
            <Field
              ><FieldLabel>{{ phrase.site_url }}</FieldLabel
              ><FieldInput
                v-model="data.siteUrl"
                autocomplete="off"
                inputmode="url"
                placeholder="https://example.com"
                :error="siteUrlError"
              /><FieldHint>{{ phrase.site_url_hint }}</FieldHint></Field
            >
            <p
              v-if="pendingBasePath"
              class="flex items-start gap-xs rounded-normal bg-bg-warning p-sm
                text-sm text-text-warning"
            >
              <Icon name="warning" class="mt-0.5 shrink-0" />
              {{ phrase.site_url_rebuild_pending(pendingBasePath) }}
            </p>
            <Field v-if="rootRobotsTxt"
              ><FieldLabel>{{ phrase.site_url_robots_title }}</FieldLabel>
              <pre
                class="scrollbar-mini overflow-x-auto rounded-normal bg-bg-3
                  p-sm text-xs"
                >{{ rootRobotsTxt }}</pre>
              <FieldHint>{{ phrase.site_url_robots_hint }}</FieldHint></Field
            >
          </Box>
        </div>
        <div>
          <SectionHeader
            icon="visibility"
            :title="phrase.analytics"
            :description="phrase.analytics_description"
            class="mb-md"
          /><Box class="grid gap-md p-sm sm:grid-cols-2 sm:p-md">
            <Field v-for="field in analyticsFields" :key="field.key"
              ><FieldLabel>{{ field.label() }}</FieldLabel
              ><FieldInput
                v-model="data.analytics[field.key]"
                autocomplete="off"
                spellcheck="false"
                :placeholder="field.placeholder"
                :error="analyticsErrors[field.key]"
              /><FieldHint>{{ field.hint() }}</FieldHint></Field
            >
          </Box>
        </div>
        <div>
          <SectionHeader
            icon="person-key"
            :title="phrase.admin_data"
            class="mb-md"
          /><Box class="flex flex-col gap-md p-sm sm:p-md">
            <Field
              ><FieldLabel required>{{ phrase.secret_phrase }}</FieldLabel
              ><FieldInput
                v-model="data.secretPhrase"
                autocomplete="off"
              /><FieldHint>{{ phrase.secret_phrase_hint }}</FieldHint></Field
            >
            <div class="grid gap-md sm:grid-cols-2">
              <Field
                ><FieldLabel>{{ phrase.password }}</FieldLabel
                ><FieldInput
                  v-model="data.password"
                  type="password"
                  autocomplete="new-password"
                /><FieldHint>{{
                  phrase.profile_password_hint
                }}</FieldHint></Field
              >
              <Field
                ><FieldLabel>{{ phrase.repeat_password }}</FieldLabel
                ><FieldInput
                  v-model="confirmPassword"
                  type="password"
                  autocomplete="new-password"
                  :error="
                    confirmPassword && confirmPassword !== data.password
                      ? phrase.profile_password_mismatch
                      : undefined
                  "
              /></Field>
            </div>
          </Box>
        </div>
      </fieldset>
      <div>
        <SectionHeader
          icon="palette"
          :title="phrase.visuals"
          :description="phrase.profile_personal_hint"
          class="mb-md"
        /><ClientOnly
          ><SettingsVisualsBox
            show-public-view-mode
            :reload-on-view-change="false"
        /></ClientOnly>
      </div>
      <div>
        <SectionHeader
          icon="files"
          :title="phrase.backups"
          :description="phrase.backups_description"
          class="mb-md"
        /><SettingsBackupBox />
      </div>
    </div>
  </div>
</template>

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
import type { FormNeed } from '#layers/thei/app/composables/form-needs';
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
const siteUrlError = computed(() =>
  normalizeSiteUrl(data.value.siteUrl) === undefined
    ? phrase.value.site_url_invalid
    : undefined,
);
/** What the settings still need before they can be saved, in the page's order. */
const needs = useFormNeeds(() => {
  const list: FormNeed[] = [];
  if (siteUrlError.value)
    list.push({
      key: 'site-url',
      label: phrase.value.site_url,
      problem: phrase.value.site_url_invalid_short,
    });
  for (const field of analyticsFields)
    if (analyticsErrors.value[field.key])
      list.push({
        key: `analytics-${field.key}`,
        label: field.label(),
        problem: phrase.value.analytics_invalid_short,
      });
  if (!data.value.secretPhrase.trim())
    list.push({ key: 'secret-phrase', label: phrase.value.secret_phrase });
  if (data.value.password !== confirmPassword.value)
    list.push(
      confirmPassword.value
        ? {
            key: 'repeat-password',
            label: phrase.value.repeat_password,
            problem: phrase.value.profile_password_mismatch,
          }
        : { key: 'repeat-password', label: phrase.value.repeat_password },
    );
  return list;
});
const canSave = computed(
  () => isDirty.value && !saving.value && !needs.blocked.value,
);
// Ctrl+S on changes not ready to save says what they still need.
const canAsk = computed(() => isDirty.value && !saving.value);
async function save() {
  if (!canAsk.value) return;
  // Asked by a press or Ctrl+S, a save it cannot make says why.
  if (needs.blocked.value) return needs.ask();
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
useSavedForm(isDirty, save, canAsk);
</script>
<template>
  <div>
    <AdminSaveHeader
      :title="phrase.site_settings"
      icon="cog"
      :dirty="isDirty"
      :saving="saving"
      :can-save="canSave"
      :reason="isDirty ? needs.reason.value : undefined"
      :error="error ?? needs.line.value"
      :error-again="needs.asks.value"
      @save="save"
    />
    <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
      <div>
        <SectionHeader
          icon="sparkles"
          :title="phrase.ai_page"
          :description="phrase.ai_settings_link"
          class="mb-md"
          data-settings-ai
        >
          <template #action>
            <TheiLink
              to="/admin/ai/?tab=connection"
              class="flex h-10 items-center gap-xs rounded-normal bg-bg-3 px-md
                text-sm font-semibold text-text-2 transition hocus:bg-bg-accent
                hocus:text-accent"
            >
              {{ phrase.ai_open_page }}<Icon name="chevron-right" />
            </TheiLink>
          </template>
        </SectionHeader>
        <!-- The switch itself too, first on the page: with AI off, its ✦
             gone, this is where a person looks for it. -->
        <AiSwitch />
      </div>
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
            <Field need="site-url"
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
            <Field
              v-for="field in analyticsFields"
              :key="field.key"
              :need="`analytics-${field.key}`"
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
            <Field need="secret-phrase"
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
              <Field need="repeat-password"
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

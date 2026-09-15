<script lang="ts" setup>
import type { BootUpdateDetails } from '#layers/thei/server/thei/boot/result';
import {
  type LanguageCode,
  languageCodes,
  loadLanguage,
} from '#layers/thei/shared/language';

useHead({ title: 'Thei' });

// The boot stopped before the configured language was loaded, so this page
// picks one from the browser the same way the install wizard does.
const ready = ref(false);
const details = useState<BootUpdateDetails | undefined>('boot-update');

onMounted(async () => {
  let languageCode: LanguageCode = 'en';
  const browserLanguageCode = navigator.language.toLowerCase().slice(0, 2);

  if (isOneOf(browserLanguageCode, languageCodes)) {
    languageCode = browserLanguageCode;
  }

  _language.value = await loadLanguage(languageCode);
  ready.value = true;
});
</script>

<template>
  <AdminGridWrapper>
    <div class="m-auto flex w-(--width-narrow) flex-col px-window py-lg">
      <TransitionFade mode="out-in">
        <Box v-if="ready">
          <div class="flex flex-col gap-sm p-md">
            <h1 class="flex items-center gap-xs text-xl font-bold">
              <Icon name="warning" class="shrink-0 text-text-error" />
              {{ phrase.boot_update_title }}
            </h1>

            <p class="text-text-2">
              {{
                details?.reason === 'downgrade'
                  ? phrase.boot_update_downgrade
                  : phrase.boot_update_migration_failed
              }}
            </p>

            <InfoBlock
              v-if="details"
              :rows="[
                {
                  label: phrase.update_current_version,
                  value: details.toVersion,
                },
                {
                  label: phrase.update_latest_version,
                  value: details.fromVersion,
                },
              ]"
            />

            <p class="text-sm text-text-3">{{ phrase.boot_update_hint }}</p>
          </div>

          <p
            v-if="details?.message"
            class="border-t border-border-error bg-bg-error px-md py-sm text-sm
              text-text-error"
          >
            <span v-if="details.migrationId" class="font-semibold">
              {{ details.migrationId }}:
            </span>
            {{ details.message }}
          </p>
        </Box>
        <TheiLoadingIndicator v-else />
      </TransitionFade>
    </div>
  </AdminGridWrapper>
</template>

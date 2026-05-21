<script lang="ts" setup>
import { SiteAccessLevel } from '#layers/thei/shared/access-level';

useHead({
  title: computed(() => phrase.value.install_thei),
});

const installError = ref<string | undefined>();
const installing = ref(false);

const languageCode = computed(() => language.value.code);
const siteAccessLevel = ref<SiteAccessLevel>();
const displayName = ref('');
const secretPhrase = ref('');
const password = ref('');

const installData = computed(() => {
  return {
    languageCode: languageCode.value,
    siteAccessLevel: siteAccessLevel.value,
    displayName: displayName.value.trim(),
    secretPhrase: secretPhrase.value.trim(),
    password: password.value.trim(),
  };
});

const canInstall = computed(() => {
  return (
    !installing.value &&
    installData.value.languageCode &&
    installData.value.siteAccessLevel &&
    installData.value.displayName &&
    installData.value.secretPhrase &&
    installData.value.password
  );
});

async function installClick() {
  installError.value = undefined;
  installing.value = true;

  try {
    const installResponse = await $fetch('/api/install/', {
      method: 'POST',
      body: installData.value,
    });

    if (installResponse.type === 'error') {
      throw installResponse.message;
    }

    window.location.href = '/sign-in/';
  } catch (error) {
    installError.value = error instanceof Error ? error.message : String(error);
    installing.value = false;
  }
}
</script>

<template>
  <!-- Wrapper to make transition from install loading icon work -->
  <div>
    <StickyGlassHeader
      width="var(--width-narrow)"
      class="py-xs"
      :error="installError"
    >
      <div class="flex items-center justify-between gap-xs">
        <div class="flex min-w-0 items-center gap-sm text-xl font-bold">
          <Icon name="thei" class="shrink-0 text-2xl text-accent" />
          <h1 class="truncate">{{ phrase.install_thei }}</h1>
        </div>
        <Button
          @click="installClick"
          :disabled="!canInstall"
          class="flex items-center gap-xs font-semibold"
        >
          <Icon v-if="installing" name="loading" />
          <span>{{ installing ? phrase.installing : phrase.install }}</span>
        </Button>
      </div>
    </StickyGlassHeader>

    <div class="m-auto flex w-(--width-narrow) flex-col gap-lg px-window py-lg">
      <SettingsGlobals v-model:access="siteAccessLevel" />
      <SettingsVisuals />
      <SettingsAdmin
        v-model:display-name="displayName"
        v-model:secret-phrase="secretPhrase"
        v-on:password="password = $event"
      />
    </div>
  </div>
</template>

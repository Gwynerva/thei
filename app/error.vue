<script lang="ts" setup>
import type { NuxtError } from '#app';
import { loadLanguage } from '#layers/thei/shared/language';
import { _language } from './composables/language';

const props = defineProps<{ error: NuxtError }>();
const publicAdmin = await usePublicAdmin();
if (!_language.value)
  _language.value = await loadLanguage(publicAdmin.value.languageCode);

const status = computed(() => props.error.status || props.error.statusCode || 500);
const title = computed(() => {
  if (status.value === 403) return phrase.value.forbidden_title;
  if (status.value === 404) return phrase.value.not_found_title;
  return phrase.value.error_title;
});
const description = computed(() => {
  if (status.value === 403) return phrase.value.forbidden_description;
  if (status.value === 404) return phrase.value.not_found_description;
  return phrase.value.error_description;
});

useHead({ title });

function leaveError(path: string) {
  return clearError({ redirect: path });
}
</script>

<template>
  <NuxtLayout name="public">
    <main class="m-auto flex min-h-[65vh] w-(--width-wide) items-center justify-center px-window py-lg">
      <section
        class="relative isolate w-full max-w-192 overflow-hidden rounded-normal
          border border-border-1 bg-bg-2 p-md text-center shadow-lg
          shadow-shadow-1 sm:p-lg"
      >
        <GridPattern class="pointer-events-none absolute inset-0 -z-1 opacity-30" />

        <div v-if="status === 404" class="relative m-auto mb-md flex h-36 max-w-72 items-center justify-center">
          <Icon name="missing" class="text-8xl text-accent" />
          <span class="absolute left-4 top-3 rotate-12 text-2xl text-text-3"><Icon name="event" /></span>
          <span class="absolute right-4 bottom-4 -rotate-12 text-3xl text-text-3"><Icon name="project" /></span>
          <span class="absolute right-10 top-1 text-xl text-text-3"><Icon name="star" /></span>
        </div>
        <div
          v-else
          class="m-auto mb-md flex size-28 items-center justify-center rounded-full
            border border-border-2 bg-bg-3 text-6xl text-accent shadow-md"
        >
          <Icon :name="status === 403 ? 'lock-close' : 'warning'" />
        </div>

        <p class="text-sm font-bold tracking-widest text-accent">{{ status }}</p>
        <h1 class="mt-xs text-3xl font-bold tracking-tight sm:text-4xl">{{ title }}</h1>
        <p class="m-auto mt-xs max-w-128 text-lg leading-relaxed text-text-2">{{ description }}</p>

        <div class="mt-md flex flex-wrap justify-center gap-xs">
          <button
            v-if="status === 403"
            type="button"
            class="cursor-pointer rounded-normal bg-accent px-md py-xs font-semibold
              text-white transition hocus:brightness-110"
            @click="leaveError('/sign-in/')"
          >
            {{ phrase.sign_in }}
          </button>
          <template v-else>
            <button
              type="button"
              class="cursor-pointer rounded-normal bg-accent px-md py-xs font-semibold
                text-white transition hocus:brightness-110"
              @click="leaveError('/')"
            >
              {{ phrase.back_home }}
            </button>
            <button
              v-if="status === 404"
              type="button"
              class="cursor-pointer rounded-normal bg-bg-3 px-md py-xs font-semibold
                text-text-2 transition hocus:bg-accent/20 hocus:text-accent"
              @click="leaveError('/life/')"
            >
              {{ phrase.open_life }}
            </button>
          </template>
        </div>
      </section>
    </main>
  </NuxtLayout>
</template>

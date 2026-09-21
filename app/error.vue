<script lang="ts" setup>
import type { NuxtError } from '#app';
import { loadLanguage } from '#layers/thei/shared/language';
import { _language } from './composables/language';
import { useErrorView } from './composables/error-view';

const props = defineProps<{ error: NuxtError }>();
const publicAdmin = await usePublicAdmin();
if (!_language.value)
  _language.value = await loadLanguage(publicAdmin.value.languageCode);

const view = useErrorView(
  () => props.error.status || props.error.statusCode || 500,
);

useHead({
  title: () => view.value.title,
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
});

function leaveError(path: string) {
  return clearError({ redirect: path });
}
</script>

<template>
  <NuxtLayout name="public">
    <main
      class="m-auto flex min-h-[70vh] w-(--width-wide) max-w-full flex-col
        items-center justify-center overflow-hidden px-window py-lg text-center"
      :data-error-status="view.status"
    >
      <ErrorSingularity :icon="view.icon" :debris="view.debris" class="mb-sm" />

      <p class="text-sm font-bold tracking-widest text-accent">
        {{ view.status }}
      </p>
      <h1 class="mt-xs text-3xl font-bold tracking-tight sm:text-4xl">
        {{ view.title }}
      </h1>
      <p class="mt-xs max-w-128 text-lg leading-relaxed text-text-2">
        {{ view.description }}
      </p>

      <div class="mt-md flex flex-wrap justify-center gap-xs">
        <button
          v-for="action in view.actions"
          :key="action.path"
          type="button"
          class="cursor-pointer rounded-normal px-md py-xs font-semibold
            transition"
          :class="
            action.primary
              ? 'bg-accent text-white hocus:brightness-110'
              : 'bg-bg-3 text-text-2 hocus:bg-accent/20 hocus:text-accent'
          "
          @click="leaveError(action.path)"
        >
          {{ action.label }}
        </button>
      </div>
    </main>
  </NuxtLayout>
</template>

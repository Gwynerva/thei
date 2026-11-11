<script lang="ts" setup>
import type { PublicAction } from '#layers/thei/shared/api/public';
import { vEntityCard } from '#layers/thei/app/composables/entity-cards';

defineProps<{ action?: PublicAction }>();
</script>

<template>
  <ProjectActionButton
    v-if="action"
    v-entity-card="
      action.target === 'external-link'
        ? {
            external: {
              url: action.href,
              title: publicText(action.text),
              faviconMedia: action.faviconMedia,
            },
          }
        : undefined
    "
    :text="action.text"
    :accent-color="action.accentColor"
    :target="action.target"
    :href="action.href"
    :icon-media="action.iconMedia"
    :file-media="action.fileMedia"
    :favicon-media="action.faviconMedia"
    :use-favicon="action.useFavicon"
    :background-media="action.backgroundMedia"
    :background-mode="action.backgroundMode"
    :background-size="action.backgroundSize"
    :background-repeat="action.backgroundRepeat"
  />
</template>

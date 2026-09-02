<script lang="ts" setup>
import type { PublicAction } from '#layers/thei/shared/api/public';

defineProps<{ action?: PublicAction }>();
</script>

<template>
  <ProjectActionButton
    v-if="action"
    :text="action.text"
    :accent-color="action.accentColor"
    :target="action.target"
    :href="action.href"
    :icon-media="action.iconMedia"
    :background-media="action.backgroundMedia"
    :background-mode="action.backgroundMode"
    :background-size="action.backgroundSize"
    :background-repeat="action.backgroundRepeat"
  />
</template>

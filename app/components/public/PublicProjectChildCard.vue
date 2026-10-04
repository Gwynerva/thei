<script lang="ts" setup>
import type { PublicProjectSection } from '#layers/thei/shared/api/public';

defineProps<{ item: PublicProjectSection }>();
</script>

<template>
  <PublicContentCard
    :href="item.href"
    :title="item.title"
    :summary="item.summary"
    :date="item.date"
    :period="item.period"
    :media="item.media"
  />
</template>

<script lang="ts" setup>
import type {
  ContentEntityType,
  ContentLinkResolver,
  ResolvedContentLink,
} from '#layers/thei/shared/content-link';
import ContentLinkPreviewCard from './ContentLinkPreviewCard.vue';

const props = withDefaults(
  defineProps<{
    entityType: ContentEntityType;
    entityId: string;
    resolver: ContentLinkResolver;
    interactive?: boolean;
  }>(),
  { interactive: true },
);
const result = ref<ResolvedContentLink>();
let version = 0;
watch(
  () => [props.entityType, props.entityId] as const,
  async ([entityType, entityId]) => {
    const current = ++version;
    const resolved = await props.resolver(
      entityType === 'project'
        ? { kind: 'project', projectUuid: entityId }
        : entityType === 'event'
          ? { kind: 'event', eventUuid: entityId }
          : { kind: 'page', pageUuid: entityId },
    );
    if (current === version) result.value = resolved;
  },
  { immediate: true },
);
onUnmounted(() => {
  version++;
});
</script>

<template>
  <ContentLinkPreviewCard
    :result="result"
    :label="phrase.content_link_loading"
    :interactive="interactive"
  />
</template>

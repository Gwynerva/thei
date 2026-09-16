<script lang="ts" setup>
import type { MediaPlayback } from '#layers/thei/shared/media';
import type {
  ContentEntityType,
  ContentLinkResolver,
  ResolvedContentLink,
} from '#layers/thei/shared/content-link';
import ContentLinkPreviewCard from './ContentLinkPreviewCard.vue';

const props = withDefaults(
  defineProps<{
    entityType: ContentEntityType;
    /** Absent when the server redacted a target this reader may not open. */
    entityId?: string;
    /** Set instead of `entityId` for such a target. */
    restricted?: boolean;
    resolver: ContentLinkResolver;
    interactive?: boolean;
    playback?: MediaPlayback;
  }>(),
  { interactive: true },
);
const result = ref<ResolvedContentLink>();
let version = 0;
watch(
  () => [props.entityType, props.entityId, props.restricted] as const,
  async ([entityType, entityId, restricted]) => {
    const current = ++version;
    const reference =
      entityType === 'project'
        ? { kind: 'project' as const, projectUuid: entityId ?? '' }
        : entityType === 'event'
          ? { kind: 'event' as const, eventUuid: entityId ?? '' }
          : { kind: 'page' as const, pageUuid: entityId ?? '' };
    // Nothing to ask about: the server already decided this reader may not
    // open the target, and the uuid it would be asked with is gone.
    const resolved: ResolvedContentLink = restricted
      ? { ...reference, state: 'restricted' }
      : await props.resolver(reference);
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
    :playback
    :continuous-project-media="entityType === 'project'"
  />
</template>

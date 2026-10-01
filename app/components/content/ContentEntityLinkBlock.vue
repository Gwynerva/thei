<script lang="ts" setup>
import type { MediaPlayback } from '#layers/thei/shared/media';
import {
  contentEntityHasIcon,
  type ContentEntityType,
  type ContentLinkResolver,
  type ResolvedContentLink,
} from '#layers/thei/shared/content-link';
import ContentLinkPreviewCard from './ContentLinkPreviewCard.vue';
import ContentLinkNote from './ContentLinkNote.vue';

/**
 * The card of an `entityLink` block. Where the block can be edited, the card
 * is not a link: its last line is the owner's note, written in place.
 */
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
    /** The owner's note, the last line of the card. */
    note?: string;
    editable?: boolean;
    notePlaceholder?: string;
  }>(),
  { interactive: true },
);
const emit = defineEmits<{ 'update:note': [value: string] }>();
const result = ref<ResolvedContentLink>();
let version = 0;
watch(
  () => [props.entityType, props.entityId, props.restricted] as const,
  async ([entityType, entityId, restricted]) => {
    const current = ++version;
    const reference = {
      kind: 'entity' as const,
      entityType,
      entityId: entityId ?? '',
    };
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
    :label="entityTypeLabel(entityType)"
    :interactive="interactive && !editable"
    :playback
    :continuous-project-media="contentEntityHasIcon(entityType)"
  >
    <template v-if="editable || note" #note>
      <ContentLinkNote
        :note
        :editable
        :placeholder="notePlaceholder"
        @update:note="emit('update:note', $event)"
      />
    </template>
  </ContentLinkPreviewCard>
</template>

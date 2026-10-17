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
import ContentLinkFragment from './ContentLinkFragment.vue';
import { isFixedContentPlace } from '#layers/thei/shared/content-headings';
import { fetchContentEntityOutline } from '#layers/thei/app/composables/content-entity-outline';

/**
 * The card of an `entityLink` block. Where the block can be edited, the card
 * is not a link: its last line is the owner's note, written in place, under
 * the place inside the target the link leads to, if it leads to one.
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
    /** Where inside the target the link leads, if anywhere. */
    fragment?: string;
    /** The owner's note, the last line of the card. */
    note?: string;
    editable?: boolean;
    notePlaceholder?: string;
  }>(),
  { interactive: true },
);
const emit = defineEmits<{
  'update:note': [value: string];
  removeFragment: [];
}>();
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

/** Where it is edited, the heading its fragment names: by its words, or gone. */
const place = ref<{ heading?: string; gone?: boolean }>({});
let placeVersion = 0;
watch(
  () =>
    [props.editable, props.entityType, props.entityId, props.fragment] as const,
  async ([editable, entityType, entityId, fragment]) => {
    const current = ++placeVersion;
    place.value = {};
    if (!editable || !entityId || !fragment || isFixedContentPlace(fragment))
      return;
    // A request that fails says nothing of the heading.
    const outline = await fetchContentEntityOutline(entityType, entityId).catch(
      () => undefined,
    );
    if (current !== placeVersion || !outline) return;
    const found = outline.headings.find((item) => item.id === fragment);
    place.value = found ? { heading: found.title } : { gone: true };
  },
  { immediate: true },
);
onUnmounted(() => {
  placeVersion++;
});
</script>

<template>
  <ContentLinkPreviewCard
    :result="result"
    :label="entityTypeLabel(entityType)"
    :fragment
    :interactive="interactive && !editable"
    :playback
    :continuous-project-media="contentEntityHasIcon(entityType)"
  >
    <template v-if="editable || note" #note>
      <ContentLinkFragment
        v-if="editable && fragment"
        :fragment
        :heading="place.heading"
        :gone="place.gone"
        removable
        class="mb-1"
        @remove="emit('removeFragment')"
      />
      <ContentLinkNote
        :note
        :editable
        :placeholder="notePlaceholder"
        @update:note="emit('update:note', $event)"
      />
    </template>
  </ContentLinkPreviewCard>
</template>

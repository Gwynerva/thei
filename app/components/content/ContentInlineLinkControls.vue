<script lang="ts" setup>
import {
  entityLinkAttributes,
  externalLinkAttributes,
} from './editor-inline-link-dom';
import type {
  ContentInlineLinkControlsExpose,
  ContentInlineLinkRequest,
} from './editor-inline-links';
import type { ContentLinkPick, ContentLinkTarget } from './link-picker/types';

/**
 * The popup of the inline «Link» tool: the link picker over the words, and
 * whatever it gives written as a link of them — to an entity, a place in
 * it, or another site — with its note. Nothing is written until the picker
 * applies; closed without that, the words are as they were.
 */
const open = ref(false);
const request = shallowRef<ContentInlineLinkRequest>();
/** Each opening is a picker of its own, fresh. */
const opening = ref(0);
const picker = useTemplateRef<{ focus: () => void }>('picker');

const initial = computed<ContentLinkTarget | undefined>(() => {
  const current = request.value;
  if (current?.initialEntity)
    return {
      kind: 'entity',
      entityType: current.initialEntity.entityType,
      entityId: current.initialEntity.entityId,
      ...(current.initialFragment ? { fragment: current.initialFragment } : {}),
    };
  if (current?.initialUrl) return { kind: 'external', url: current.initialUrl };
  return undefined;
});

function openLink(next: ContentInlineLinkRequest) {
  request.value = next;
  opening.value++;
  open.value = true;
}

function applied(pick: ContentLinkPick) {
  const current = request.value;
  if (!current) return;
  if (pick.kind === 'entity')
    current.apply(
      pick.heading ?? entityDisplayTitle(pick.entity),
      entityLinkAttributes(pick.entity, {
        note: pick.note,
        fragment: pick.fragment,
      }),
    );
  else if (pick.kind === 'external')
    current.apply(pick.title, externalLinkAttributes(pick.url, pick.note));
  open.value = false;
}

function removed() {
  request.value?.remove();
  open.value = false;
}

function popupClosed() {
  // Opened again while it faded: the new opening is kept.
  if (open.value) return;
  request.value?.restore();
  request.value = undefined;
}

defineExpose<ContentInlineLinkControlsExpose>({ open: openLink });
</script>

<template>
  <FloatingPopup
    v-model:open="open"
    :anchor="request?.anchor ?? null"
    placement="bottom-start"
    :fallback-placements="['top-start']"
    :offset="0"
    shift-cross-axis
    max-width="20rem"
    @opened="picker?.focus()"
    @dismiss="request?.restore()"
    @closed="popupClosed"
  >
    <ContentLinkPicker
      v-if="request"
      ref="picker"
      :key="opening"
      mode="inline"
      :suggest="request.selectionText"
      :initial
      :initial-note="request.initialNote"
      :existing="request.existing"
      @apply="applied"
      @remove="removed"
    />
  </FloatingPopup>
</template>

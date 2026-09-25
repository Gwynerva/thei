<script lang="ts" setup>
import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';
import {
  externalLinkHostname,
  normalizeExternalLinkUrl,
} from '#layers/thei/shared/external-link';
import ExternalLinkPreviewCard from '#layers/thei/app/components/external-links/ExternalLinkPreviewCard.vue';
import EntityLinkPreviewCard from './EntityLinkPreviewCard.vue';
import { parseInternalUrl } from '#layers/thei/shared/internal-url';
import {
  createExternalLinkDraft,
  useExternalLinks,
} from '#layers/thei/app/composables/external-links';
import type {
  ContentInlineLinkControlsExpose,
  ContentInlineLinkRequest,
} from './editor-inline-links';

const props = defineProps<{ teleportTo?: string | HTMLElement }>();
const open = ref(false);
const mode = ref<'project' | 'external'>('project');
const request = shallowRef<ContentInlineLinkRequest>();
const externalUrl = ref('');
const note = ref('');
const draft = createExternalLinkDraft(useExternalLinks(), {
  errorText: () => phrase.value.content_link_broken_description,
});
/**
 * The entity an address typed as an external link turned out to open. Such a
 * link is stored as an internal one, so it outlives a change of domain.
 */
const internalEntity = ref<ContentEntitySearchItem>();
const internalEntityUrl = ref<string>();
const internalLoading = ref(false);
const internalSite = useInternalUrlSite();
const projectPopup = useTemplateRef<{ focus: () => void }>('projectPopup');
const externalInput = ref<HTMLInputElement>();
let internalVersion = 0;

const externalPreview = computed(() => draft.preview);
const externalError = computed(() => draft.error);
const externalLoading = computed(() => draft.loading || internalLoading.value);

// Typing changes nothing but the text and whether it is a valid address; the
// site is read once the address is done.
watch(externalUrl, (value) => {
  internalEntity.value = undefined;
  internalEntityUrl.value = undefined;
  draft.url = value;
});

/** An address of this site is looked up as an entity before anything else. */
async function findInternal(raw: string) {
  const version = ++internalVersion;
  internalLoading.value = true;
  try {
    const entity = await findEntityByInternalUrl(raw, internalSite).catch(
      () => undefined,
    );
    if (version !== internalVersion) return undefined;
    internalEntity.value = entity;
    internalEntityUrl.value = entity ? raw : undefined;
    return entity;
  } finally {
    if (version === internalVersion) internalLoading.value = false;
  }
}

/** The address is done: pasted, left, or confirmed with Enter. */
async function commitUrl() {
  const raw = externalUrl.value.trim();
  if (parseInternalUrl(raw, internalSite) && (await findInternal(raw))) return;
  await draft.commit();
}

function onUrlPaste() {
  void nextTick(commitUrl);
}

function openProject(next: ContentInlineLinkRequest) {
  mode.value = 'project';
  request.value = next;
  note.value = next.initialNote ?? '';
  open.value = true;
}

function openExternal(next: ContentInlineLinkRequest) {
  mode.value = 'external';
  request.value = next;
  note.value = next.initialNote ?? '';
  internalEntity.value = undefined;
  internalEntityUrl.value = undefined;
  externalUrl.value = next.initialUrl ?? '';
  draft.reset();
  open.value = true;
  if (next.initialUrl) void openExisting(next.initialUrl);
}

/** An existing link shows what is known about it; the site is not read. */
async function openExisting(url: string) {
  const raw = url.trim();
  if (parseInternalUrl(raw, internalSite) && (await findInternal(raw))) return;
  await draft.open(raw);
}

function selectProject(project: ContentEntitySearchItem) {
  request.value?.apply(project.title, {
    href: project.url,
    'data-content-link': 'entity',
    'data-entity-type': project.entityType,
    'data-entity-id': project.entityId,
    'data-content-note': noteAttribute(),
  });
  open.value = false;
}

/** An empty note is an absent attribute, never an empty one. */
function noteAttribute() {
  return note.value.trim() || undefined;
}

/**
 * Editing only the note of a link that already exists: the target is
 * untouched, so nothing but the note is written back.
 */
function submitNoteOnly() {
  request.value?.apply('', { 'data-content-note': noteAttribute() });
  open.value = false;
}

async function submitExternal() {
  const raw = externalUrl.value.trim();
  if (parseInternalUrl(raw, internalSite)) {
    const entity =
      internalEntityUrl.value === raw
        ? internalEntity.value
        : await findInternal(raw);
    if (entity) {
      selectProject(entity);
      return;
    }
  }
  let url: string;
  try {
    url = normalizeExternalLinkUrl(raw);
  } catch {
    // The draft already shows why.
    return;
  }
  const preview = await draft.commit();
  request.value?.apply(preview?.title || externalLinkHostname(url), {
    href: url,
    'data-content-link': 'external',
    'data-entity-type': undefined,
    'data-entity-id': undefined,
    'data-content-note': noteAttribute(),
  });
  open.value = false;
}

function removeLink() {
  request.value?.remove();
  open.value = false;
}

function focusPopup() {
  if (mode.value === 'project') projectPopup.value?.focus();
  else externalInput.value?.focus({ preventScroll: true });
}

function popupClosed() {
  note.value = '';
  internalVersion++;
  internalEntity.value = undefined;
  internalEntityUrl.value = undefined;
  internalLoading.value = false;
  draft.reset();
  request.value?.restore();
  request.value = undefined;
}

defineExpose<ContentInlineLinkControlsExpose>({ openProject, openExternal });
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
    :teleport-to="teleportTo"
    class="border border-border-1 bg-bg-2"
    @opened="focusPopup"
    @closed="popupClosed"
  >
    <div class="flex max-h-(--floating-popup-available-height) flex-col">
      <ContentEntitySearchPopup
        v-if="mode === 'project'"
        ref="projectPopup"
        class="min-h-0 border-0"
        @select="selectProject"
      />
      <form
        v-else
        class="flex min-h-0 flex-col gap-xs rounded-normal bg-bg-2 p-xs"
        @submit.prevent="submitExternal"
      >
        <div class="flex items-start gap-1">
          <FieldInput
            v-model="externalUrl"
            type="text"
            inputmode="url"
            autocomplete="url"
            wrapper-class="min-w-0 flex-1"
            class="h-9 py-1 text-sm"
            :placeholder="phrase.content_link_url"
            :error="externalError"
            @element="externalInput = $event"
            @change="commitUrl"
            @paste="onUrlPaste"
            @submit="submitExternal"
          />
          <Button
            v-if="request?.existing"
            type="button"
            variant="delete"
            size="icon"
            :aria-label="phrase.content_link_remove"
            @click="removeLink"
          >
            <Icon name="delete" />
          </Button>
          <Button
            type="submit"
            size="icon"
            :disabled="externalLoading"
            :aria-label="phrase.content_external_link"
            :aria-busy="externalLoading"
          >
            <Icon :name="externalLoading ? 'loading' : 'check'" />
          </Button>
        </div>
        <template v-if="internalEntity">
          <EntityLinkPreviewCard
            :entity-type="internalEntity.entityType"
            :title="internalEntity.title"
            :summary="internalEntity.summary"
            :date="internalEntity.date"
            :parent="internalEntity.parent"
            :icon-media="internalEntity.previewMedia"
            :interactive="false"
            compact
          />
          <p class="flex items-start gap-1 px-1 text-xs text-text-3">
            <Icon name="link" class="mt-0.5 shrink-0 text-accent" />
            {{ phrase.content_link_internal_detected }}
          </p>
        </template>
        <ExternalLinkPreviewCard
          v-else-if="externalPreview || externalLoading"
          :link="externalPreview"
          :url="externalUrl"
          :loading="externalLoading"
          :loading-text="phrase.external_link_loading"
          :interactive="true"
        />
      </form>
      <div
        class="flex items-start gap-1 p-xs"
        :class="mode === 'project' ? 'pt-0' : 'pt-0'"
      >
        <FieldInput
          v-model="note"
          type="text"
          autocomplete="off"
          spellcheck="true"
          wrapper-class="min-w-0 flex-1"
          class="h-9 py-1 text-sm"
          :aria-label="phrase.content_link_note"
          :placeholder="phrase.content_link_note_placeholder"
          @submit="mode === 'project' ? submitNoteOnly() : submitExternal()"
        />
        <Button
          v-if="mode === 'project' && request?.existing"
          type="button"
          size="icon"
          :aria-label="phrase.save"
          @click="submitNoteOnly"
        >
          <Icon name="check" />
        </Button>
        <Button
          v-if="mode === 'project' && request?.existing"
          type="button"
          variant="delete"
          size="icon"
          :aria-label="phrase.content_link_remove"
          @click="removeLink"
        >
          <Icon name="delete" />
        </Button>
      </div>
    </div>
  </FloatingPopup>
</template>

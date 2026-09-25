<script lang="ts" setup>
import { debounce } from 'perfect-debounce';
import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';
import type { ExternalLink } from '#layers/thei/shared/external-link';
import { normalizeExternalLinkUrl } from '#layers/thei/shared/external-link';
import ExternalLinkPreviewCard from '#layers/thei/app/components/external-links/ExternalLinkPreviewCard.vue';
import EntityLinkPreviewCard from './EntityLinkPreviewCard.vue';
import { parseInternalUrl } from '#layers/thei/shared/internal-url';
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
const externalPreview = ref<ExternalLink>();
const externalPreviewUrl = ref<string>();
const externalError = ref<string>();
const externalLoading = ref(false);
/**
 * The entity an address typed as an external link turned out to open. Such a
 * link is stored as an internal one, so it outlives a change of domain.
 */
const internalEntity = ref<ContentEntitySearchItem>();
const internalEntityUrl = ref<string>();
const internalSite = useInternalUrlSite();
const projectPopup = useTemplateRef<{ focus: () => void }>('projectPopup');
const externalInput = ref<HTMLInputElement>();
let externalRequestVersion = 0;
let activeExternalPreviewUrl: string | undefined;
let activeExternalPreviewRequest: Promise<ExternalLink> | undefined;

const loadExternalPreview = async (version: number, url: string) => {
  const previewRequest =
    activeExternalPreviewUrl === url && activeExternalPreviewRequest
      ? activeExternalPreviewRequest
      : $fetch<ExternalLink>('/api/admin/external-links', {
          query: { url },
        });
  activeExternalPreviewUrl = url;
  activeExternalPreviewRequest = previewRequest;

  try {
    const preview = await previewRequest;
    if (version === externalRequestVersion) {
      externalPreview.value = preview;
      externalPreviewUrl.value = url;
      externalError.value = undefined;
    }
    return preview;
  } catch {
    if (version === externalRequestVersion) {
      externalPreview.value = undefined;
      externalPreviewUrl.value = undefined;
      externalError.value = phrase.value.content_link_broken_description;
    }
    return undefined;
  } finally {
    if (activeExternalPreviewRequest === previewRequest) {
      activeExternalPreviewRequest = undefined;
      activeExternalPreviewUrl = undefined;
    }
    if (version === externalRequestVersion) externalLoading.value = false;
  }
};

/** An address of this site is looked up as an entity before anything else. */
const loadPreview = async (version: number, url: string) => {
  if (parseInternalUrl(url, internalSite)) {
    const entity = await findEntityByInternalUrl(url, internalSite).catch(
      () => undefined,
    );
    if (version !== externalRequestVersion) return;
    if (entity) {
      internalEntity.value = entity;
      internalEntityUrl.value = url;
      externalLoading.value = false;
      return;
    }
  }
  let normalized: string;
  try {
    normalized = normalizeExternalLinkUrl(url);
  } catch {
    externalError.value = phrase.value.content_link_broken_description;
    externalLoading.value = false;
    return;
  }
  await loadExternalPreview(version, normalized);
};

const loadPreviewDebounced = debounce(loadPreview, 350);

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
  externalUrl.value = next.initialUrl ?? '';
  externalPreview.value = undefined;
  externalPreviewUrl.value = undefined;
  externalError.value = undefined;
  internalEntity.value = undefined;
  internalEntityUrl.value = undefined;
  open.value = true;
  queueExternalPreview();
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
  externalError.value = undefined;
  const raw = externalUrl.value.trim();
  if (parseInternalUrl(raw, internalSite)) {
    loadPreviewDebounced.cancel();
    const entity =
      internalEntityUrl.value === raw
        ? internalEntity.value
        : await findEntityByInternalUrl(raw, internalSite).catch(
            () => undefined,
          );
    if (entity) {
      selectProject(entity);
      return;
    }
  }
  let url: string;
  try {
    url = normalizeExternalLinkUrl(externalUrl.value);
  } catch {
    externalError.value = phrase.value.content_link_broken_description;
    return;
  }

  loadPreviewDebounced.cancel();
  let preview =
    externalPreviewUrl.value === url ? externalPreview.value : undefined;
  if (!preview) {
    const version = ++externalRequestVersion;
    externalLoading.value = true;
    preview = await loadExternalPreview(version, url);
  }

  request.value?.apply(preview?.title || new URL(url).hostname, {
    href: url,
    'data-content-link': 'external',
    'data-entity-type': undefined,
    'data-entity-id': undefined,
    'data-content-note': noteAttribute(),
  });
  open.value = false;
}

function queueExternalPreview() {
  loadPreviewDebounced.cancel();
  const version = ++externalRequestVersion;
  externalPreview.value = undefined;
  externalPreviewUrl.value = undefined;
  externalError.value = undefined;
  internalEntity.value = undefined;
  internalEntityUrl.value = undefined;

  const raw = externalUrl.value.trim();
  let url = raw;
  if (!parseInternalUrl(raw, internalSite)) {
    try {
      url = normalizeExternalLinkUrl(raw);
    } catch {
      externalLoading.value = false;
      return;
    }
  }

  externalLoading.value = true;
  void loadPreviewDebounced(version, url);
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
  loadPreviewDebounced.cancel();
  externalRequestVersion++;
  internalEntity.value = undefined;
  internalEntityUrl.value = undefined;
  externalLoading.value = false;
  request.value?.restore();
  request.value = undefined;
}

watch(externalUrl, () => {
  if (open.value && mode.value === 'external') queueExternalPreview();
});

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
          :loading-text="phrase.content_link_loading"
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

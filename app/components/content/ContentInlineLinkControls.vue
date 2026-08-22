<script lang="ts" setup>
import { debounce } from 'perfect-debounce';
import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';
import type { ExternalLink } from '#layers/thei/shared/external-link';
import { normalizeExternalLinkUrl } from '#layers/thei/shared/external-link';
import ExternalLinkPreviewCard from '#layers/thei/app/components/external-links/ExternalLinkPreviewCard.vue';
import type {
  ContentInlineLinkControlsExpose,
  ContentInlineLinkRequest,
} from './editor-inline-links';

const props = defineProps<{ teleportTo?: string | HTMLElement }>();
const open = ref(false);
const mode = ref<'project' | 'external'>('project');
const request = shallowRef<ContentInlineLinkRequest>();
const externalUrl = ref('');
const externalPreview = ref<ExternalLink>();
const externalPreviewUrl = ref<string>();
const externalError = ref<string>();
const externalLoading = ref(false);
const projectPopup = useTemplateRef<{ focus: () => void }>('projectPopup');
const externalInput = ref<HTMLInputElement>();
let externalRequestVersion = 0;
let activeExternalPreviewUrl: string | undefined;
let activeExternalPreviewRequest: Promise<ExternalLink> | undefined;

const loadExternalPreview = async (version: number, url: string) => {
  const previewRequest =
    activeExternalPreviewUrl === url && activeExternalPreviewRequest
      ? activeExternalPreviewRequest
      : $fetch<ExternalLink>('/api/admin/external-link-previews', {
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

const loadExternalPreviewDebounced = debounce(loadExternalPreview, 350);

function openProject(next: ContentInlineLinkRequest) {
  mode.value = 'project';
  request.value = next;
  open.value = true;
}

function openExternal(next: ContentInlineLinkRequest) {
  mode.value = 'external';
  request.value = next;
  externalUrl.value = next.initialUrl ?? '';
  externalPreview.value = undefined;
  externalPreviewUrl.value = undefined;
  externalError.value = undefined;
  open.value = true;
  queueExternalPreview();
}

function selectProject(project: ContentEntitySearchItem) {
  request.value?.apply(project.title, {
    href: project.url,
    'data-content-link': 'entity',
    'data-entity-type': project.entityType,
    'data-entity-id': project.entityId,
  });
  open.value = false;
}

async function submitExternal() {
  externalError.value = undefined;
  let url: string;
  try {
    url = normalizeExternalLinkUrl(externalUrl.value);
  } catch {
    externalError.value = phrase.value.content_link_broken_description;
    return;
  }

  loadExternalPreviewDebounced.cancel();
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
  });
  open.value = false;
}

function queueExternalPreview() {
  loadExternalPreviewDebounced.cancel();
  const version = ++externalRequestVersion;
  externalPreview.value = undefined;
  externalPreviewUrl.value = undefined;
  externalError.value = undefined;

  let url: string;
  try {
    url = normalizeExternalLinkUrl(externalUrl.value);
  } catch {
    externalLoading.value = false;
    return;
  }

  externalLoading.value = true;
  void loadExternalPreviewDebounced(version, url);
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
  loadExternalPreviewDebounced.cancel();
  externalRequestVersion++;
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
        :exclude-project-uuids="[]"
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
            type="url"
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
        <ExternalLinkPreviewCard
          v-if="externalPreview || externalLoading"
          :link="externalPreview"
          :url="externalUrl"
          :loading="externalLoading"
          :loading-text="phrase.content_link_loading"
          :interactive="true"
        />
      </form>
      <Button
        v-if="mode === 'project' && request?.existing"
        type="button"
        variant="delete"
        size="icon"
        :aria-label="phrase.content_link_remove"
        class="m-xs mt-0 self-end"
        @click="removeLink"
      >
        <Icon name="delete" />
      </Button>
    </div>
  </FloatingPopup>
</template>

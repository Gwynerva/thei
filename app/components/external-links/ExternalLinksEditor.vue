<script lang="ts" setup>
import { debounce } from 'perfect-debounce';
import ExternalLinkPreviewCard from './ExternalLinkPreviewCard.vue';
import type {
  ExternalLink,
  ProjectExternalLinkEditItem,
} from '#layers/thei/shared/external-link';
import { normalizeExternalLinkUrl } from '#layers/thei/shared/external-link';
import { moveItemById } from '#layers/thei/app/composables/drag-sort';

const props = defineProps<{
  title: string;
  description: string;
  emptyText: string;
}>();

const links = defineModel<ProjectExternalLinkEditItem[]>({
  required: true,
});

const addButton = useTemplateRef<HTMLElement>('addButton');
const linksRoot = useTemplateRef<HTMLElement>('linksRoot');

const popupOpen = ref(false);
const popupAnchor = ref<HTMLElement | null>(null);
const editingIndex = ref<number | null>(null);

const draftUrl = ref('');
const draftName = ref('');
const suggestedName = ref('');
const draftPrivate = ref(false);

const preview = ref<ExternalLink>();
const loading = ref(false);
const attempted = ref(false);
const error = ref<string>();

let requestVersion = 0;
let suppressNextUrlRefresh = false;
let previewController: AbortController | undefined;

const initialLoading = computed(() => loading.value && !preview.value);

const refreshingPreview = computed(
  () => loading.value && Boolean(preview.value),
);

const duplicate = computed(() => {
  try {
    const normalized = normalizeExternalLinkUrl(draftUrl.value);

    return links.value.some(
      (link, index) => index !== editingIndex.value && link.url === normalized,
    );
  } catch {
    return false;
  }
});

const canSave = computed(
  () =>
    attempted.value &&
    !loading.value &&
    !error.value &&
    !duplicate.value &&
    Boolean(draftName.value.trim()) &&
    Boolean(preview.value),
);

function openAdd(event: MouseEvent) {
  resetDraft();

  popupAnchor.value = event.currentTarget as HTMLElement;
  popupOpen.value = true;
}

function openEdit(index: number, event: MouseEvent) {
  const link = links.value[index];
  if (!link) return;

  editingIndex.value = index;
  setDraftUrlSilently(link.url);

  draftName.value = link.name;
  draftPrivate.value = link.isPrivate;

  preview.value =
    link.faviconMedia && link.touchedAt
      ? {
          url: link.url,
          title: link.title,
          description: link.description,
          faviconMedia: link.faviconMedia,
          touchedAt: link.touchedAt,
        }
      : undefined;

  attempted.value = true;
  error.value = undefined;

  popupAnchor.value = event.currentTarget as HTMLElement;
  popupOpen.value = true;
}

function resetDraft() {
  previewController?.abort();
  previewController = undefined;

  editingIndex.value = null;
  setDraftUrlSilently('');

  draftName.value = '';
  suggestedName.value = '';
  draftPrivate.value = false;

  preview.value = undefined;
  loading.value = false;
  attempted.value = false;
  error.value = undefined;

  requestVersion += 1;
}

const loadPreview = debounce(async (version: number, rawUrl: string) => {
  let url: string;

  try {
    url = normalizeExternalLinkUrl(rawUrl);
  } catch (cause) {
    if (version === requestVersion) {
      attempted.value = true;
      loading.value = false;
      error.value =
        cause instanceof Error
          ? cause.message
          : phrase.value.external_link_error;
    }

    return;
  }

  try {
    previewController?.abort();

    const controller = new AbortController();
    previewController = controller;

    const result = await $fetch<ExternalLink>(
      '/api/admin/external-links/preview',
      {
        method: 'POST',
        body: { url },
        signal: controller.signal,
      },
    );

    if (version !== requestVersion) return;

    preview.value = result;
    setDraftUrlSilently(result.url);

    if (
      editingIndex.value === null &&
      result.title &&
      (!draftName.value.trim() || draftName.value === suggestedName.value)
    ) {
      draftName.value = result.title;
    }

    suggestedName.value = result.title ?? '';
    error.value = undefined;
  } catch (cause: any) {
    if (version !== requestVersion) return;
    if (cause?.name === 'AbortError') return;

    error.value =
      cause?.data?.statusMessage ?? phrase.value.external_link_error;
  } finally {
    if (version === requestVersion) {
      previewController = undefined;
      attempted.value = true;
      loading.value = false;
    }
  }
}, 350);

watch(draftUrl, (value, oldValue) => {
  if (suppressNextUrlRefresh) {
    suppressNextUrlRefresh = false;
    return;
  }

  if (value === oldValue) return;

  requestVersion += 1;

  previewController?.abort();
  previewController = undefined;

  attempted.value = false;
  error.value = undefined;

  if (!value.trim()) {
    preview.value = undefined;
    loading.value = false;
    return;
  }

  loading.value = true;
  void loadPreview(requestVersion, value);
});

function setDraftUrlSilently(value: string) {
  if (draftUrl.value === value) return;

  suppressNextUrlRefresh = true;
  draftUrl.value = value;
}

function refreshPreview() {
  const url = draftUrl.value.trim();
  if (!url) return;

  requestVersion += 1;

  previewController?.abort();
  previewController = undefined;

  attempted.value = false;
  error.value = undefined;
  loading.value = true;

  void loadPreview(requestVersion, url);
}

function save() {
  if (!canSave.value || !preview.value) return;

  const item: ProjectExternalLinkEditItem = {
    ...preview.value,
    name: draftName.value.trim(),
    isPrivate: draftPrivate.value,
  };

  const next = [...links.value];

  if (editingIndex.value === null) {
    next.push(item);
  } else {
    next.splice(editingIndex.value, 1, item);
  }

  links.value = next;
  popupOpen.value = false;
}

function remove() {
  if (editingIndex.value === null) return;

  links.value = links.value.filter((_, index) => index !== editingIndex.value);

  popupOpen.value = false;
}

const { guardClick } = useDragSort(linksRoot, {
  onDrop: ({ id, newIndex }) => {
    links.value = moveItemById(links.value, id, newIndex, (link) => link.url);
  },
});

function onPopupClosed() {
  if (!popupOpen.value) resetDraft();
}

onUnmounted(() => {
  requestVersion += 1;
  previewController?.abort();
});
</script>

<template>
  <div>
    <div class="mb-md flex items-center gap-md">
      <SectionHeader
        icon="external-link"
        :title="title"
        :description="description"
        class="flex-1"
      />

      <button
        ref="addButton"
        type="button"
        class="size-12 shrink-0 cursor-pointer rounded-normal bg-bg-3
          text-text-2 transition-colors hocus:bg-bg-accent hocus:text-accent"
        :aria-label="phrase.add_external_link"
        :data-title-popup="phrase.add_external_link"
        @click="openAdd"
      >
        <Icon name="plus" />
      </button>
    </div>

    <Box>
      <div
        ref="linksRoot"
        class="flex min-h-16 flex-wrap items-center gap-2 p-sm sm:p-md"
      >
        <div
          v-for="(link, index) in links"
          :key="link.url"
          :data-drag-id="link.url"
          class="rounded-sm transition-colors"
        >
          <ExternalLinkChip
            :link="link"
            interactive
            class="cursor-grab active:cursor-grabbing"
            :data-title-popup="link.url"
            @click="guardClick(() => openEdit(index, $event))"
          >
            <Icon
              v-if="link.isPrivate"
              name="lock-close"
              class="shrink-0 text-text-2"
            />
          </ExternalLinkChip>
        </div>

        <p v-if="!links.length" class="text-sm text-text-3 italic">
          {{ emptyText }}
        </p>
      </div>
    </Box>

    <FloatingPopup
      v-model:open="popupOpen"
      :anchor="popupAnchor"
      placement="bottom-end"
      max-width="20rem"
      @closed="onPopupClosed"
    >
      <form
        class="flex flex-col gap-sm rounded-normal border border-border-1
          bg-bg-2 p-sm"
        @submit.prevent="save"
      >
        <Field>
          <FieldLabel class="text-sm">
            {{ phrase.external_link_url }}
          </FieldLabel>

          <FieldInput
            v-model="draftUrl"
            type="url"
            required
            autocomplete="url"
            placeholder="https://example.com/"
            class="text-sm"
          />
        </Field>

        <div
          v-if="initialLoading"
          role="status"
          aria-live="polite"
          class="flex items-center justify-center gap-xs py-md text-center
            text-sm text-text-3"
        >
          <Icon name="loading" class="text-lg" />
          <span>{{ phrase.external_link_loading }}</span>
        </div>

        <template v-else>
          <p
            v-if="duplicate || error"
            role="status"
            class="text-sm text-text-error"
          >
            {{ duplicate ? phrase.external_link_duplicate : error }}
          </p>

          <ExternalLinkPreviewCard
            v-if="preview"
            :link="preview"
            :url="preview.url"
          />

          <p
            v-if="preview?.previewStatus === 'fallback'"
            role="status"
            class="text-xs text-text-3"
          >
            {{ phrase.external_link_fallback }}
          </p>
        </template>

        <Field v-if="preview">
          <FieldLabel class="text-sm">
            {{ phrase.external_link_name }}
          </FieldLabel>

          <FieldInput
            v-model="draftName"
            type="text"
            required
            maxlength="300"
            class="text-sm"
          />
        </Field>

        <FieldToggle v-if="preview" v-model="draftPrivate" class="text-sm">
          <div
            class="flex cursor-pointer items-center gap-xs text-text-2"
            @click="draftPrivate = !draftPrivate"
          >
            <Icon name="lock-close" />
            <span>{{ phrase.external_link_private }}</span>
          </div>
        </FieldToggle>

        <div class="flex gap-xs">
          <Button type="submit" class="flex-1" :disabled="!canSave">
            {{ editingIndex === null ? phrase.add_external_link : phrase.save }}
          </Button>

          <Button
            v-if="editingIndex !== null"
            type="button"
            variant="secondary"
            :disabled="loading || !draftUrl.trim()"
            :aria-label="phrase.refresh_external_link"
            :data-title-popup="phrase.refresh_external_link"
            @click="refreshPreview"
          >
            <Icon :name="refreshingPreview ? 'loading' : 'refresh'" />
          </Button>

          <Button
            v-if="editingIndex !== null"
            type="button"
            variant="delete"
            :aria-label="phrase.delete"
            @click="remove"
          >
            <Icon name="delete" />
          </Button>
        </div>
      </form>
    </FloatingPopup>
  </div>
</template>

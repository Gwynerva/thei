<script lang="ts" setup>
import ExternalLinkPreviewCard from './ExternalLinkPreviewCard.vue';
import {
  normalizeExternalLinkUrl,
  type ExternalLink,
  type ExternalLinkListItem,
} from '#layers/thei/shared/external-link';
import { moveItemById } from '#layers/thei/app/composables/drag-sort';
import {
  createExternalLinkDraft,
  useExternalLinks,
} from '#layers/thei/app/composables/external-links';

const props = defineProps<{
  title: string;
  description: string;
  emptyText: string;
}>();

const links = defineModel<ExternalLinkListItem[]>({
  required: true,
});

const addButton = useTemplateRef<HTMLElement>('addButton');
const linksRoot = useTemplateRef<HTMLElement>('linksRoot');

const externalLinks = useExternalLinks();
const draft = createExternalLinkDraft(externalLinks, {
  errorText: () => phrase.value.external_link_error,
});

const popupOpen = ref(false);
const popupAnchor = ref<HTMLElement | null>(null);
const editingIndex = ref<number | null>(null);

const draftName = ref('');
const suggestedName = ref('');
const draftPrivate = ref(false);

const initialLoading = computed(() => draft.loading && !draft.preview);
const refreshingPreview = computed(
  () => draft.loading && Boolean(draft.preview),
);

const duplicate = computed(() => {
  try {
    const normalized = normalizeExternalLinkUrl(draft.url);
    return links.value.some(
      (link, index) => index !== editingIndex.value && link.url === normalized,
    );
  } catch {
    return false;
  }
});

const canSave = computed(
  () =>
    !draft.loading &&
    !draft.error &&
    !duplicate.value &&
    Boolean(draftName.value.trim()) &&
    Boolean(draft.preview),
);

function openAdd(event: MouseEvent) {
  resetDraft();
  popupAnchor.value = event.currentTarget as HTMLElement;
  popupOpen.value = true;
}

function openEdit(index: number, event: MouseEvent) {
  const link = links.value[index];
  if (!link) return;
  resetDraft();
  editingIndex.value = index;
  draftName.value = link.name;
  draftPrivate.value = link.isPrivate;
  // An existing link shows its stored record; the site is not read.
  void draft.open(link.url);
  popupAnchor.value = event.currentTarget as HTMLElement;
  popupOpen.value = true;
}

function resetDraft() {
  editingIndex.value = null;
  draftName.value = '';
  suggestedName.value = '';
  draftPrivate.value = false;
  draft.reset();
}

/** The title is offered as the name until the person writes one of their own. */
function suggestName(link: ExternalLink) {
  if (
    editingIndex.value === null &&
    link.title &&
    (!draftName.value.trim() || draftName.value === suggestedName.value)
  )
    draftName.value = link.title;
  suggestedName.value = link.title ?? '';
}

/** The address is done: pasted, left, or confirmed with Enter. */
async function commitUrl() {
  const link = await draft.commit();
  if (link) suggestName(link);
}

function onUrlPaste() {
  void nextTick(commitUrl);
}

async function refreshPreview() {
  const link = await draft.refresh();
  if (link) suggestName(link);
}

function save() {
  if (!canSave.value || !draft.preview) return;
  const item: ExternalLinkListItem = {
    url: draft.preview.url,
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

onUnmounted(() => draft.reset());
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
            :favicon-media="externalLinks.get(link.url)?.faviconMedia"
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
            v-model="draft.url"
            type="url"
            required
            autocomplete="url"
            placeholder="https://example.com/"
            class="text-sm"
            @change="commitUrl"
            @paste="onUrlPaste"
            @submit="commitUrl"
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
            v-if="duplicate || draft.error"
            role="status"
            class="text-sm text-text-error"
          >
            {{ duplicate ? phrase.external_link_duplicate : draft.error }}
          </p>

          <ExternalLinkPreviewCard
            v-if="draft.preview"
            :link="draft.preview"
            :url="draft.preview.url"
            :interactive="true"
          />
        </template>

        <Field v-if="draft.preview">
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

        <FieldToggle
          v-if="draft.preview"
          v-model="draftPrivate"
          class="text-sm"
        >
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
            :disabled="draft.loading || !draft.url.trim()"
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

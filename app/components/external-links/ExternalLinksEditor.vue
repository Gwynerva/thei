<script
  lang="ts"
  setup
  generic="T extends ExternalLinkListItem | NamedExternalLinkListItem"
>
import ExternalLinkPreviewCard from './ExternalLinkPreviewCard.vue';
import {
  EXTERNAL_LINK_NAME_LIMIT,
  EXTERNAL_LINK_NOTE_LIMIT,
  externalLinkHostname,
  externalLinkIdentity,
  externalLinkListItem,
  namedExternalLinkListItem,
  normalizeExternalLinkUrl,
  type ExternalLink,
  type ExternalLinkListItem,
  type NamedExternalLinkListItem,
} from '#layers/thei/shared/external-link';
import { moveItemById } from '#layers/thei/app/composables/drag-sort';
import {
  createExternalLinkDraft,
  useExternalLinks,
  useExternalLinkTyping,
} from '#layers/thei/app/composables/external-links';

/**
 * A hand-made list of links. Each shows the page as it presents itself, and
 * the owner may say why it is there. A list shown as chips (`named`, the
 * profile's) also gives each link a short name of its own.
 */
const props = defineProps<{
  title: string;
  description: string;
  emptyText: string;
  named?: boolean;
  /**
   * The pages the entity's own text already links to
   * (`contentExternalLinkIdentities`), with what to say of a link here that
   * repeats one of them: the page would list it twice.
   */
  contentLinks?: { identities: ReadonlySet<string>; hint: string };
}>();

const links = defineModel<T[]>({
  required: true,
});

const linksRoot = useTemplateRef<HTMLElement>('linksRoot');

const externalLinks = useExternalLinks();
const draft = createExternalLinkDraft(externalLinks, {
  errorText: () => phrase.value.external_link_error,
});
const typing = useExternalLinkTyping((options) => draft.commit(options));

const popupOpen = ref(false);
const popupAnchor = ref<HTMLElement | null>(null);
const editingIndex = ref<number | null>(null);

const draftName = ref('');
const suggestedName = ref('');
const draftNote = ref('');
const draftPrivate = ref(false);

const initialLoading = computed(() => draft.loading && !draft.preview);
const refreshingPreview = computed(
  () => draft.loading && Boolean(draft.preview),
);

/** The page the address in the field opens, as links are told apart. */
const draftIdentity = computed(() => {
  try {
    return externalLinkIdentity(normalizeExternalLinkUrl(draft.url));
  } catch {
    return undefined;
  }
});

const duplicate = computed(
  () =>
    draftIdentity.value !== undefined &&
    links.value.some(
      (link, index) =>
        index !== editingIndex.value &&
        externalLinkIdentity(link.url) === draftIdentity.value,
    ),
);

/** What to say of a link that the entity's text already links to. */
function contentWarning(url: string) {
  return props.contentLinks?.identities.has(externalLinkIdentity(url))
    ? props.contentLinks.hint
    : undefined;
}
const draftWarning = computed(() =>
  draft.preview ? contentWarning(draft.preview.url) : undefined,
);

const canSave = computed(
  () =>
    !draft.loading &&
    !draft.error &&
    !duplicate.value &&
    (!props.named || Boolean(draftName.value.trim())) &&
    Boolean(draft.preview),
);

/** A chip shows the owner's name for the link, or the page's own title. */
function chipLabel(link: T) {
  if ('name' in link) return publicText(link.name);
  return externalLinks.get(link.url)?.title || externalLinkHostname(link.url);
}

function chipPopup(link: T) {
  return titlePopup(
    link.url,
    TITLE_POPUP_GAP,
    link.note && { text: publicText(link.note), italic: true },
  );
}

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
  if ('name' in link) draftName.value = link.name;
  draftNote.value = link.note;
  draftPrivate.value = link.isPrivate;
  // An existing link shows its stored record; the site is not read.
  void draft.open(link.url);
  popupAnchor.value = event.currentTarget as HTMLElement;
  popupOpen.value = true;
}

function resetDraft() {
  typing.cancel();
  editingIndex.value = null;
  draftName.value = '';
  suggestedName.value = '';
  draftNote.value = '';
  draftPrivate.value = false;
  draft.reset();
}

/**
 * The page's title is offered as a chip's name until the person writes one
 * of their own, whenever the address in the field turns out to have one:
 * read after a pause, when it is done, on a refresh, or known to the page
 * already.
 */
function suggestName(link: ExternalLink) {
  if (
    editingIndex.value === null &&
    link.title &&
    (!draftName.value.trim() || draftName.value === suggestedName.value)
  )
    draftName.value = link.title;
  suggestedName.value = link.title ?? '';
}
watch(
  () => draft.preview,
  (link) => {
    if (link && props.named) suggestName(link);
  },
);

/** The address is done: left, or confirmed with Enter. */
async function commitUrl() {
  typing.cancel();
  await draft.commit();
}

async function refreshPreview() {
  await draft.refresh();
}

function save() {
  if (!canSave.value || !draft.preview) return;
  const entry = {
    url: draft.preview.url,
    note: draftNote.value.trim(),
    isPrivate: draftPrivate.value,
  };
  const item = (
    props.named
      ? namedExternalLinkListItem({ ...entry, name: draftName.value.trim() })
      : externalLinkListItem(entry)
  ) as T;
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
    <SectionHeader
      icon="external-link"
      :title="title"
      :description="description"
      class="mb-md"
    >
      <template #action>
        <SectionAddButton
          :label="phrase.add_external_link"
          :expanded="popupOpen && editingIndex === null"
          @click="openAdd"
        />
      </template>
    </SectionHeader>

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
            :url="link.url"
            :label="chipLabel(link)"
            :favicon-media="externalLinks.get(link.url)?.faviconMedia"
            :warning="contentWarning(link.url)"
            interactive
            class="cursor-grab active:cursor-grabbing"
            v-bind="chipPopup(link)"
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
            spellcheck="false"
            placeholder="https://example.com/"
            class="text-sm"
            @input="typing.onInput"
            @change="commitUrl"
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
          <p
            v-else-if="draftWarning"
            role="status"
            class="flex items-start gap-xs text-sm text-text-warning"
          >
            <Icon name="warning" class="mt-0.5 shrink-0" />
            <span>{{ draftWarning }}</span>
          </p>

          <ExternalLinkPreviewCard
            v-if="draft.preview"
            :link="draft.preview"
            :url="draft.preview.url"
            :note="draftNote"
            :interactive="true"
          />
        </template>

        <Field v-if="draft.preview && named">
          <FieldLabel class="text-sm">
            {{ phrase.external_link_name }}
          </FieldLabel>

          <FieldInput
            v-model="draftName"
            type="text"
            required
            :maxlength="EXTERNAL_LINK_NAME_LIMIT"
            class="text-sm"
          />
        </Field>

        <Field v-if="draft.preview">
          <FieldLabel class="text-sm">
            {{ phrase.content_link_note }}
          </FieldLabel>

          <FieldInput
            v-model="draftNote"
            type="text"
            :maxlength="EXTERNAL_LINK_NOTE_LIMIT"
            :placeholder="phrase.content_link_note_placeholder"
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

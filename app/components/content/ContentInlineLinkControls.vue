<script lang="ts" setup>
import type {
  ContentEntityChoice,
  ContentEntitySearchItem,
} from '#layers/thei/shared/admin/content-entity-search';
import type { ContentEntityReference } from '#layers/thei/shared/content-link';
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
import {
  invalidateContentLinks,
  useContentLinkResolver,
} from '#layers/thei/app/composables/content-link-resolver';
import {
  entityLinkAttributes,
  externalLinkAttributes,
} from './editor-inline-link-dom';
import type {
  ContentInlineLinkControlsExpose,
  ContentInlineLinkRequest,
} from './editor-inline-links';

/**
 * The popup behind the two inline link tools.
 *
 * One panel, two modes. An internal link is picked from a search of the
 * site's own entities; an external one is typed as an address and read from
 * the site it points to. Both may carry a note that stands in for the title
 * in the chip, and neither is written until ✓: picking an entity only makes
 * it the choice, so a note can still be added before the link is.
 */
defineProps<{ teleportTo?: string | HTMLElement }>();

const open = ref(false);
const mode = ref<'entity' | 'external'>('entity');
const request = shallowRef<ContentInlineLinkRequest>();
const note = ref('');
/** The entity an internal link will point to once applied. */
const chosen = shallowRef<ContentEntityChoice>();
const resolver = useContentLinkResolver('admin');
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
const refreshing = ref(false);
const internalSite = useInternalUrlSite();
const entityPopup = useTemplateRef<{ focus: () => void }>('entityPopup');
const externalInput = ref<HTMLInputElement>();
const noteInput = ref<HTMLInputElement>();
let internalVersion = 0;
let chosenVersion = 0;

const externalUrl = computed({
  get: () => draft.url,
  set: (value: string) => {
    // Typing changes nothing but the text and whether it is a valid address;
    // the site is read once the address is done.
    internalEntity.value = undefined;
    internalEntityUrl.value = undefined;
    draft.url = value;
  },
});
const externalPreview = computed(() => draft.preview);
const externalError = computed(() => draft.error);
const externalLoading = computed(() => draft.loading || internalLoading.value);
const canRefresh = computed(
  () =>
    Boolean(externalPreview.value || externalError.value) &&
    !internalEntity.value,
);

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
  const raw = draft.url.trim();
  if (parseInternalUrl(raw, internalSite) && (await findInternal(raw))) return;
  await draft.commit();
}

function onUrlPaste() {
  void nextTick(commitUrl);
}

/** Reads the site again, and lets every chip on the page know it changed. */
async function refreshExternal() {
  if (refreshing.value || !draft.url.trim()) return;
  refreshing.value = true;
  try {
    await draft.refresh();
    invalidateContentLinks();
  } finally {
    refreshing.value = false;
  }
}

function openEntity(next: ContentInlineLinkRequest) {
  mode.value = 'entity';
  request.value = next;
  note.value = next.initialNote ?? '';
  chosen.value = undefined;
  if (next.initialEntity) void showChosen(next.initialEntity);
  open.value = true;
}

/**
 * The target of the link being edited, as the chips see it. A target that
 * is gone still shows, named as such, so the link can be pointed elsewhere.
 */
async function showChosen(reference: ContentEntityReference) {
  const version = ++chosenVersion;
  const resolved = await resolver(reference).catch(() => undefined);
  if (version !== chosenVersion) return;
  chosen.value =
    resolved?.state === 'resolved' && resolved.kind === 'entity'
      ? {
          entityType: resolved.entityType,
          entityId: resolved.entityId,
          title: resolved.title,
          summary: resolved.summary,
          date: resolved.date,
          parent: resolved.parent,
          previewMedia: resolved.media,
        }
      : {
          entityType: reference.entityType,
          entityId: reference.entityId,
          title: phrase.value.content_link_broken_title,
          summary: '',
        };
}

function openExternal(next: ContentInlineLinkRequest) {
  mode.value = 'external';
  request.value = next;
  note.value = next.initialNote ?? '';
  internalEntity.value = undefined;
  internalEntityUrl.value = undefined;
  draft.reset();
  draft.url = next.initialUrl ?? '';
  open.value = true;
  if (next.initialUrl) void openExisting(next.initialUrl);
}

/** An existing link shows what is known about it; the site is not read. */
async function openExisting(url: string) {
  const raw = url.trim();
  if (parseInternalUrl(raw, internalSite) && (await findInternal(raw))) return;
  await draft.open(raw);
}

/** A picked entity becomes the choice, and the note is next. */
function choose(entity: ContentEntitySearchItem) {
  chosenVersion++;
  chosen.value = entity;
  focusNote();
}

function focusNote() {
  void nextTick(() => noteInput.value?.focus({ preventScroll: true }));
}

/** An empty note is an absent attribute, never an empty one. */
function noteAttribute() {
  return note.value.trim() || undefined;
}

function applyEntity() {
  const entity = chosen.value;
  if (!entity) return;
  request.value?.apply(
    entity.title,
    entityLinkAttributes(
      { ...entity, url: (entity as Partial<ContentEntitySearchItem>).url },
      noteAttribute(),
    ),
  );
  open.value = false;
}

async function submitExternal() {
  const raw = draft.url.trim();
  if (parseInternalUrl(raw, internalSite)) {
    const entity =
      internalEntityUrl.value === raw
        ? internalEntity.value
        : await findInternal(raw);
    if (entity) {
      request.value?.apply(
        entity.title,
        entityLinkAttributes(entity, noteAttribute()),
      );
      open.value = false;
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
  request.value?.apply(
    preview?.title || externalLinkHostname(url),
    externalLinkAttributes(url, noteAttribute()),
  );
  open.value = false;
}

function removeLink() {
  request.value?.remove();
  open.value = false;
}

function focusPopup() {
  if (mode.value === 'entity') entityPopup.value?.focus();
  else externalInput.value?.focus({ preventScroll: true });
}

function popupClosed() {
  note.value = '';
  chosenVersion++;
  chosen.value = undefined;
  internalVersion++;
  internalEntity.value = undefined;
  internalEntityUrl.value = undefined;
  internalLoading.value = false;
  draft.reset();
  request.value?.restore();
  request.value = undefined;
}

defineExpose<ContentInlineLinkControlsExpose>({ openEntity, openExternal });
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
    @opened="focusPopup"
    @dismiss="request?.restore()"
    @closed="popupClosed"
  >
    <ContentEntitySearchPopup
      v-if="mode === 'entity'"
      ref="entityPopup"
      :chosen
      @select="choose"
      @confirm="focusNote"
    >
      <template #footer>
        <form class="flex flex-col gap-xs" @submit.prevent="applyEntity">
          <FieldInput
            v-model="note"
            type="text"
            autocomplete="off"
            spellcheck="true"
            class="h-9 py-1 text-sm"
            :aria-label="phrase.content_link_note"
            :placeholder="phrase.content_link_note_placeholder"
            @element="noteInput = $event"
          />
          <div class="flex justify-end gap-1">
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
              :disabled="!chosen"
              :aria-label="phrase.save"
            >
              <Icon name="check" />
            </Button>
          </div>
        </form>
      </template>
    </ContentEntitySearchPopup>
    <form
      v-else
      class="flex scrollbar-hover max-h-(--floating-popup-available-height)
        min-h-0 flex-col gap-xs overflow-y-auto rounded-normal border
        border-border-1 bg-bg-2 p-xs"
      @submit.prevent="submitExternal"
    >
      <FieldInput
        v-model="externalUrl"
        type="text"
        inputmode="url"
        autocomplete="url"
        spellcheck="false"
        class="h-9 py-1 text-sm"
        :placeholder="phrase.content_link_url"
        :error="externalError"
        @element="externalInput = $event"
        @change="commitUrl"
        @paste="onUrlPaste"
      />
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
        :url="draft.url"
        :loading="externalLoading"
        :loading-text="phrase.external_link_loading"
        :interactive="true"
      />
      <FieldInput
        v-model="note"
        type="text"
        autocomplete="off"
        spellcheck="true"
        class="h-9 py-1 text-sm"
        :aria-label="phrase.content_link_note"
        :placeholder="phrase.content_link_note_placeholder"
      />
      <div class="flex justify-end gap-1">
        <Button
          v-if="canRefresh"
          type="button"
          variant="secondary"
          size="icon"
          :disabled="externalLoading"
          :aria-label="phrase.refresh_external_link"
          :data-title-popup="phrase.refresh_external_link"
          @click="refreshExternal"
        >
          <Icon :name="refreshing ? 'loading' : 'refresh'" />
        </Button>
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
          :aria-label="phrase.content_external_link"
          :aria-busy="externalLoading"
        >
          <Icon :name="externalLoading ? 'loading' : 'check'" />
        </Button>
      </div>
    </form>
  </FloatingPopup>
</template>

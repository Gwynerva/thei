<script lang="ts" setup>
import { normalizeHeadingText } from '#layers/thei/shared/terminal-punctuation';
import { accessOptions } from '#layers/thei/app/components/field/access-options';
import {
  analyzeContentData,
  isContentEmpty,
} from '#layers/thei/shared/content';
import type { EventEditData } from '#layers/thei/shared/event';
import { eventTagContext } from '#layers/thei/shared/admin/event';
import type {
  EventGetResponse,
  EventSaveResponse,
} from '#layers/thei/shared/api/event';
import type { ProjectEditData } from '#layers/thei/shared/admin/project';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { DEFAULT_PROJECT_ACTION } from '#layers/thei/shared/project-action';
import type { FormNeed } from '#layers/thei/app/composables/form-needs';
import { eventDataInjectionKey } from '../composables';
import {
  projectDataInjectionKey,
  savedProjectDataInjectionKey,
  publicIdErrorKey,
  iconMediaKey,
  bannerMediaKey,
  iconSizeKey,
  bannerSizeKey,
  currentProjectUuidKey,
  otherItemsKey,
  pendingUploadsKey,
  showcaseItemsKey,
  provideProjectActionMedia,
} from '../../projects/composables';
import LinkField from '../../components/LinkField.vue';
import ProjectAssets from '../../projects/components/ProjectAssets.vue';
import ProjectExternalLinks from '../../projects/components/ProjectExternalLinks.vue';
import ProjectActionSettings from '../../projects/components/ProjectActionSettings.vue';
import { eventDeleteModal } from './event-delete-modal';
import { provideContentOwner } from '#layers/thei/app/composables/content-history/owner';
import { externalLinkListItems } from '#layers/thei/shared/external-link';
import { useExternalLinks } from '#layers/thei/app/composables/external-links';

const { eventUuid } = defineProps<{ eventUuid?: string }>();
const initialPublicId = useState(`new-event-public-id-${useId()}`, () =>
  randomId(14),
);
type EventFormData = EventEditData & {
  showcase: false;
  cv: false;
  descriptionContent: EventEditData['content'];
  showcaseAssets: [];
  sections: [];
};
const eventData = ref<EventFormData>(emptyData());
provide(eventDataInjectionKey, eventData as Ref<EventEditData>);
provide(projectDataInjectionKey, eventData as unknown as Ref<ProjectEditData>);
const savedAdapter = ref<ProjectEditData>(
  clone(eventData.value) as unknown as ProjectEditData,
);
provide(savedProjectDataInjectionKey, savedAdapter);

const publicIdError = ref<string>();
provide(publicIdErrorKey, publicIdError);
provide(iconMediaKey, ref<MediaDescriptor>());
const bannerMedia = ref<MediaDescriptor>();
provide(bannerMediaKey, bannerMedia);
/**
 * What stands for the event beside its relations, as on its cards: its
 * banner, else the first picture of its text.
 */
const ownerMedia = computed(
  () =>
    bannerMedia.value ??
    analyzeContentData(eventData.value.content?.data).preview.media,
);
provide(iconSizeKey, ref<number>());
const bannerSize = ref<number>();
provide(bannerSizeKey, bannerSize);
provide(currentProjectUuidKey, ref<string>());
provide(showcaseItemsKey, ref([]));
const otherItems = ref<EventGetResponse['otherAssets']>([]);
provide(otherItemsKey, otherItems);
const pendingUploads = ref(0);
provide(pendingUploadsKey, pendingUploads);
const actionMedia = provideProjectActionMedia();
const externalLinks = useExternalLinks();

const isEdit = computed(() => Boolean(eventUuid));
provideContentOwner('event', () => eventUuid);
const saving = ref(false);
const savedSnapshot = ref(JSON.stringify(eventPayload()));
// Begun from the quick search: the query is the title, as if typed.
if (!isEdit.value && titleFromQuery()) eventData.value.title = titleFromQuery();
/**
 * When the entity last changed, as the form read it. A save names it, and
 * one over a change made elsewhere since — another tab, an AI client — is
 * refused rather than written over it.
 */
const formVersion = ref<number>();
/** The event's uuid, once read: it may have been opened by its public id. */
const resolvedEventUuid = ref(eventUuid);
provideEntityAi({
  ref: () =>
    resolvedEventUuid.value ? `event:${resolvedEventUuid.value}` : undefined,
  form: () => eventData.value,
  version: () => formVersion.value,
});
const headerError = ref<string>();
const showPeriodsHint = ref(false);
const isDirty = computed(
  () => JSON.stringify(eventPayload()) !== savedSnapshot.value,
);
useLeaveGuard({
  dirty: () => isDirty.value,
  pendingUploads: () => pendingUploads.value,
});
/** What the event still needs before it can be saved, in the form's order. */
const needs = useFormNeeds(
  () => {
    const data = eventData.value;
    const list: FormNeed[] = [];
    if (!data.title.trim())
      list.push({ key: 'title', label: phrase.value.event_title });
    if (!data.access)
      list.push({ key: 'access', label: phrase.value.event_access });
    if (!data.summary.trim())
      list.push({ key: 'summary', label: phrase.value.event_summary });
    if (!data.periods.length)
      list.push({ key: 'periods', label: phrase.value.event_periods });
    if (isContentEmpty(data.content?.data))
      list.push({ key: 'content', label: phrase.value.event_content });
    if (!data.publicId.trim())
      list.push({ key: 'link-public-id', label: phrase.value.public_id });
    const action = actionNeed(
      phrase.value,
      data.action,
      phrase.value.event_action,
    );
    if (action) list.push(action);
    return list;
  },
  {
    ready: () => !saving.value && (!isEdit.value || isDirty.value),
    save,
    error: headerError,
  },
);

if (isEdit.value) {
  const data = await useRequestFetch()<EventGetResponse>(
    `/api/admin/events/${eventUuid}`,
  );
  eventData.value = {
    ...emptyData(),
    title: data.title,
    summary: data.summary,
    access: data.access,
    humanReadableSlug: data.humanReadableSlug,
    publicId: data.publicId,
    periods: data.periods,
    content: data.content,
    descriptionContent: data.content,
    bannerAssetUuid: data.bannerAssetUuid,
    otherAssets: data.otherAssets.map((item) => ({
      assetUuid: item.assetUuid,
      title: item.title,
      caption: item.caption,
      isPrivate: item.isPrivate,
    })),
    externalLinks: externalLinkListItems(data.externalLinks),
    tags: data.tags,
    relations: data.relations ?? [],
    action: data.action,
    reminder: data.reminder,
    synonyms: data.synonyms,
    notes: data.notes ?? null,
  };
  otherItems.value = data.otherAssets;
  bannerMedia.value = data.bannerMedia;
  bannerSize.value = data.bannerAssetSize;
  externalLinks.seed(data.externalLinks);
  actionMedia.applyLoaded(data);
  markSaved();
  formVersion.value = data.version;
  resolvedEventUuid.value = data.eventUuid;
  if (eventUuid !== data.eventUuid)
    await navigateTo(`/admin/events/${data.eventUuid}/edit/`, {
      replace: true,
    });
}

watch(
  () => eventData.value.content,
  (value) => {
    eventData.value.descriptionContent = value;
  },
);
watch(
  () => eventData.value.publicId,
  () => {
    publicIdError.value = undefined;
  },
);
watch(
  () => eventData.value.periods.length,
  (count, previousCount) => {
    if (count > 0) showPeriodsHint.value = false;
    else if (previousCount > 0) showPeriodsHint.value = true;
  },
);

/** The save itself; a press or Ctrl+S comes to it through `needs.submit`. */
async function save() {
  saving.value = true;
  headerError.value = undefined;
  try {
    const result = await $fetch<EventSaveResponse>(
      isEdit.value ? `/api/admin/events/${eventUuid}` : '/api/admin/events',
      {
        method: isEdit.value ? 'PUT' : 'POST',
        body: { ...eventPayload(), version: formVersion.value },
      },
    );
    if (result.type === 'error') {
      if (result.code === 'public-id-taken')
        publicIdError.value = result.message;
      else headerError.value = result.message;
      return;
    }
    formVersion.value = result.version;
    const previousAction = eventData.value.action;
    eventData.value.action = result.action;
    actionMedia.applySaved(previousAction, result.action);
    // The title as the server stored it, its ending settled.
    eventData.value.title = normalizeHeadingText(eventData.value.title.trim());
    stampSavedContent(eventData.value, savedSnapshot.value, CONTENT_FIELDS);
    markSaved();
    await refreshNuxtData('admin-bar');
    if (!isEdit.value)
      await navigateTo(sitePath(`/admin/events/${result.eventUuid}/edit/`), {
        external: true,
      });
  } finally {
    saving.value = false;
  }
}

await useAdminTabTitle(
  computed(() =>
    isEdit.value ? phrase.value.edit_event : phrase.value.new_event,
  ),
);

async function deleteEvent() {
  if (!eventUuid) return;
  const result = await openModal(eventDeleteModal, {
    eventUuid,
    eventTitle: eventData.value.title,
  });
  if (result.type !== 'deleted') return;
  markSaved();
  await refreshNuxtData('admin-bar');
  await navigateTo('/admin/events/');
}

function emptyData(): EventFormData {
  return {
    title: '',
    summary: '',
    access: '',
    humanReadableSlug: '',
    publicId: initialPublicId.value,
    periods: [],
    content: null,
    descriptionContent: null,
    otherAssets: [],
    externalLinks: [],
    tags: [],
    relations: [],
    action: { ...DEFAULT_PROJECT_ACTION },
    reminder: '',
    synonyms: [],
    notes: null,
    showcase: false,
    cv: false,
    showcaseAssets: [],
    sections: [],
  };
}

function eventPayload(): EventEditData {
  const value = eventData.value;
  return {
    title: value.title,
    summary: value.summary,
    access: value.access,
    humanReadableSlug: value.humanReadableSlug,
    publicId: value.publicId,
    periods: value.periods,
    content: value.content,
    bannerAssetUuid: value.bannerAssetUuid,
    otherAssets: value.otherAssets,
    externalLinks: value.externalLinks,
    tags: value.tags,
    relations: value.relations,
    action: value.action,
    reminder: value.reminder,
    synonyms: value.synonyms,
    notes: value.notes,
  };
}

/**
 * Saving inside the content editor saves the whole entity too, but only when
 * the content was the single thing that changed since the last save. Anything
 * else waiting to be saved stays the person's own decision, made with the
 * editor closed and the whole form in front of them.
 */
/** Every place this form keeps authored content, at any depth. */
const CONTENT_FIELDS = ['content', 'descriptionContent', 'notes'];

function saveAfterContentEdit() {
  if (saving.value || needs.blocked.value || !isEdit.value || !isDirty.value)
    return;
  if (!changedOnlyIn(eventPayload(), savedSnapshot.value, CONTENT_FIELDS))
    return;
  void save();
}

const tagsModel = computed({
  get: () => eventData.value.tags ?? [],
  set: (value) => {
    eventData.value.tags = value;
  },
});
const tagRecommendations = useTagRecommendations({
  owner: () => (eventUuid ? { type: 'event', id: eventUuid } : undefined),
  context: () => eventTagContext(eventData.value),
  tags: () => eventData.value.tags,
  relations: () => eventData.value.relations,
});
const relationsModel = computed({
  get: () => eventData.value.relations ?? [],
  set: (value) => {
    eventData.value.relations = value;
  },
});
const synonymsModel = computed({
  get: () => eventData.value.synonyms ?? [],
  set: (value: string[]) => {
    eventData.value.synonyms = value;
  },
});
const reminderModel = computed({
  get: () => eventData.value.reminder ?? '',
  set: (value: string) => {
    eventData.value.reminder = value;
  },
});
const notesModel = computed({
  get: () => eventData.value.notes ?? null,
  set: (value) => {
    eventData.value.notes = value;
  },
});

function markSaved() {
  savedSnapshot.value = JSON.stringify(eventPayload());
  savedAdapter.value = clone(eventData.value) as unknown as ProjectEditData;
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
</script>

<template>
  <AdminSaveHeader
    :title="isEdit ? phrase.edit_event : phrase.new_event"
    icon="event"
    :dirty="isDirty"
    :saving
    :creating="!isEdit"
    :deletable="isEdit"
    :needs
    @delete="deleteEvent"
    ><AiEntityButton
  /></AdminSaveHeader>

  <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <AiFormOffers />
    <Box class="flex flex-col gap-md p-sm sm:p-md">
      <div class="flex flex-wrap gap-md">
        <Field ai="field:title" need="title" class="min-w-50 flex-1">
          <FieldLabel required>{{ phrase.event_title }}</FieldLabel>
          <FieldInput
            v-model="eventData.title"
            type="text"
            autocomplete="off"
            spellcheck="true"
            required
          />
          <FieldHint>{{ phrase.event_title_hint }}</FieldHint>
        </Field>
        <Field ai="access" need="access" class="min-w-50">
          <FieldLabel required>{{ phrase.event_access }}</FieldLabel>
          <FieldOptions
            v-model="eventData.access"
            direction="row"
            :options="accessOptions(phrase)"
          />
        </Field>
      </div>
      <Field ai="field:summary" need="summary">
        <FieldLabel required>{{ phrase.event_summary }}</FieldLabel>
        <FieldTextarea v-model="eventData.summary" required />
        <FieldHint>{{ phrase.event_summary_hint }}</FieldHint>
      </Field>
      <Field ai="periods" need="periods">
        <FieldLabel required>{{ phrase.event_periods }}</FieldLabel>
        <FieldDateRanges v-model="eventData.periods" />
        <FieldHint>{{ phrase.event_periods_hint }}</FieldHint>
        <FieldHint v-if="showPeriodsHint">{{
          phrase.event_periods_empty
        }}</FieldHint>
      </Field>
      <Field need="content">
        <FieldLabel required>{{ phrase.event_content }}</FieldLabel>
        <FieldContentEditor
          v-model="eventData.content"
          content-slot="event-body"
          @saved="saveAfterContentEdit()"
          :title-label="phrase.event_content"
        />
        <FieldHint>{{ phrase.event_content_hint }}</FieldHint>
      </Field>
      <LinkField
        need="link"
        v-model:title="eventData.title"
        v-model:human-readable-slug="eventData.humanReadableSlug"
        v-model:public-id="eventData.publicId"
        :entity-name="phrase.event"
        :link-description="phrase.event_link_example"
        :public-id-error="publicIdError"
      />
    </Box>

    <ProjectActionSettings
      :section-title="phrase.event_action"
      :section-description="phrase.event_action_hint"
    />
    <ProjectAssets kind="event" />
    <ProjectExternalLinks
      :title="phrase.event_external_links"
      :description="phrase.event_external_links_hint"
      :empty-text="phrase.event_external_links_empty"
      :content-hint="phrase.external_link_in_event_content"
    />
    <AdminTags
      v-model="tagsModel"
      :title="phrase.event_tags"
      :description="phrase.event_tags_hint"
      :recommendations="tagRecommendations.recommendations.value"
      :recommendations-failed="tagRecommendations.failed.value"
    />
    <AdminRelations
      v-model="relationsModel"
      :owner="eventUuid ? { type: 'event', id: eventUuid } : undefined"
      owner-type="event"
      :owner-title="eventData.title.trim() || phrase.new_event"
      :owner-media
      :text="eventData.content?.data"
    />
    <AdminShareLinks
      v-if="eventUuid"
      entity-type="event"
      :entity-uuid="eventUuid"
    />
    <AiMemoryBlock />
    <AdminNotesBlock
      v-model:reminder="reminderModel"
      v-model:notes="notesModel"
      @notes-saved="saveAfterContentEdit()"
    />
    <!-- The other names: the least needed setting, so the last one. -->
    <Box class="p-sm sm:p-md">
      <FieldSynonyms
        v-model="synonymsModel"
        ai="field:synonyms"
        :title="eventData.title"
      />
    </Box>
  </div>
</template>

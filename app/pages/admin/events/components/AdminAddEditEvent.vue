<script lang="ts" setup>
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { isContentEmpty } from '#layers/thei/shared/content';
import type { EventEditData } from '#layers/thei/shared/event';
import type {
  EventGetResponse,
  EventSaveResponse,
} from '#layers/thei/shared/api/event';
import type { ProjectEditData } from '#layers/thei/shared/admin/project';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import {
  DEFAULT_PROJECT_ACTION,
  projectActionValidationError,
} from '#layers/thei/shared/project-action';
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
  showcaseItemsKey,
  actionIconMediaKey,
  actionIconSizeKey,
  actionBackgroundMediaKey,
  actionBackgroundSizeKey,
  actionFileUrlKey,
  actionFileMediaKey,
  actionFileExtensionKey,
  actionFileSizeKey,
  actionFaviconMediaKey,
} from '../../projects/composables';
import LinkField from '../../components/LinkField.vue';
import ProjectAssets from '../../projects/components/ProjectAssets.vue';
import ProjectExternalLinks from '../../projects/components/ProjectExternalLinks.vue';
import ProjectTags from '../../projects/components/ProjectTags.vue';
import ProjectActionSettings from '../../projects/components/ProjectActionSettings.vue';
import EventRelations from './EventRelations.vue';
import { eventDeleteModal } from './event-delete-modal';

const { eventUuid } = defineProps<{ eventUuid?: string }>();
const initialPublicId = useState(`new-event-public-id-${useId()}`, () =>
  randomId(14),
);
type EventFormData = EventEditData & {
  showcase: false;
  cv: false;
  descriptionContent: EventEditData['content'];
  showcaseAssets: [];
  contentSections: [];
  stages: [];
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
provide(bannerMediaKey, ref<MediaDescriptor>());
provide(iconSizeKey, ref<number>());
provide(bannerSizeKey, ref<number>());
provide(currentProjectUuidKey, ref<string>());
provide(showcaseItemsKey, ref([]));
const otherItems = ref<EventGetResponse['otherAssets']>([]);
provide(otherItemsKey, otherItems);
const actionIconMedia = ref<MediaDescriptor>();
const actionIconSize = ref<number>();
const actionBackgroundMedia = ref<MediaDescriptor>();
const actionBackgroundSize = ref<number>();
const actionFileUrl = ref<string>();
const actionFileMedia = ref<MediaDescriptor>();
const actionFileExtension = ref<string>();
const actionFileSize = ref<number>();
const actionFaviconMedia = ref<MediaDescriptor>();
provide(actionIconMediaKey, actionIconMedia);
provide(actionIconSizeKey, actionIconSize);
provide(actionBackgroundMediaKey, actionBackgroundMedia);
provide(actionBackgroundSizeKey, actionBackgroundSize);
provide(actionFileUrlKey, actionFileUrl);
provide(actionFileMediaKey, actionFileMedia);
provide(actionFileExtensionKey, actionFileExtension);
provide(actionFileSizeKey, actionFileSize);
provide(actionFaviconMediaKey, actionFaviconMedia);

const isEdit = computed(() => Boolean(eventUuid));
const saving = ref(false);
const savedSnapshot = ref(JSON.stringify(eventPayload()));
const headerError = ref<string>();
const showPeriodsHint = ref(false);
const isDirty = computed(
  () => JSON.stringify(eventPayload()) !== savedSnapshot.value,
);
const isValid = computed(() =>
  Boolean(
    eventData.value.title.trim() &&
    eventData.value.summary.trim() &&
    eventData.value.publicId.trim() &&
    eventData.value.access &&
    eventData.value.periods.length &&
    !isContentEmpty(eventData.value.content?.data) &&
    !projectActionValidationError(eventData.value.action),
  ),
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
    otherAssets: data.otherAssets.map((item) => ({
      assetUuid: item.assetUuid,
      title: item.title,
      caption: item.caption,
      isPrivate: item.isPrivate,
    })),
    externalLinks: data.externalLinks,
    relations: data.relations,
    tags: data.tags,
    action: data.action,
  };
  otherItems.value = data.otherAssets;
  actionIconMedia.value = data.actionIconMedia;
  actionIconSize.value = data.actionIconAssetSize;
  actionBackgroundMedia.value = data.actionBackgroundMedia;
  actionBackgroundSize.value = data.actionBackgroundAssetSize;
  actionFileUrl.value = data.actionFileUrl;
  actionFileMedia.value = data.actionFileMedia;
  actionFileExtension.value = data.actionFileExtension;
  actionFileSize.value = data.actionFileSize;
  actionFaviconMedia.value = data.actionFaviconMedia;
  markSaved();
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

async function save() {
  if (saving.value || !isValid.value) return;
  saving.value = true;
  headerError.value = undefined;
  try {
    const result = await $fetch<EventSaveResponse>(
      isEdit.value ? `/api/admin/events/${eventUuid}` : '/api/admin/events',
      { method: isEdit.value ? 'PUT' : 'POST', body: eventPayload() },
    );
    if (result.type === 'error') {
      if (result.code === 'public-id-taken')
        publicIdError.value = result.message;
      else headerError.value = result.message;
      return;
    }
    eventData.value.action = result.action;
    markSaved();
    await refreshNuxtData('admin-bar');
    if (!isEdit.value)
      await navigateTo(`/admin/events/${result.eventUuid}/edit/`, {
        external: true,
      });
  } finally {
    saving.value = false;
  }
}

useSaveShortcut(save, {
  canSave: () =>
    !saving.value && isValid.value && (!isEdit.value || isDirty.value),
});
await useAdminTabTitle(
  computed(() =>
    isEdit.value ? phrase.value.edit_event : phrase.value.new_event,
  ),
);
onBeforeRouteLeave(() => {
  if (interceptModalNavigation()) return false;
  if (isDirty.value)
    return window.confirm(phrase.value.unsaved_changes_confirm);
});

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
    relations: [],
    tags: [],
    action: { ...DEFAULT_PROJECT_ACTION },
    showcase: false,
    cv: false,
    showcaseAssets: [],
    contentSections: [],
    stages: [],
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
    otherAssets: value.otherAssets,
    externalLinks: value.externalLinks,
    relations: value.relations,
    tags: value.tags,
    action: value.action,
  };
}

function markSaved() {
  savedSnapshot.value = JSON.stringify(eventPayload());
  savedAdapter.value = clone(eventData.value) as unknown as ProjectEditData;
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
</script>

<template>
  <StickyGlassHeader width="var(--width-wide)" :error="headerError">
    <div class="flex items-center justify-between gap-xs py-xs">
      <div class="flex min-w-0 items-center gap-xs text-xl font-bold">
        <Icon name="event" />
        <span class="truncate">{{
          isEdit ? phrase.edit_event : phrase.new_event
        }}</span>
      </div>
      <div class="flex items-center gap-xs">
        <Button
          v-if="isEdit"
          variant="delete"
          :data-title-popup="phrase.delete"
          @click="deleteEvent"
        >
          <Icon name="delete" />
        </Button>
        <Button
          class="font-semibold"
          :disabled="saving || !isValid || (isEdit && !isDirty)"
          @click="save"
        >
          <Icon v-if="saving" name="loading" class="mr-xs" />
          {{ isEdit ? (isDirty ? phrase.save : phrase.saved) : phrase.create }}
        </Button>
      </div>
    </div>
  </StickyGlassHeader>

  <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <Box class="flex flex-col gap-md p-sm sm:p-md">
      <div class="flex flex-wrap gap-md">
        <Field class="min-w-50 flex-1">
          <FieldLabel required>{{ phrase.event_title }}</FieldLabel>
          <FieldInput
            v-model="eventData.title"
            type="text"
            autocomplete="off"
            spellcheck="false"
            required
          />
          <FieldHint>{{ phrase.event_title_hint }}</FieldHint>
        </Field>
        <Field class="min-w-50">
          <FieldLabel required>{{ phrase.event_access }}</FieldLabel>
          <FieldOptions
            v-model="eventData.access"
            direction="row"
            :options="{
              [ProjectEventAccessLevel.Public]: {
                icon: 'lock-open',
                title: phrase.public,
              },
              [ProjectEventAccessLevel.LinkOnly]: {
                icon: 'lock-partial',
                title: phrase.link_only,
              },
              [ProjectEventAccessLevel.Private]: {
                icon: 'lock-close',
                title: phrase.private,
              },
            }"
          />
        </Field>
      </div>
      <Field>
        <FieldLabel required>{{ phrase.event_summary }}</FieldLabel>
        <FieldTextarea v-model="eventData.summary" required />
        <FieldHint>{{ phrase.event_summary_hint }}</FieldHint>
      </Field>
      <Field>
        <FieldLabel required>{{ phrase.event_periods }}</FieldLabel>
        <FieldDateRanges v-model="eventData.periods" />
        <FieldHint>{{ phrase.event_periods_hint }}</FieldHint>
        <FieldHint v-if="showPeriodsHint">{{
          phrase.event_periods_empty
        }}</FieldHint>
      </Field>
      <Field>
        <FieldLabel required>{{ phrase.event_content }}</FieldLabel>
        <FieldContentEditor
          v-model="eventData.content"
          :title-label="phrase.event_content"
        />
        <FieldHint>{{ phrase.event_content_hint }}</FieldHint>
      </Field>
      <LinkField
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
    <ProjectAssets files-only />
    <ProjectExternalLinks
      :title="phrase.event_external_links"
      :description="phrase.event_external_links_hint"
      :empty-text="phrase.event_external_links_empty"
    />
    <EventRelations v-model="eventData.relations" />
    <ProjectTags
      :title="phrase.event_tags"
      :description="phrase.event_tags_hint"
    />
  </div>
</template>

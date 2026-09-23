<script lang="ts" setup>
import type { ProjectEditData } from '#layers/thei/shared/admin/project';
import type {
  OtherAssetGetItem,
  ProjectContentItemIdentity,
  ProjectGetResponse,
  ProjectSaveResponse,
  ShowcaseAssetGetItem,
} from '#layers/thei/shared/api/project';
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
  saveAfterContentEditKey,
  provideProjectActionMedia,
} from '../composables';
import ProjectMain from './ProjectMain.vue';
import ProjectAssets from './ProjectAssets.vue';
import ProjectRelations from './ProjectRelations.vue';
import ProjectExternalLinks from './ProjectExternalLinks.vue';
import { projectDeleteModal } from './project-delete-modal';
import ProjectContentItems from './ProjectContentItems.vue';
import ProjectTags from './ProjectTags.vue';
import ProjectShareLinks from './ProjectShareLinks.vue';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import {
  DEFAULT_PROJECT_ACTION,
  projectActionValidationError,
} from '#layers/thei/shared/project-action';
import {
  addStatusUsageDelta,
  emptyStatusEditData,
} from '#layers/thei/shared/status';
import type { ProfileHistoryPage } from '#layers/thei/shared/profile';
import type { StatusHistoryItem } from '#layers/thei/shared/status';
import StatusHistoryField from '#layers/thei/app/components/settings/StatusHistoryField.vue';
import ProjectActionSettings from './ProjectActionSettings.vue';

const { projectUuid } = defineProps<{ projectUuid?: string }>();
const route = useRoute();

const formId = useId();
const initialPublicId = useState(`new-project-public-id-${formId}`, () =>
  randomId(14),
);

const projectData = ref<ProjectEditData>({
  title: '',
  summary: '',
  humanReadableSlug: '',
  publicId: initialPublicId.value,
  access: '',
  showcase: false,
  cv: false,
  descriptionContent: null,
  contentSections: [],
  stages: [],
  relations: [],
  externalLinks: [],
  tags: [],
  action: { ...DEFAULT_PROJECT_ACTION },
  reminder: '',
  notes: null,
  ...emptyStatusEditData(),
});
provide(projectDataInjectionKey, projectData);
const savedProjectData = ref<ProjectEditData>(
  cloneProjectData(projectData.value),
);
provide(savedProjectDataInjectionKey, savedProjectData);

const publicIdError = ref<string | undefined>();
provide(publicIdErrorKey, publicIdError);

const iconMedia = ref<MediaDescriptor | undefined>();
provide(iconMediaKey, iconMedia);

const bannerMedia = ref<MediaDescriptor | undefined>();
provide(bannerMediaKey, bannerMedia);

const iconSize = ref<number | undefined>();
provide(iconSizeKey, iconSize);

const bannerSize = ref<number | undefined>();
provide(bannerSizeKey, bannerSize);

const actionMedia = provideProjectActionMedia();

const resolvedProjectUuid = ref<string | undefined>(projectUuid);
provide(currentProjectUuidKey, resolvedProjectUuid);

const showcaseItems = ref<ShowcaseAssetGetItem[]>([]);
provide(showcaseItemsKey, showcaseItems);

const otherItems = ref<OtherAssetGetItem[]>([]);
provide(otherItemsKey, otherItems);

const loadedStatuses = ref<ProfileHistoryPage<StatusHistoryItem>>();
const statusField =
  useTemplateRef<InstanceType<typeof StatusHistoryField>>('statusField');
const savedStatuses = computed<StatusHistoryItem[]>(
  () => statusField.value?.items ?? [],
);
/**
 * Pending status icon changes, so the file picker can count a project's real
 * usage of an asset while the form is still unsaved.
 */
const statusUsageDelta = computed(() =>
  addStatusUsageDelta({}, projectData.value, savedStatuses.value),
);

const isEdit = computed(() => Boolean(projectUuid));
const saving = ref(false);
const savedSnapshot = ref(JSON.stringify(projectData.value));
const headerError = ref<string | undefined>();
const actionError = computed(() =>
  projectActionValidationError(projectData.value.action),
);

const isDirty = computed(
  () => JSON.stringify(projectData.value) !== savedSnapshot.value,
);

const isFormValid = computed(
  () =>
    projectData.value.title.trim() !== '' &&
    projectData.value.summary.trim() !== '' &&
    projectData.value.publicId.trim() !== '' &&
    !!projectData.value.access &&
    !actionError.value,
);

const canSave = computed(() => isDirty.value && isFormValid.value);
const canUseSaveShortcut = computed(
  () => !saving.value && (isEdit.value ? canSave.value : isFormValid.value),
);

const requestFetch = useRequestFetch();

watch(
  () => projectData.value.publicId,
  () => {
    publicIdError.value = undefined;
  },
);

if (isEdit.value) {
  const data = await requestFetch<ProjectGetResponse>(
    `/api/admin/projects/${projectUuid}`,
  );
  projectData.value = {
    title: data.title,
    summary: data.summary,
    humanReadableSlug: data.humanReadableSlug,
    publicId: data.publicId,
    access: data.access,
    showcase: data.showcase,
    cv: data.cv,
    descriptionContent: data.descriptionContent ?? null,
    contentSections: data.contentSections ?? [],
    stages: data.stages ?? [],
    iconAssetUuid: data.iconAssetUuid,
    bannerAssetUuid: data.bannerAssetUuid,
    showcaseAssets: (data.showcaseAssets ?? []).map((item) => ({
      assetUuid: item.assetUuid,
      caption: item.caption,
      isPrivate: item.isPrivate,
    })),
    otherAssets: (data.otherAssets ?? []).map((item) => ({
      assetUuid: item.assetUuid,
      title: item.title,
      caption: item.caption,
      isPrivate: item.isPrivate,
    })),
    relations: data.relations ?? [],
    externalLinks: data.externalLinks ?? [],
    tags: data.tags ?? [],
    action: data.action ?? { ...DEFAULT_PROJECT_ACTION },
    reminder: data.reminder,
    notes: data.notes ?? null,
    ...emptyStatusEditData(),
  };
  loadedStatuses.value = data.statuses;
  showcaseItems.value = data.showcaseAssets ?? [];
  otherItems.value = data.otherAssets ?? [];
  iconMedia.value = data.iconMedia;
  iconSize.value = data.iconAssetSize;
  bannerMedia.value = data.bannerMedia;
  bannerSize.value = data.bannerAssetSize;
  actionMedia.applyLoaded(data);
  markProjectSaved();
  resolvedProjectUuid.value = data.projectUuid;
  if (projectUuid !== data.projectUuid) {
    // The query may ask for a stage or a section to be opened; it has to
    // survive the move to the UUID address.
    await navigateTo(
      {
        path: `/admin/projects/${data.projectUuid}/edit/`,
        query: route.query,
      },
      { replace: true },
    );
  }
}

async function handleSave() {
  if (saving.value) return;
  saving.value = true;
  headerError.value = undefined;
  try {
    if (isEdit.value) {
      const result = await $fetch<ProjectSaveResponse>(
        `/api/admin/projects/${projectUuid}`,
        { method: 'PUT', body: projectData.value },
      );
      if (result.type === 'error') {
        if (result.code === 'public-id-taken') {
          publicIdError.value = result.message;
          return;
        }
        headerError.value = result.message;
        return;
      }
      applySavedContentItemIds(result);
      applySavedAction(result.action);
      applySavedStatuses(result.statuses);
      stampSavedContent(projectData.value, savedSnapshot.value, CONTENT_FIELDS);
      markProjectSaved();
    } else {
      const result = await $fetch<ProjectSaveResponse>('/api/admin/projects', {
        method: 'POST',
        body: projectData.value,
      });
      if (result.type === 'error') {
        if (result.code === 'public-id-taken') {
          publicIdError.value = result.message;
          return;
        }
        headerError.value = result.message;
        return;
      }
      applySavedContentItemIds(result);
      applySavedAction(result.action);
      markProjectSaved();
      await refreshNuxtData('admin-bar');
      await navigateTo(`/admin/projects/${result.projectUuid}/edit/`, {
        external: true,
      });
    }
  } finally {
    saving.value = false;
  }
}

useSaveShortcut(handleSave, { canSave: canUseSaveShortcut });

await useAdminTabTitle(
  computed(() =>
    isEdit.value ? phrase.value.edit_project : phrase.value.new_project,
  ),
);

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);
});
onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
});
function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (isDirty.value) e.preventDefault();
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
  if (saving.value || !canSave.value || !isEdit.value) return;
  if (!changedOnlyIn(projectData.value, savedSnapshot.value, CONTENT_FIELDS))
    return;
  void handleSave();
}
provide(saveAfterContentEditKey, saveAfterContentEdit);

const relationsModel = computed({
  get: () => projectData.value.relations ?? [],
  set: (value) => {
    projectData.value.relations = value;
  },
});
const reminderModel = computed({
  get: () => projectData.value.reminder ?? '',
  set: (value: string) => {
    projectData.value.reminder = value;
  },
});
const notesModel = computed({
  get: () => projectData.value.notes ?? null,
  set: (value) => {
    projectData.value.notes = value;
  },
});

function markProjectSaved() {
  savedSnapshot.value = JSON.stringify(projectData.value);
  savedProjectData.value = cloneProjectData(projectData.value);
}

/**
 * Folds the three status edit lists back into the history the save returned.
 *
 * Without this a saved status stays in `newStatuses`, and the next save would
 * offer it again — which the storage layer only tolerates because a resent new
 * status has to match the stored one byte for byte.
 */
function applySavedStatuses(page: ProfileHistoryPage<StatusHistoryItem>) {
  projectData.value.newStatuses = [];
  projectData.value.updatedStatuses = [];
  projectData.value.deletedStatusIds = [];
  statusField.value?.reset(page);
}

/**
 * Takes the identities the server assigned to stages and sections.
 *
 * Until this runs, a stage created in this session has no uuid on the client,
 * and the next save would offer its public ID as if nobody owned it yet — which
 * the storage layer reads as a collision with the row it wrote itself.
 */
function applySavedContentItemIds(result: {
  stages: ProjectContentItemIdentity[];
  sections: ProjectContentItemIdentity[];
}) {
  const stageUuids = new Map(
    result.stages.map(({ publicId, itemUuid }) => [publicId, itemUuid]),
  );
  for (const stage of projectData.value.stages ?? [])
    stage.stageUuid = stageUuids.get(stage.publicId) ?? stage.stageUuid;

  const sectionUuids = new Map(
    result.sections.map(({ publicId, itemUuid }) => [publicId, itemUuid]),
  );
  for (const section of projectData.value.contentSections ?? [])
    section.sectionUuid =
      sectionUuids.get(section.publicId) ?? section.sectionUuid;
}

function applySavedAction(action: ProjectEditData['action']) {
  const previous = projectData.value.action;
  projectData.value.action = action ?? { ...DEFAULT_PROJECT_ACTION };
  actionMedia.applySaved(previous, action);
}

function cloneProjectData(data: ProjectEditData): ProjectEditData {
  return JSON.parse(JSON.stringify(data)) as ProjectEditData;
}
onBeforeRouteLeave(() => {
  if (interceptModalNavigation()) return false;
  if (isDirty.value) {
    return window.confirm(phrase.value.unsaved_changes_confirm);
  }
});

async function openDeleteProjectModal() {
  if (!resolvedProjectUuid.value) return;

  const result = await openModal(projectDeleteModal, {
    projectUuid: resolvedProjectUuid.value,
    projectTitle: projectData.value.title,
  });

  if (result.type !== 'deleted') return;
  markProjectSaved();
  await refreshNuxtData('admin-bar');
  await navigateTo('/admin/projects/');
}
</script>

<template>
  <StickyGlassHeader width="var(--width-wide)" :error="headerError">
    <div class="flex items-center justify-between gap-xs py-xs">
      <div class="flex min-w-0 items-center gap-xs text-xl font-bold">
        <Icon name="project" class="shrink-0" />
        <span class="truncate">
          {{ isEdit ? phrase.edit_project : phrase.new_project }}
        </span>
      </div>

      <div class="flex items-center gap-xs">
        <Button
          v-if="isEdit"
          variant="delete"
          :data-title-popup="phrase.delete"
          @click="openDeleteProjectModal"
        >
          <Icon name="delete" class="scale-120" />
        </Button>
        <Button
          class="font-semibold"
          :disabled="saving || (isEdit ? !canSave : !isFormValid)"
          @click="handleSave"
        >
          <Icon v-if="saving" name="loading" class="mr-xs" />
          <span>
            {{
              isEdit ? (isDirty ? phrase.save : phrase.saved) : phrase.create
            }}
          </span>
        </Button>
      </div>
    </div>
  </StickyGlassHeader>
  <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <ProjectMain />
    <ProjectActionSettings />
    <ProjectAssets />
    <ProjectExternalLinks />
    <StatusHistoryField
      v-if="
        resolvedProjectUuid &&
        projectData.newStatuses &&
        projectData.updatedStatuses &&
        projectData.deletedStatusIds
      "
      ref="statusField"
      v-model:new-statuses="projectData.newStatuses"
      v-model:updated-statuses="projectData.updatedStatuses"
      v-model:deleted-status-ids="projectData.deletedStatusIds"
      :history-url="`/api/admin/projects/${resolvedProjectUuid}/statuses`"
      :initial="loadedStatuses"
      :usage-delta="statusUsageDelta"
      :title="phrase.project_statuses"
      :description="phrase.project_status_hint"
      :add-label="phrase.project_new_status"
      :empty-label="phrase.project_status_empty"
    />
    <ProjectContentItems kind="stage" />
    <ProjectContentItems kind="section" />
    <ProjectRelations
      v-model="relationsModel"
      :project-uuid="resolvedProjectUuid"
      :owner-title="projectData.title.trim() || phrase.new_project"
    />
    <ProjectTags />
    <ProjectShareLinks
      v-if="resolvedProjectUuid"
      entity-type="project"
      :entity-uuid="resolvedProjectUuid"
    />
    <AdminNotesBlock
      v-model:reminder="reminderModel"
      v-model:notes="notesModel"
      @notes-saved="saveAfterContentEdit()"
    />
  </div>
</template>

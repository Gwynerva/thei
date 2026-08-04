<script lang="ts" setup>
import type { ProjectEditData } from '#layers/thei/shared/admin/project';
import type {
  OtherAssetGetItem,
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
  actionIconMediaKey,
  actionIconSizeKey,
  actionBackgroundMediaKey,
  actionBackgroundSizeKey,
  actionFileUrlKey,
  actionFileMediaKey,
  actionFileExtensionKey,
  actionFileSizeKey,
  actionFaviconMediaKey,
} from '../composables';
import ProjectMain from './ProjectMain.vue';
import ProjectAssets from './ProjectAssets.vue';
import ProjectRelations from './ProjectRelations.vue';
import ProjectExternalLinks from './ProjectExternalLinks.vue';
import { projectDeleteModal } from './project-delete-modal';
import ProjectStructuredItems from './ProjectStructuredItems.vue';
import ProjectTags from './ProjectTags.vue';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import {
  DEFAULT_PROJECT_ACTION,
  projectActionValidationError,
} from '#layers/thei/shared/project-action';
import ProjectActionSettings from './ProjectActionSettings.vue';

const { projectUuid } = defineProps<{ projectUuid?: string }>();

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

const actionIconMedia = ref<MediaDescriptor>();
provide(actionIconMediaKey, actionIconMedia);
const actionIconSize = ref<number>();
provide(actionIconSizeKey, actionIconSize);
const actionBackgroundMedia = ref<MediaDescriptor>();
provide(actionBackgroundMediaKey, actionBackgroundMedia);
const actionBackgroundSize = ref<number>();
provide(actionBackgroundSizeKey, actionBackgroundSize);
const actionFileUrl = ref<string>();
provide(actionFileUrlKey, actionFileUrl);
const actionFileMedia = ref<MediaDescriptor>();
provide(actionFileMediaKey, actionFileMedia);
const actionFileExtension = ref<string>();
provide(actionFileExtensionKey, actionFileExtension);
const actionFileSize = ref<number>();
provide(actionFileSizeKey, actionFileSize);
const actionFaviconMedia = ref<MediaDescriptor>();
provide(actionFaviconMediaKey, actionFaviconMedia);

const resolvedProjectUuid = ref<string | undefined>(projectUuid);
provide(currentProjectUuidKey, resolvedProjectUuid);

const showcaseItems = ref<ShowcaseAssetGetItem[]>([]);
provide(showcaseItemsKey, showcaseItems);

const otherItems = ref<OtherAssetGetItem[]>([]);
provide(otherItemsKey, otherItems);

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

const requestFetch = useRequestFetch();

watch(
  () => projectData.value.publicId,
  () => {
    publicIdError.value = undefined;
  },
);

if (isEdit.value) {
  const data = await requestFetch<ProjectGetResponse>(
    `/api/admin/projects/${projectUuid}/`,
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
  };
  showcaseItems.value = data.showcaseAssets ?? [];
  otherItems.value = data.otherAssets ?? [];
  iconMedia.value = data.iconMedia;
  iconSize.value = data.iconAssetSize;
  bannerMedia.value = data.bannerMedia;
  bannerSize.value = data.bannerAssetSize;
  actionIconMedia.value = data.actionIconMedia;
  actionIconSize.value = data.actionIconAssetSize;
  actionBackgroundMedia.value = data.actionBackgroundMedia;
  actionBackgroundSize.value = data.actionBackgroundAssetSize;
  actionFileUrl.value = data.actionFileUrl;
  actionFileMedia.value = data.actionFileMedia;
  actionFileExtension.value = data.actionFileExtension;
  actionFileSize.value = data.actionFileSize;
  actionFaviconMedia.value = data.actionFaviconMedia;
  markProjectSaved();
  resolvedProjectUuid.value = data.projectUuid;
  if (projectUuid !== data.projectUuid) {
    await navigateTo(`/admin/projects/edit/${data.projectUuid}/`, {
      replace: true,
    });
  }
}

async function handleSave() {
  if (saving.value) return;
  saving.value = true;
  headerError.value = undefined;
  try {
    if (isEdit.value) {
      const result = await $fetch<ProjectSaveResponse>(
        `/api/admin/projects/${projectUuid}/`,
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
      applySavedAction(result.action);
      markProjectSaved();
    } else {
      const result = await $fetch<ProjectSaveResponse>('/api/admin/projects/', {
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
      applySavedAction(result.action);
      markProjectSaved();
      await refreshNuxtData('admin-bar');
      await navigateTo(`/admin/projects/edit/${result.projectUuid}/`, {
        external: true,
      });
    }
  } finally {
    saving.value = false;
  }
}

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

function markProjectSaved() {
  savedSnapshot.value = JSON.stringify(projectData.value);
  savedProjectData.value = cloneProjectData(projectData.value);
}

function applySavedAction(action: ProjectEditData['action']) {
  const previous = projectData.value.action;
  projectData.value.action = action ?? { ...DEFAULT_PROJECT_ACTION };
  if (action?.iconAssetUuid !== previous?.iconAssetUuid) {
    actionIconMedia.value = undefined;
    actionIconSize.value = undefined;
  }
  if (action?.backgroundAssetUuid !== previous?.backgroundAssetUuid) {
    actionBackgroundMedia.value = undefined;
    actionBackgroundSize.value = undefined;
  }
  if (action?.fileAssetUuid !== previous?.fileAssetUuid) {
    actionFileUrl.value = undefined;
    actionFileMedia.value = undefined;
    actionFileExtension.value = undefined;
    actionFileSize.value = undefined;
  }
  if (action?.externalUrl !== previous?.externalUrl)
    actionFaviconMedia.value = undefined;
}

function cloneProjectData(data: ProjectEditData): ProjectEditData {
  return JSON.parse(JSON.stringify(data)) as ProjectEditData;
}
onBeforeRouteLeave(() => {
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
    <ProjectStructuredItems kind="stage" />
    <ProjectStructuredItems kind="section" />
    <ProjectRelations />
    <ProjectTags />
  </div>
</template>

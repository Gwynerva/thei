<script lang="ts" setup>
import type {
  ProjectEditClientValidation,
  ProjectEditData,
} from '#layers/thei/shared/admin/project';
import type {
  OtherAssetGetItem,
  ProjectGetResponse,
  ProjectSaveResponse,
  ShowcaseAssetGetItem,
} from '#layers/thei/shared/api/project';
import {
  projectDataInjectionKey,
  projectValidationKey,
  iconPreviewUrlKey,
  bannerPreviewUrlKey,
  iconVideoUrlKey,
  bannerVideoUrlKey,
  iconSizeKey,
  bannerSizeKey,
  currentProjectUuidKey,
  otherItemsKey,
  showcaseItemsKey,
} from '../composables';
import ProjectMain from './ProjectMain.vue';
import ProjectAssets from './ProjectAssets.vue';
import ProjectDeletePane from './ProjectDeletePane.vue';

const { projectUuid } = defineProps<{ projectUuid?: string }>();

const projectData = ref<ProjectEditData>({
  title: '',
  summary: '',
  slug: '',
  access: '',
  important: false,
  cv: false,
});
provide(projectDataInjectionKey, projectData);

const projectValidation = ref<ProjectEditClientValidation>({
  isSlugUnique: true,
});
provide(projectValidationKey, projectValidation);

const iconPreviewUrl = ref<string | undefined>();
provide(iconPreviewUrlKey, iconPreviewUrl);

const bannerPreviewUrl = ref<string | undefined>();
provide(bannerPreviewUrlKey, bannerPreviewUrl);

const iconVideoUrl = ref<string | undefined>();
provide(iconVideoUrlKey, iconVideoUrl);

const bannerVideoUrl = ref<string | undefined>();
provide(bannerVideoUrlKey, bannerVideoUrl);

const iconSize = ref<number | undefined>();
provide(iconSizeKey, iconSize);

const bannerSize = ref<number | undefined>();
provide(bannerSizeKey, bannerSize);

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

const isDirty = computed(
  () => JSON.stringify(projectData.value) !== savedSnapshot.value,
);

const isFormValid = computed(
  () =>
    projectData.value.title.trim() !== '' &&
    projectData.value.summary.trim() !== '' &&
    projectData.value.slug.trim() !== '' &&
    !!projectData.value.access &&
    projectValidation.value.isSlugUnique,
);

const canSave = computed(() => isDirty.value && isFormValid.value);

const requestFetch = useRequestFetch();

if (isEdit.value) {
  const data = await requestFetch<ProjectGetResponse>(
    `/api/admin/projects/${projectUuid}/`,
  );
  projectData.value = {
    title: data.title,
    summary: data.summary,
    slug: data.slug,
    access: data.access,
    important: data.important,
    cv: data.cv,
    iconAssetUuid: data.iconAssetUuid,
    bannerAssetUuid: data.bannerAssetUuid,
    showcaseAssets: (data.showcaseAssets ?? []).map((item) => ({
      assetUuid: item.assetUuid,
      caption: item.caption,
      access: item.access,
    })),
    otherAssets: (data.otherAssets ?? []).map((item) => ({
      assetUuid: item.assetUuid,
      title: item.title,
      caption: item.caption,
      access: item.access,
    })),
  };
  showcaseItems.value = data.showcaseAssets ?? [];
  otherItems.value = data.otherAssets ?? [];
  iconPreviewUrl.value = data.iconPreviewUrl;
  iconVideoUrl.value = data.iconVideoUrl;
  iconSize.value = data.iconAssetSize;
  bannerPreviewUrl.value = data.bannerPreviewUrl;
  bannerVideoUrl.value = data.bannerVideoUrl;
  bannerSize.value = data.bannerAssetSize;
  savedSnapshot.value = JSON.stringify(projectData.value);
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
        headerError.value = result.message;
        return;
      }
      savedSnapshot.value = JSON.stringify(projectData.value);
    } else {
      const result = await $fetch<ProjectSaveResponse>('/api/admin/projects/', {
        method: 'POST',
        body: projectData.value,
      });
      if (result.type === 'error') {
        headerError.value = result.message;
        return;
      }
      savedSnapshot.value = JSON.stringify(projectData.value);
      await refreshNuxtData('admin-bar');
      await navigateTo(`/admin/projects/edit/${result.projectUuid}/`, {
        external: true,
      });
    }
  } finally {
    saving.value = false;
  }
}

const modal = useModal();

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
onBeforeRouteLeave(() => {
  if (isDirty.value) {
    return window.confirm(phrase.value.unsaved_changes_confirm);
  }
});
</script>

<template>
  <StickyGlassHeader width="var(--width-wide)" :error="headerError">
    <div class="flex items-center justify-between gap-xs py-xs">
      <div class="flex min-w-0 items-center gap-xs text-xl font-bold">
        <Icon :name="isEdit ? 'edit' : 'plus-circle'" class="shrink-0" />
        <span class="truncate">
          {{ isEdit ? phrase.edit_project : phrase.new_project }}
        </span>
      </div>

      <div class="flex items-center gap-xs">
        <Button
          v-if="isEdit"
          variant="delete"
          :data-title-popup="phrase.delete"
          @click="
            modal.open({
              title: phrase.delete_project,
              component: ProjectDeletePane,
              props: {
                projectUuid: resolvedProjectUuid!,
                projectTitle: projectData.title,
              },
            })
          "
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
    <ProjectAssets />
  </div>
</template>

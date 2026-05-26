<script lang="ts" setup>
import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import { ASSET_PROFILES } from '#layers/thei/shared/asset-profiles';
import AssetUploadPane from '#layers/thei/app/components/AssetUploadPane.vue';
import {
  projectDataInjectionKey,
  iconPreviewUrlKey,
  bannerPreviewUrlKey,
} from '../composables';
import ProjectAssetPane from './ProjectAssetPane.vue';

const projectData = inject(projectDataInjectionKey)!;
const iconPreviewUrl = inject(iconPreviewUrlKey)!;
const bannerPreviewUrl = inject(bannerPreviewUrlKey)!;

const modal = useModal();

function openIconModal() {
  modal.open({
    title: phrase.value.project_icon,
    component: ProjectAssetPane,
    props: {
      previewUrl: iconPreviewUrl.value!,
      profileId: 'icon',
      onUploaded: (result: AssetUploadResponse) => {
        projectData.value.iconAssetUuid = result.assetUuid;
        iconPreviewUrl.value = `/api/admin/assets/preview/${result.slug}.${result.extension}`;
      },
      onDeleted: () => {
        projectData.value.iconAssetUuid = undefined;
        iconPreviewUrl.value = undefined;
      },
    },
  });
}

function openBannerModal() {
  modal.open({
    title: phrase.value.project_banner,
    component: ProjectAssetPane,
    props: {
      previewUrl: bannerPreviewUrl.value!,
      profileId: 'banner',
      onUploaded: (result: AssetUploadResponse) => {
        projectData.value.bannerAssetUuid = result.assetUuid;
        bannerPreviewUrl.value = `/api/admin/assets/preview/${result.slug}.${result.extension}`;
      },
      onDeleted: () => {
        projectData.value.bannerAssetUuid = undefined;
        bannerPreviewUrl.value = undefined;
      },
    },
  });
}

function openIconUpload() {
  modal.open({
    title: ASSET_PROFILES.icon.label,
    component: AssetUploadPane,
    props: { profileId: 'icon' },
    onBack: (result) => {
      if (result) {
        const r = result as AssetUploadResponse;
        projectData.value.iconAssetUuid = r.assetUuid;
        iconPreviewUrl.value = `/api/admin/assets/preview/${r.slug}.${r.extension}`;
      }
    },
  });
}

function openBannerUpload() {
  modal.open({
    title: ASSET_PROFILES.banner.label,
    component: AssetUploadPane,
    props: { profileId: 'banner' },
    onBack: (result) => {
      if (result) {
        const r = result as AssetUploadResponse;
        projectData.value.bannerAssetUuid = r.assetUuid;
        bannerPreviewUrl.value = `/api/admin/assets/preview/${r.slug}.${r.extension}`;
      }
    },
  });
}
</script>

<template>
  <div>
    <SectionHeader
      icon="files"
      :title="phrase.project_files"
      :description="phrase.project_files_description"
      class="mb-md"
    />
    <Box class="flex flex-col">
      <div class="flex flex-wrap gap-md p-sm sm:p-md">
        <!-- Project Icon -->
        <div class="flex flex-1 items-center gap-sm">
          <!-- With icon: click opens info modal -->
          <div
            v-if="iconPreviewUrl"
            class="group relative size-18 cursor-pointer overflow-clip
              rounded-normal border-2 border-border-1 bg-bg-1 transition
              hocus:border-border-3"
            @click="openIconModal"
          >
            <img
              :src="iconPreviewUrl"
              class="size-full object-cover"
              alt="Project icon"
            />
            <!-- hover overlay -->
            <div
              class="absolute inset-0 flex items-center justify-center
                bg-bg-1/60 opacity-0 transition group-hocus:opacity-100"
            >
              <Icon name="edit" class="text-2xl text-text-1" />
            </div>
          </div>

          <!-- Without icon: click opens upload directly -->
          <div
            v-else
            class="flex size-18 cursor-pointer items-center justify-center
              overflow-clip rounded-normal border-2 border-border-1 bg-bg-1
              transition hocus:border-border-3 hocus:bg-bg-3"
            @click="openIconUpload"
          >
            <Icon name="plus" class="text-3xl text-text-2" />
          </div>

          <div class="tracking-tight">
            <div class="font-semibold">{{ phrase.project_icon }}</div>
            <p class="text-sm text-text-2">{{ phrase.project_icon_hint }}</p>
          </div>
        </div>

        <!-- Project Banner -->
        <div class="flex flex-1 items-center gap-sm">
          <!-- With banner: click opens info modal -->
          <div
            v-if="bannerPreviewUrl"
            class="group relative aspect-video h-18 cursor-pointer overflow-clip
              rounded-normal border-2 border-border-1 bg-bg-1 transition
              hocus:border-border-3"
            @click="openBannerModal"
          >
            <img
              :src="bannerPreviewUrl"
              class="size-full object-cover"
              alt="Project banner"
            />
            <!-- hover overlay -->
            <div
              class="absolute inset-0 flex items-center justify-center
                bg-bg-1/60 opacity-0 transition group-hocus:opacity-100"
            >
              <Icon name="edit" class="text-2xl text-text-1" />
            </div>
          </div>

          <!-- Without banner: click opens upload directly -->
          <div
            v-else
            class="flex aspect-video h-18 cursor-pointer items-center
              justify-center overflow-clip rounded-normal border-2
              border-border-1 bg-bg-1 transition hocus:border-border-3
              hocus:bg-bg-3"
            @click="openBannerUpload"
          >
            <Icon name="plus" class="text-3xl text-text-2" />
          </div>

          <div class="tracking-tight">
            <div class="font-semibold">{{ phrase.project_banner }}</div>
            <p class="text-sm text-text-2">{{ phrase.project_banner_hint }}</p>
          </div>
        </div>
      </div>

      <!-- Showcase -->
      <div
        class="border-y border-border-1 bg-bg-3 px-md py-xs text-sm
          tracking-tight"
      >
        <div class="font-semibold text-text-2">
          {{ phrase.showcase }}
        </div>
        <div class="text-text-3">
          {{ phrase.showcase_description }}
        </div>
      </div>
    </Box>
  </div>
</template>

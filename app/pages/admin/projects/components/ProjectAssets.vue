<script lang="ts" setup>
import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import { projectDataInjectionKey, iconPreviewUrlKey } from '../composables';

const projectData = inject(projectDataInjectionKey)!;
const iconPreviewUrl = inject(iconPreviewUrlKey)!;

function removeIcon() {
  projectData.value.iconAssetUuid = undefined;
  iconPreviewUrl.value = undefined;
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
    <Box class="flex flex-col gap-md p-sm sm:p-md">
      <Field>
        <FieldLabel>{{ phrase.project_icon }}</FieldLabel>
        <div class="relative inline-block">
          <AssetUpload
            profile-id="icon"
            v-model="projectData.iconAssetUuid"
            @uploaded="
              (e: AssetUploadResponse) =>
                (iconPreviewUrl = `/api/admin/assets/preview/${e.slug}.${e.extension}/`)
            "
          >
            <div
              class="flex size-12 items-center justify-center overflow-hidden
                rounded-normal border-2 border-border-1 bg-bg-1 transition
                hover:border-border-3 hover:bg-bg-3"
            >
              <img
                v-if="iconPreviewUrl"
                :src="iconPreviewUrl"
                class="h-full w-full object-cover"
                alt="Project icon"
              />
              <Icon v-else name="plus" class="text-xl text-text-2" />
            </div>
          </AssetUpload>
          <button
            v-if="iconPreviewUrl"
            class="absolute -top-1.5 -right-1.5 rounded-full bg-bg-1 p-0.5
              text-text-2 shadow-shadow-1 transition hover:bg-bg-error
              hover:text-text-error"
            @click="removeIcon"
          >
            <Icon name="delete" class="text-xs" />
          </button>
        </div>
        <FieldHint>{{ phrase.project_icon_hint }}</FieldHint>
      </Field>
    </Box>
  </div>
</template>

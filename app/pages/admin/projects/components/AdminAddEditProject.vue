<script lang="ts" setup>
import ProjectMain from './ProjectMain.vue';

const { projectId } = defineProps<{ projectId?: string }>();

const isEdit = computed(() => Boolean(projectId));
const saving = ref(false);

await useAdminTabTitle(
  computed(() =>
    isEdit.value ? phrase.value.edit_project : phrase.value.new_project,
  ),
);
</script>

<template>
  <StickyGlassHeader width="var(--width-wide)">
    <div class="flex items-center justify-between gap-xs py-xs">
      <div class="flex min-w-0 items-center gap-xs text-xl font-bold">
        <Icon name="plus-circle" />
        <span class="truncate">
          {{ isEdit ? phrase.edit_project : phrase.new_project }}
        </span>
      </div>

      <div class="flex items-center gap-xs">
        <Button
          v-if="isEdit"
          variant="delete"
          :data-title-popup="phrase.delete"
        >
          <Icon name="delete" class="scale-120" />
        </Button>
        <Button class="font-semibold" :disabled="saving">
          <Icon v-if="saving" name="loading" class="mr-xs" />
          <span>
            {{ isEdit ? phrase.save : phrase.create }}
          </span>
        </Button>
      </div>
    </div>
  </StickyGlassHeader>
  <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <ProjectMain />
  </div>
</template>

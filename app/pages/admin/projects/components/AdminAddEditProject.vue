<script lang="ts" setup>
const { projectId } = defineProps<{ projectId?: string }>();

const isEdit = computed(() => Boolean(projectId));

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
        <Button :secondary="true" :data-title-popup="phrase.drafts">
          <Icon name="history" class="scale-120" />
        </Button>
        <Button class="font-semibold">
          <Icon name="loading" class="mr-xs" />
          <span>
            {{ isEdit ? phrase.save : phrase.create }}
          </span>
        </Button>
      </div>
    </div>
  </StickyGlassHeader>
  <div class="m-auto w-(--width-wide) px-window py-lg">
    <Box>
      <p>New Project</p>
    </Box>
  </div>
</template>

<script lang="ts" setup>
import type { TagUsageStats } from '#layers/thei/shared/tag';
import DeleteConfirmationPane from '#layers/thei/app/modals/DeleteConfirmationPane.vue';

const emit = defineEmits<{
  modalResult: [result: { type: 'deleted' }];
}>();

const props = defineProps<{
  modalData: {
    tagUuid: string;
    tagTitle: string;
    usageStats: TagUsageStats;
  };
}>();

const deleting = ref(false);
const tagTitle = computed(() => props.modalData.tagTitle.trim());
const requestFetch = useRequestFetch();

async function handleDelete() {
  if (deleting.value) return;
  deleting.value = true;
  try {
    await requestFetch(`/api/admin/tags/${props.modalData.tagUuid}/`, {
      method: 'DELETE',
    });
    emit('modalResult', { type: 'deleted' });
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <DeleteConfirmationPane
    :title="phrase.delete_tag"
    :entity-type="phrase.tag.toLocaleLowerCase()"
    :confirmation-name="tagTitle"
    :deleting="deleting"
    @confirm="handleDelete"
  >
    <div
      v-if="
        modalData.usageStats.projects > 0 || modalData.usageStats.events > 0
      "
      class="rounded-normal border border-border-warning bg-bg-warning p-sm
        text-sm text-text-warning"
      :aria-label="
        phrase.tag_usage_summary(
          modalData.usageStats.projects,
          modalData.usageStats.events,
        )
      "
    >
      <p>
        <Icon name="warning" class="mr-xs inline-block align-text-bottom" />{{
          phrase.tag_delete_usage_warning
        }}
      </p>
      <div class="mt-xs flex flex-wrap items-center gap-xs font-semibold">
        <span class="flex items-center gap-xs">
          <Icon name="project" />
          <span>{{ phrase.x_projects(modalData.usageStats.projects) }}</span>
        </span>
        <span aria-hidden="true">·</span>
        <span class="flex items-center gap-xs">
          <Icon name="event" />
          <span>{{ phrase.x_events(modalData.usageStats.events) }}</span>
        </span>
      </div>
    </div>
  </DeleteConfirmationPane>
</template>

<script setup lang="ts">
import type { StatusHistoryItem } from '#layers/thei/shared/status';
defineProps<{
  item: StatusHistoryItem;
  removable?: boolean;
  editable?: boolean;
  standalone?: boolean;
  shortDate?: boolean;
}>();
defineEmits<{ remove: [id: string]; edit: [item: StatusHistoryItem] }>();
</script>
<template>
  <article
    class="flex items-start gap-sm"
    :class="standalone ? undefined : 'py-sm'"
  >
    <Media
      v-if="item.kind === 'regular' && item.media"
      v-bind="item.media"
      class="size-8 shrink-0 overflow-hidden rounded-normal"
    />
    <span
      v-else
      class="flex size-8 shrink-0 items-center justify-center rounded-normal
        text-xl"
      :class="
        item.kind === 'empty'
          ? 'bg-bg-3 text-text-3'
          : 'bg-accent/10 text-accent'
      "
      ><Icon name="pulse"
    /></span>
    <p
      class="min-w-0 flex-1 wrap-anywhere whitespace-pre-wrap"
      :class="item.kind === 'empty' ? 'text-text-3 italic' : undefined"
    >
      {{ item.kind === 'empty' ? phrase.profile_empty_status : item.text }}
    </p>
    <div class="flex shrink-0 items-center gap-xs">
      <ProfileDate :timestamp="item.createdAt" :short="shortDate" /><Button
        v-if="editable && item.kind === 'regular'"
        variant="secondary"
        type="button"
        size="icon-sm"
        :aria-label="phrase.edit"
        :data-title-popup="phrase.edit"
        @click="$emit('edit', item)"
      >
        <Icon name="edit" /></Button
      ><Button
        v-if="removable"
        type="button"
        size="icon-sm"
        variant="delete"
        :aria-label="phrase.delete"
        @click="$emit('remove', item.id)"
      >
        <Icon name="delete" />
      </Button>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { StatusHistoryItem } from '#layers/thei/shared/status';
const props = defineProps<{
  item: StatusHistoryItem;
  removable?: boolean;
  editable?: boolean;
  standalone?: boolean;
  shortDate?: boolean;
}>();
defineEmits<{ remove: [id: string]; edit: [item: StatusHistoryItem] }>();
// On a phone the editor's buttons would squeeze the text into a sliver, so
// there the date and the buttons go on a line of their own under it.
const actions = computed(() => props.editable || props.removable);
</script>
<template>
  <article
    class="flex items-center gap-sm"
    :class="[
      standalone ? undefined : 'py-sm',
      actions ? 'max-sm:items-start' : undefined,
    ]"
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
    <div
      class="flex min-w-0 flex-1 items-center gap-sm"
      :class="
        actions
          ? 'max-sm:flex-col max-sm:items-stretch max-sm:gap-xs'
          : undefined
      "
    >
      <p
        class="min-w-0 flex-1 wrap-anywhere whitespace-pre-wrap"
        :class="[
          item.kind === 'empty' ? 'text-text-3 italic' : undefined,
          actions ? 'max-sm:min-h-8 max-sm:content-center' : undefined,
        ]"
      >
        {{
          item.kind === 'empty'
            ? phrase.profile_empty_status
            : publicText(item.text)
        }}
      </p>
      <div
        class="flex shrink-0 items-center gap-xs"
        :class="actions ? 'max-sm:justify-between' : undefined"
      >
        <ProfileDate :date="item.date" :short="shortDate" />
        <div v-if="actions" class="flex items-center gap-xs">
          <Button
            v-if="editable"
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
      </div>
    </div>
  </article>
</template>

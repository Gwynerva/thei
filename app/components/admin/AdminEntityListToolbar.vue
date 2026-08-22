<script lang="ts" setup>
import type { AdminEntityListOrder } from '#layers/thei/shared/admin/entity-list';

const search = defineModel<string>('search', { required: true });
const order = defineModel<AdminEntityListOrder>('order', { required: true });

const orderOptions = computed(() => ({
  newest: phrase.value.sort_newest,
  oldest: phrase.value.sort_oldest,
}));
</script>

<template>
  <div class="flex flex-wrap items-stretch gap-xs">
    <FieldInput
      v-model="search"
      type="search"
      :placeholder="phrase.admin_entity_search_placeholder"
      :aria-label="phrase.admin_entity_search_placeholder"
      class="h-10 text-sm"
      wrapper-class="min-w-52 flex-1 basis-72"
    />
    <FieldSelect
      v-model="order"
      :options="orderOptions"
      :aria-label="phrase.sort_order"
      wrapper-class="h-10"
    />
  </div>
</template>

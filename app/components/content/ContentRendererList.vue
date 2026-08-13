<script lang="ts" setup>
defineOptions({ name: 'ContentRendererList' });

type ListItem = {
  content?: string;
  meta?: { checked?: boolean };
  items?: ListItem[];
};

withDefaults(
  defineProps<{
    items: ListItem[];
    style?: 'unordered' | 'ordered' | 'checklist';
  }>(),
  { style: 'unordered' },
);
</script>

<template>
  <component
    :is="style === 'ordered' ? 'ol' : 'ul'"
    class="content-list"
    :class="`content-list-${style}`"
  >
    <li v-for="(item, index) in items" :key="index">
      <span v-if="style === 'checklist'" class="mr-xs text-text-2">
        <Icon :name="item.meta?.checked ? 'check' : 'missing'" />
      </span>
      <span v-html="item.content"></span>
      <ContentRendererList
        v-if="item.items?.length"
        :items="item.items"
        :style="style"
      />
    </li>
  </component>
</template>

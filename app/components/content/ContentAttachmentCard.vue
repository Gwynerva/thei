<script lang="ts" setup>
import type { ContentAssetData } from '#layers/thei/shared/content';

const props = withDefaults(
  defineProps<{
    asset: ContentAssetData;
    title?: string;
    description?: string;
    editable?: boolean;
    href?: string;
    fallbackTitle?: string;
    editLabel?: string;
    titlePlaceholder?: string;
    descriptionPlaceholder?: string;
    openable?: boolean;
  }>(),
  {
    title: '',
    description: '',
    editable: false,
    href: undefined,
    fallbackTitle: '',
    editLabel: '',
    titlePlaceholder: '',
    descriptionPlaceholder: '',
  },
);

const emit = defineEmits<{
  edit: [];
  title: [value: string];
  description: [value: string];
  open: [];
}>();

const humanSize = useHumanSize();

// Opening goes through the asset viewer, which needs the file's address too.
const mode = computed(() => {
  if (props.editable || !props.href) return 'static';
  return props.openable ? 'open' : 'link';
});
function onPreviewClick(event: MouseEvent) {
  if (!props.editable) return;
  event.stopPropagation();
  emit('edit');
}

const resolvedTitle = computed(() => props.title || props.fallbackTitle);
const details = computed(() =>
  [
    props.asset.extension?.toUpperCase(),
    props.asset.size !== undefined ? humanSize(props.asset.size) : undefined,
  ].filter(Boolean),
);
</script>

<template>
  <component
    :is="mode === 'open' ? 'button' : mode === 'link' ? 'a' : 'div'"
    :type="mode === 'open' ? 'button' : undefined"
    :href="mode === 'link' ? href : undefined"
    :target="mode === 'link' ? '_blank' : undefined"
    :rel="mode === 'link' ? 'noopener noreferrer' : undefined"
    class="group relative flex w-full min-w-0 items-center gap-sm rounded-normal
      border border-border-1 bg-bg-2 p-xs text-left text-text-1 no-underline
      transition-colors outline-none sm:pr-sm"
    :class="
      mode === 'static'
        ? 'focus-within:border-accent/50'
        : `cursor-pointer focus-visible:ring-2 focus-visible:ring-accent
          hocus:border-accent/40 hocus:bg-accent/6`
    "
    @click="mode === 'open' ? emit('open') : undefined"
  >
    <component
      :is="editable ? 'button' : 'span'"
      :type="editable ? 'button' : undefined"
      :data-drag-ignore="editable || undefined"
      :aria-label="editable ? editLabel : undefined"
      :data-title-popup="editable ? editLabel : undefined"
      class="relative flex size-14 shrink-0 items-center justify-center
        rounded-sm bg-accent/10 text-accent transition-colors sm:size-16"
      :class="{
        [`cursor-pointer outline-none focus-visible:ring-2
        focus-visible:ring-accent hocus:bg-accent/20`]: editable,
        'group-hocus:bg-accent/18': !editable && mode !== 'static',
      }"
      @click="onPreviewClick"
    >
      <FilePreview :extension="asset.extension" class="size-10 sm:size-11" />
      <span
        v-if="editable"
        class="absolute -right-1 -bottom-1 flex size-6 items-center
          justify-center rounded-full border border-border-1 bg-bg-2 text-xs
          text-text-2 shadow-sm"
        aria-hidden="true"
      >
        <Icon name="edit" />
      </span>
    </component>

    <component
      :is="editable ? 'div' : 'span'"
      class="flex min-w-0 flex-1 flex-col gap-0.5"
    >
      <ContentPlainTextField
        v-if="editable"
        :model-value="title"
        :editable="true"
        :placeholder="fallbackTitle || titlePlaceholder"
        class="min-h-6 truncate font-semibold tracking-tight outline-none
          empty:before:pointer-events-none empty:before:text-text-3
          empty:before:content-[attr(data-placeholder)] focus:before:hidden"
        @update:model-value="emit('title', $event)"
      />
      <span
        v-else
        class="truncate font-semibold tracking-tight transition-colors"
        :class="{ 'group-hocus:text-accent': mode !== 'static' }"
      >
        {{ resolvedTitle }}
      </span>

      <ContentPlainTextField
        v-if="editable"
        :model-value="description"
        :editable="true"
        :placeholder="descriptionPlaceholder"
        class="min-h-5 truncate text-sm text-text-2 outline-none
          empty:before:pointer-events-none empty:before:text-text-3
          empty:before:content-[attr(data-placeholder)] focus:before:hidden"
        @update:model-value="emit('description', $event)"
      />
      <span
        v-else-if="description"
        class="line-clamp-2 text-sm leading-snug text-text-2"
      >
        {{ description }}
      </span>

      <span
        v-if="details.length"
        class="flex min-w-0 items-center gap-1.5 text-xs text-text-3"
      >
        <template v-for="(detail, index) in details" :key="index">
          <span v-if="index" aria-hidden="true">·</span>
          <span class="truncate">{{ detail }}</span>
        </template>
      </span>
    </component>

    <span
      v-if="mode !== 'static'"
      class="flex size-9 shrink-0 items-center justify-center rounded-full
        bg-bg-3 text-text-2 transition-colors group-hocus:bg-accent
        group-hocus:text-white"
      aria-hidden="true"
    >
      <Icon :name="mode === 'open' ? 'expand-diagonal' : 'arrow-outward'" />
    </span>
  </component>
</template>

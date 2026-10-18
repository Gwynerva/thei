<script lang="ts" setup>
import { AssetType } from '#layers/thei/shared/asset';
import {
  ASSET_LIBRARY_QUERY_LIMIT,
  ASSET_LIBRARY_SOURCE_FILTERS,
  type AssetLibraryFacets,
  type AssetLibraryDescribed,
  type AssetLibraryWhere,
} from '#layers/thei/shared/asset-library';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import type { SelectOption } from './field/FieldSelect.vue';
import { assetSourceIcon } from '../composables/asset-library-labels';

/**
 * The search over stored files, the same wherever files are looked for — the
 * storage page and the picker that reuses them: what was typed, the kind of
 * file and where the file is used, in one row as tall as a field.
 *
 * Every choice counts what it would find for the search (\`facets\`, from the
 * listing itself), so a choice that finds nothing is seen faded before it is
 * made. Every kind of file is offered, whether any is stored or not.
 */
const props = defineProps<{
  /** How the listing counts each choice; unknown until it answers. */
  facets?: AssetLibraryFacets;
}>();

const search = defineModel<string>('search', { required: true });
const type = defineModel<AssetType | ''>('type', { required: true });
const where = defineModel<AssetLibraryWhere>('where', { required: true });
/** Whether the files have their description: either way, none, or one. */
const described = defineModel<AssetLibraryDescribed | ''>('described', {
  required: true,
});

const emit = defineEmits<{ element: [HTMLInputElement] }>();

const typeOptions = computed<SelectOption<AssetType | ''>[]>(() => {
  const types = props.facets?.types;
  const value = phrase.value;
  return [
    {
      value: '',
      label: value.any_file,
      icon: 'files',
      count: types && Object.values(types).reduce((sum, n) => sum + n, 0),
      divider: true,
    },
    ...(
      [
        [AssetType.Image, value.image, 'media'],
        [AssetType.Video, value.video, 'play-circle'],
        [AssetType.Audio, value.audio, 'audio'],
        [AssetType.Other, value.other_files, 'file'],
      ] as const
    ).map(([kind, label, icon]) => ({
      value: kind,
      label,
      icon,
      count: types && (types[kind] ?? 0),
    })),
  ];
});

/**
 * Anywhere; then in an entity of one kind; then whether anything holds the
 * file at all, which is what clearing the library up asks.
 */
const whereOptions = computed<SelectOption<AssetLibraryWhere>[]>(() => {
  const facets = props.facets;
  const unused = facets && (facets.sources.unused ?? 0);
  const value = phrase.value;
  return [
    {
      value: 'all',
      label: value.asset_library_anywhere,
      icon: 'globe',
      count: facets?.anywhere,
      divider: true,
    },
    ...ASSET_LIBRARY_SOURCE_FILTERS.map((kind, index) => ({
      value: kind,
      label: value.life_filter_kind(kind),
      icon: entityTypeIcon(kind),
      count: facets && (facets.sources[kind] ?? 0),
      divider: index === ASSET_LIBRARY_SOURCE_FILTERS.length - 1,
    })),
    {
      value: 'used',
      label: value.asset_library_used,
      icon: 'check',
      count: facets && facets.anywhere - (unused ?? 0),
    },
    {
      value: 'unused',
      label: value.asset_library_unused,
      icon: assetSourceIcon.unused,
      count: unused,
    },
  ];
});

/**
 * Either way; then the files still waiting for a description — what
 * describing them, by hand or with the AI, starts from — and those with one.
 */
const describedOptions = computed<SelectOption<AssetLibraryDescribed | ''>[]>(
  () => {
    const counts = props.facets?.described;
    const value = phrase.value;
    return [
      {
        value: '',
        label: value.asset_library_described_any,
        icon: 'text',
        count: counts && counts.none + counts.some,
        divider: true,
      },
      {
        value: 'none',
        label: value.asset_library_described_none,
        icon: 'missing',
        count: counts?.none,
      },
      {
        value: 'some',
        label: value.asset_library_described_some,
        icon: 'check',
        count: counts?.some,
      },
    ];
  },
);
</script>

<template>
  <div class="flex h-10 items-stretch gap-xs pointer-coarse:h-11">
    <FieldInput
      v-model="search"
      type="search"
      :placeholder="phrase.asset_library_search"
      :aria-label="phrase.asset_library_search"
      :maxlength="ASSET_LIBRARY_QUERY_LIMIT"
      wrapper-class="min-w-0 flex-1"
      class="h-full min-w-0! text-sm"
      @element="emit('element', $event)"
    />
    <FieldSelect
      v-model="type"
      :options="typeOptions"
      :label="phrase.format"
      filter
      compact
      collapsible
      class="max-w-48 shrink-0"
    />
    <FieldSelect
      v-model="where"
      :options="whereOptions"
      :label="phrase.asset_library_usage"
      filter
      compact
      collapsible
      class="max-w-56 shrink-0"
    />
    <FieldSelect
      v-model="described"
      :options="describedOptions"
      :label="phrase.asset_library_described"
      filter
      compact
      collapsible
      class="max-w-52 shrink-0"
      data-library-described
    />
  </div>
</template>

<script lang="ts" setup>
import { AssetType } from '#layers/thei/shared/asset';
import {
  ASSET_LIBRARY_QUERY_LIMIT,
  ASSET_LIBRARY_SOURCE_FILTERS,
  type AssetLibraryFacets,
  type AssetLibraryOrder,
  type AssetLibraryWhere,
} from '#layers/thei/shared/asset-library';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import {
  readLibrarySearch,
  withoutLibrarySearchPart,
  type LibrarySearchPart,
} from '#layers/thei/shared/asset-library-search';
import type { IconName } from '#thei/icons';
import type { SelectOption } from './field/FieldSelect.vue';
import { assetSourceIcon } from '../composables/asset-library-labels';

/**
 * The search over stored files, the same wherever files are looked for — the
 * storage page and the picker that reuses them: what was typed, the kind of
 * file, where the file is used, and which way the
 * library runs through time, in one row as tall as a field.
 *
 * Every choice counts what it would find for the search (\`facets\`, from the
 * listing itself), so a choice that finds nothing is seen faded before it is
 * made. The kinds of file a selection cannot take are not offered
 * (\`kinds\`).
 *
 * The words read as filters — a day, «видео», «дневник» — show under the
 * row as chips (`shared/asset-library-search.ts`); taking one off removes its
 * words from the search.
 */
const props = defineProps<{
  /** How the listing counts each choice; unknown until it answers. */
  facets?: AssetLibraryFacets;
  /** The kinds of file offered; every kind when unset. */
  kinds?: AssetType[];
}>();
const order = defineModel<AssetLibraryOrder>('order', { required: true });

const search = defineModel<string>('search', { required: true });
const type = defineModel<AssetType | ''>('type', { required: true });
const where = defineModel<AssetLibraryWhere>('where', { required: true });

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
    )
      .filter(([kind]) => !props.kinds || props.kinds.includes(kind))
      .map(([kind, label, icon]) => ({
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

/** The words of the search read as filters, as the server reads them. */
const parts = computed(() => readLibrarySearch(search.value).parts);
const TYPE_ICONS: Record<AssetType, IconName> = {
  [AssetType.Image]: 'media',
  [AssetType.Video]: 'play-circle',
  [AssetType.Audio]: 'audio',
  [AssetType.Other]: 'file',
};
function partChip(part: LibrarySearchPart): { label: string; icon: IconName } {
  const value = phrase.value;
  switch (part.kind) {
    case 'date':
      return { label: part.text, icon: 'calendar' };
    case 'uploaded':
      return { label: value.asset_library_uploaded(part.text), icon: 'upload' };
    case 'type':
      return {
        label: {
          [AssetType.Image]: value.image,
          [AssetType.Video]: value.video,
          [AssetType.Audio]: value.audio,
          [AssetType.Other]: value.other_files,
        }[part.value],
        icon: TYPE_ICONS[part.value],
      };
    case 'extension':
      return { label: part.value.toUpperCase(), icon: 'file' };
    case 'place':
      return {
        label: value.life_filter_kind(part.value[0]!),
        icon: entityTypeIcon(part.value[0] as never) as IconName,
      };
  }
}
</script>

<template>
  <div class="flex flex-col gap-xs">
    <div
      class="flex flex-wrap items-stretch gap-xs *:h-10 pointer-coarse:*:h-11"
    >
      <FieldInput
        v-model="search"
        type="search"
        :placeholder="phrase.asset_library_search_hint"
        :aria-label="phrase.asset_library_search"
        :maxlength="ASSET_LIBRARY_QUERY_LIMIT"
        wrapper-class="min-w-0 flex-1 max-sm:basis-full"
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
      <Button
        variant="secondary"
        size="icon-lg"
        class="pointer-coarse:size-11"
        data-library-order
        :aria-label="
          order === 'new'
            ? phrase.asset_library_order_new
            : phrase.asset_library_order_old
        "
        :data-title-popup="
          order === 'new'
            ? phrase.asset_library_order_new
            : phrase.asset_library_order_old
        "
        @click="order = order === 'new' ? 'old' : 'new'"
        ><Icon
          name="sort"
          class="transition-transform duration-250
            motion-reduce:transition-none"
          :class="{ '-scale-y-100': order === 'old' }"
      /></Button>
    </div>
    <ul
      v-if="parts.length"
      class="flex flex-wrap gap-xs"
      data-library-search-parts
    >
      <li v-for="part in parts" :key="`${part.kind}:${part.start}`">
        <button
          type="button"
          class="inline-flex cursor-pointer items-center gap-1 rounded-full
            bg-bg-accent py-0.5 pr-1.5 pl-2 text-xs font-semibold text-accent
            transition-colors pointer-coarse:py-2 pointer-coarse:pr-2.5
            pointer-coarse:pl-3 pointer-coarse:text-sm hocus:bg-accent/25"
          :aria-label="
            phrase.asset_library_search_part_remove(partChip(part).label)
          "
          :data-title-popup="
            phrase.asset_library_search_part_remove(partChip(part).label)
          "
          :data-library-search-part="part.kind"
          @click="search = withoutLibrarySearchPart(search, part)"
        >
          <Icon :name="partChip(part).icon" class="shrink-0" />{{
            partChip(part).label
          }}<Icon name="close" class="shrink-0 opacity-70" />
        </button>
      </li>
    </ul>
  </div>
</template>

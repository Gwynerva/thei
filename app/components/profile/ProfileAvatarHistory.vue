<script setup lang="ts">
import type { ProfileAvatarHistoryItem } from '#layers/thei/shared/profile';
import type { PublicAssetDescriptor } from '#layers/thei/shared/api/public';
import { openPublicAssets } from '#layers/thei/app/modals/public-asset/modal';
const props = defineProps<{
  items: ProfileAvatarHistoryItem[];
  removable?: boolean;
  more?: boolean;
  loading?: boolean;
  error?: boolean;
  autoplay?: boolean;
  shortDate?: boolean;
}>();
defineEmits<{ remove: [id: string]; load: [] }>();
function descriptor(
  item: ProfileAvatarHistoryItem,
): PublicAssetDescriptor | undefined {
  if (!item.media) return undefined;
  return {
    key: item.id,
    title: phrase.value.profile_avatar,
    href: item.media.src,
    media: item.media,
    extension: item.media.src.split('?')[0]!.split('.').at(-1)!,
    size: 0,
  };
}

/** Every avatar loaded so far travels along, to be stepped through. */
function view(item: ProfileAvatarHistoryItem) {
  const all = props.items
    .map(descriptor)
    .filter((entry) => entry !== undefined);
  openPublicAssets(
    all,
    all.find((entry) => entry.key === item.id),
  );
}
</script>
<template>
  <div
    class="flex scrollbar-hover min-w-0 items-start gap-sm overflow-x-auto
      pb-xs"
    :aria-label="phrase.profile_avatar"
  >
    <div v-for="item in items" :key="item.id" class="relative w-24 shrink-0">
      <AssetTile
        :media="item.media"
        shape="circle"
        :playback="autoplay ? 'autoplay' : undefined"
        :loop="autoplay"
        :autoplay-reduced-motion="autoplay"
        class="size-24 cursor-pointer"
        hover-accent-border
        :aria-label="phrase.profile_avatar"
        @click="view(item)"
      />
      <Button
        v-if="removable"
        type="button"
        size="icon-overlay"
        variant="delete"
        class="absolute top-1 right-1 shadow-md shadow-shadow-1
          backdrop-blur-sm"
        :aria-label="phrase.delete"
        @click.stop="$emit('remove', item.id)"
        @keydown.stop
      >
        <Icon name="delete" />
      </Button>
      <ProfileDate
        :timestamp="item.createdAt"
        :short="shortDate"
        class="mt-xs block text-center"
      />
    </div>
    <ProfileLoadMore
      :more="Boolean(more)"
      :loading="Boolean(loading)"
      :error="Boolean(error)"
      @load="$emit('load')"
    />
  </div>
</template>

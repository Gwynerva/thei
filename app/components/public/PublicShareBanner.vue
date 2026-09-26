<script lang="ts" setup>
import { splitShareLinkRemaining } from '#layers/thei/shared/share-link';

/**
 * Tells a visitor holding a share link what they are looking at.
 *
 * Without it the private view is indistinguishable from a published page, and
 * the address could be passed on in the belief that it is public. It sits
 * under the header on the entity's page and on every page under it.
 *
 * When the link runs out the page drops what it opened: its data is fetched
 * again, as a stranger would get it.
 */
const { grant, remaining, ended } = useShareAccess();

const closesIn = computed(() => {
  const { hours, minutes } = splitShareLinkRemaining(remaining.value);
  return phrase.value.share_link_closes_in(hours, minutes);
});

watch(ended, (value) => {
  if (value) void refreshNuxtData();
});
</script>

<template>
  <aside
    v-if="grant"
    class="border-b border-border-warning bg-bg-warning text-text-warning"
  >
    <div class="m-auto w-(--width-wide) max-w-full px-window py-sm">
      <p v-if="ended" class="flex items-center gap-xs font-semibold">
        <Icon name="lock-close" class="shrink-0" />
        <span>{{ phrase.share_banner_ended }}</span>
      </p>
      <template v-else>
        <div
          class="flex flex-wrap items-center justify-between gap-x-md gap-y-1"
        >
          <p class="flex items-center gap-xs font-semibold">
            <Icon name="lock-partial" class="shrink-0" />
            <span>{{ phrase.share_links }}</span>
          </p>
          <p class="flex items-center gap-xs text-sm tabular-nums">
            <Icon name="history" class="shrink-0" />
            <span>{{ closesIn }}</span>
          </p>
        </div>
        <p class="mt-1 text-sm">
          {{
            grant.whole ? phrase.share_banner_whole : phrase.share_banner_part
          }}
        </p>
      </template>
    </div>
  </aside>
</template>

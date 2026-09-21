<script lang="ts" setup>
import {
  SHARE_LINK_DURATION_ORDER,
  type ShareLinkDuration,
  type ShareLinkEntityType,
  type ShareLinkItem,
} from '#layers/thei/shared/share-link';

/**
 * Temporary links that open this entry, private parts and all.
 *
 * Links live outside the page's own save: creating or revoking one takes
 * effect immediately, because a link that only starts working after a save
 * would be a link the owner cannot trust.
 */
const { entityType, entityUuid } = defineProps<{
  entityType: ShareLinkEntityType;
  entityUuid: string;
}>();

const requestFetch = useRequestFetch();
// A token is shown once, when it is created: the server keeps only its hash,
// so a link listed later can be extended or revoked but never read again.
const createdUrls = reactive(new Map<string, string>());
const links = ref<ShareLinkItem[]>([]);
const busy = ref(false);
const error = ref('');
const copiedUuid = ref('');
const duration = ref<ShareLinkDuration>('1h');

const durationLabels: Record<ShareLinkDuration, () => string> = {
  '30m': () => phrase.value.share_link_duration_30m,
  '1h': () => phrase.value.share_link_duration_1h,
  '6h': () => phrase.value.share_link_duration_6h,
  '24h': () => phrase.value.share_link_duration_24h,
};

async function load() {
  try {
    links.value = await requestFetch<ShareLinkItem[]>(
      '/api/admin/share-links',
      { query: { entityType, entityUuid } },
    );
  } catch {
    links.value = [];
  }
}
await load();
useAutoRefresh(load, 30000);

async function act(run: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await run();
    await load();
  } catch (caught) {
    error.value =
      caught instanceof Error
        ? ((caught as { data?: { message?: string } }).data?.message ??
          caught.message)
        : String(caught);
  } finally {
    busy.value = false;
  }
}

function create() {
  return act(async () => {
    const link = await requestFetch<ShareLinkItem>('/api/admin/share-links', {
      method: 'POST',
      body: { entityType, entityUuid, duration: duration.value },
    });
    if (link.url) {
      createdUrls.set(link.shareUuid, link.url);
      await copyToClipboard(link.shareUuid, link.url);
    }
  });
}

function extend(link: ShareLinkItem) {
  return act(() =>
    requestFetch<ShareLinkItem>('/api/admin/share-links/extend', {
      method: 'POST',
      body: { shareUuid: link.shareUuid, duration: duration.value },
    }),
  );
}

function revoke(link: ShareLinkItem) {
  return act(() =>
    requestFetch<{ ok: true }>(`/api/admin/share-links/${link.shareUuid}`, {
      method: 'DELETE',
    }),
  );
}

async function copyToClipboard(shareUuid: string, url: string) {
  try {
    await navigator.clipboard.writeText(url);
    copiedUuid.value = shareUuid;
    setTimeout(() => {
      if (copiedUuid.value === shareUuid) copiedUuid.value = '';
    }, 2000);
  } catch {
    // Without the clipboard the address is still one click away in the list.
  }
}
</script>

<template>
  <div>
    <div class="mb-md flex items-center gap-md">
      <SectionHeader
        icon="lock-partial"
        :title="phrase.share_links"
        :description="phrase.share_links_description"
        class="min-w-0 flex-1"
      />
      <FieldSelect
        v-model="duration"
        class="w-32 shrink-0 max-sm:hidden"
        :options="
          Object.fromEntries(
            SHARE_LINK_DURATION_ORDER.map((value) => [
              value,
              durationLabels[value](),
            ]),
          )
        "
      />
      <button
        type="button"
        class="size-12 shrink-0 cursor-pointer rounded-normal bg-bg-3
          text-text-2 transition-colors hocus:bg-bg-accent hocus:text-accent"
        :aria-label="phrase.share_link_create"
        :data-title-popup="phrase.share_link_create"
        :disabled="busy"
        @click="create"
      >
        <Icon name="plus" />
      </button>
    </div>
    <Box>
      <p v-if="error" class="p-sm text-sm text-text-error sm:p-md">
        <Icon name="warning" class="mr-xs" />{{ error }}
      </p>
      <p v-if="!links.length" class="p-sm text-sm text-text-3 italic sm:p-md">
        {{ phrase.share_link_empty }}
      </p>
      <div
        v-for="link in links"
        :key="link.shareUuid"
        class="flex flex-wrap items-center gap-sm border-t border-border-1 p-sm
          first:border-t-0 sm:p-md"
      >
        <Icon name="lock-partial" class="shrink-0 text-text-3" />
        <span
          class="flex min-w-0 flex-1 flex-wrap items-center gap-x-xs text-sm"
        >
          <span>{{ phrase.share_link_expires }}</span>
          <TheiTime :datetime="link.expiresAt" class="text-text-2" />
        </span>
        <Button
          v-if="createdUrls.has(link.shareUuid)"
          variant="secondary"
          size="icon-sm"
          :aria-label="phrase.copy"
          :data-title-popup="
            copiedUuid === link.shareUuid
              ? phrase.sign_in_link_copied
              : phrase.copy
          "
          @click="
            copyToClipboard(link.shareUuid, createdUrls.get(link.shareUuid)!)
          "
        >
          <Icon name="link" />
        </Button>
        <Button
          variant="secondary"
          :disabled="busy"
          :data-title-popup="phrase.share_link_extend"
          @click="extend(link)"
        >
          <Icon name="arrow-cycle" class="mr-xs" />
          {{ durationLabels[duration]() }}
        </Button>
        <Button
          variant="delete"
          size="icon-sm"
          :disabled="busy"
          :aria-label="phrase.delete"
          @click="revoke(link)"
        >
          <Icon name="delete" />
        </Button>
      </div>
    </Box>
  </div>
</template>

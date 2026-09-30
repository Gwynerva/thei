<script lang="ts" setup>
import {
  SHARE_LINK_DURATION_KEYS,
  SHARE_LINK_LABEL_MAX,
  shareLinkRemainingShare,
  shareLinkUrgency,
  splitShareLinkRemaining,
  type ShareLinkDuration,
  type ShareLinkEntityType,
  type ShareLinkItem,
  type ShareLinkUrgency,
} from '#layers/thei/shared/share-link';

/**
 * Temporary links that open this entity, private parts and all.
 *
 * Links live outside the page's own save: creating, extending or revoking one
 * takes effect immediately, because a link that only starts working after a
 * save would be a link the owner cannot trust.
 */
const { entityType, entityUuid } = defineProps<{
  entityType: ShareLinkEntityType;
  entityUuid: string;
}>();

const requestFetch = useRequestFetch();
const liveNow = useLiveNow();
const links = ref<ShareLinkItem[]>([]);
const busy = ref(false);
const error = ref('');
const { copied, copyText } = useClipboardCopy();

const durationLabels = computed<Record<ShareLinkDuration, string>>(() => ({
  '30m': phrase.value.share_link_duration_30m,
  '1h': phrase.value.share_link_duration_1h,
  '6h': phrase.value.share_link_duration_6h,
  '24h': phrase.value.share_link_duration_24h,
}));
const durationOptions = computed(() =>
  Object.fromEntries(
    SHARE_LINK_DURATION_KEYS.map((key) => [
      key,
      { title: durationLabels.value[key] },
    ]),
  ),
);

/**
 * The links as the server has them. The list is refreshed in the background,
 * for links made or revoked elsewhere; a refresh that fails keeps the list it
 * had, and is not retried at once — the next refresh is the retry.
 */
async function load() {
  links.value = await requestFetch<ShareLinkItem[]>('/api/admin/share-links', {
    query: { entityType, entityUuid },
    retry: 0,
  });
}
await load().catch(() => {});
const { forceRefresh } = useAutoRefresh(load, 30000);

/**
 * Each live link with what its row shows about time. A link leaves the list
 * the moment it closes, not at the next refresh.
 */
const rows = computed(() =>
  links.value
    .filter((link) => link.expiresAt > liveNow.value)
    .map((link) => ({ link, time: countdown(link) })),
);

/**
 * What a row shows about time: the words, the share of the current term that
 * is left — drawn as a ring that empties as the link runs out — and the
 * colour both take as the end nears.
 */
function countdown(link: ShareLinkItem) {
  const { hours, minutes } = splitShareLinkRemaining(
    link.expiresAt - liveNow.value,
  );
  const share = shareLinkRemainingShare(link, liveNow.value);
  return {
    text: phrase.value.share_link_closes_in(hours, minutes),
    share,
    tone: urgencyTone[shareLinkUrgency(share)],
  };
}

const urgencyTone: Record<ShareLinkUrgency, { ring: string; text: string }> = {
  calm: { ring: 'text-accent', text: 'text-text-2' },
  soon: { ring: 'text-text-warning', text: 'text-text-warning' },
  closing: { ring: 'text-text-error', text: 'text-text-error' },
};

/**
 * Creates, extends or revokes a link. What it did shows in the list at once;
 * the list is then read again, and a failure to read it is no failure of the
 * action.
 */
async function act(run: () => Promise<unknown>): Promise<boolean> {
  if (busy.value) return false;
  busy.value = true;
  error.value = '';
  try {
    await run();
    await forceRefresh();
    return true;
  } catch (caught) {
    error.value =
      (caught as { data?: { message?: string } }).data?.message ??
      (caught instanceof Error ? caught.message : String(caught));
    return false;
  } finally {
    busy.value = false;
  }
}

/**
 * A link just made or extended, in the list before the list is read again,
 * in the server's order: the soonest to close first.
 */
function showLink(link: ShareLinkItem) {
  links.value = [
    ...links.value.filter((item) => item.shareUuid !== link.shareUuid),
    link,
  ].sort((a, b) => a.expiresAt - b.expiresAt);
}

const addButton = useTemplateRef('addButton');
const createOpen = ref(false);
const draftLabel = ref('');
const draftDuration = ref<ShareLinkDuration>('1h');
const labelInput = ref<HTMLInputElement>();

function openCreate() {
  draftLabel.value = '';
  draftDuration.value = '1h';
  error.value = '';
  createOpen.value = true;
}

/**
 * Creates the link and puts its address on the clipboard at once. The popup
 * closes: the new row carries its own copy button, which shows the check.
 */
async function create() {
  const done = await act(async () => {
    const link = await requestFetch<ShareLinkItem>('/api/admin/share-links', {
      method: 'POST',
      body: {
        entityType,
        entityUuid,
        duration: draftDuration.value,
        label: draftLabel.value,
      },
    });
    showLink(link);
    await copyText(link.shareUuid, link.url);
  });
  if (done) createOpen.value = false;
}

function restoreAddFocus() {
  addButton.value?.focus({ preventScroll: true });
}

const extendOpen = ref(false);
const extendAnchor = ref<HTMLElement | null>(null);
const extending = ref<ShareLinkItem>();

function openExtend(link: ShareLinkItem, event: MouseEvent) {
  extending.value = link;
  extendAnchor.value = event.currentTarget as HTMLElement;
  error.value = '';
  extendOpen.value = true;
}

async function extend(duration: ShareLinkDuration) {
  const link = extending.value;
  if (!link) return;
  const done = await act(async () =>
    showLink(
      await requestFetch<ShareLinkItem>('/api/admin/share-links/extend', {
        method: 'POST',
        body: { shareUuid: link.shareUuid, duration },
      }),
    ),
  );
  if (done) extendOpen.value = false;
}

function revoke(link: ShareLinkItem) {
  return act(async () => {
    await requestFetch<{ ok: true }>(
      `/api/admin/share-links/${link.shareUuid}`,
      { method: 'DELETE' },
    );
    links.value = links.value.filter(
      (item) => item.shareUuid !== link.shareUuid,
    );
  });
}
</script>

<template>
  <div>
    <SectionHeader
      icon="lock-partial"
      :title="phrase.share_links"
      :description="phrase.share_links_description"
      class="mb-md"
    >
      <template #action>
        <SectionAddButton
          ref="addButton"
          :label="phrase.share_link_create"
          :expanded="createOpen"
          @click="openCreate"
        />
      </template>
    </SectionHeader>

    <Box>
      <p
        v-if="error && !createOpen && !extendOpen"
        class="p-sm text-sm text-text-error sm:p-md"
      >
        <Icon name="warning" class="mr-xs" />{{ error }}
      </p>
      <p v-if="!rows.length" class="p-sm text-sm text-text-3 italic sm:p-md">
        {{ phrase.share_link_empty }}
      </p>
      <div
        v-for="{ link, time } in rows"
        :key="link.shareUuid"
        class="flex items-center gap-sm border-t border-border-1 p-sm
          first:border-t-0 sm:p-md"
      >
        <!--
          Only what is left is drawn; the spent part of the term is gone. The
          circle is flipped and turned so the arc always ends at twelve and
          its edge sweeps clockwise, the way a clock hand runs out time.
        -->
        <svg
          viewBox="0 0 36 36"
          class="size-8 shrink-0 -scale-y-100 -rotate-90"
          :class="time.tone.ring"
          aria-hidden="true"
        >
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            stroke="currentColor"
            stroke-width="4"
            stroke-linecap="round"
            pathLength="100"
            :stroke-dasharray="`${time.share * 100} 100`"
            class="transition-[stroke-dasharray] duration-1000 ease-linear
              motion-reduce:transition-none"
          />
        </svg>
        <div class="flex min-w-0 flex-1 flex-col">
          <span
            class="truncate text-sm"
            :class="
              link.label ? 'font-semibold text-text-1' : 'text-text-3 italic'
            "
          >
            {{ link.label || phrase.share_link_unlabeled }}
          </span>
          <span
            class="text-sm tabular-nums transition-colors"
            :class="time.tone.text"
          >
            {{ time.text }}
          </span>
        </div>
        <Button
          variant="secondary"
          size="icon"
          :aria-label="phrase.copy"
          :data-title-popup="
            copied === link.shareUuid ? phrase.copied : phrase.copy
          "
          @click="copyText(link.shareUuid, link.url)"
        >
          <Icon :name="copied === link.shareUuid ? 'check' : 'link'" />
        </Button>
        <Button
          variant="secondary"
          class="flex h-9 shrink-0 items-center gap-xs max-sm:w-9
            max-sm:justify-center max-sm:px-0"
          :aria-label="phrase.share_link_extend"
          aria-haspopup="dialog"
          :aria-expanded="extendOpen && extending?.shareUuid === link.shareUuid"
          @click="openExtend(link, $event)"
        >
          <Icon name="plus" />
          <span class="max-sm:hidden">{{ phrase.share_link_extend }}</span>
        </Button>
        <Button
          variant="delete"
          size="icon"
          :disabled="busy"
          :aria-label="phrase.delete"
          :data-title-popup="phrase.delete"
          @click="revoke(link)"
        >
          <Icon name="delete" />
        </Button>
      </div>
    </Box>

    <FloatingPopup
      v-model:open="createOpen"
      :anchor="addButton?.element ?? null"
      placement="bottom-end"
      max-width="22rem"
      @opened="labelInput?.focus()"
      @closed="restoreAddFocus"
    >
      <form
        class="flex flex-col gap-sm rounded-normal border border-border-1
          bg-bg-2 p-sm"
        @submit.prevent="create"
      >
        <Field>
          <FieldLabel class="text-sm">{{ phrase.share_link_label }}</FieldLabel>
          <FieldInput
            v-model="draftLabel"
            class="text-sm"
            autocomplete="off"
            :maxlength="SHARE_LINK_LABEL_MAX"
            :placeholder="phrase.share_link_label_placeholder"
            @element="labelInput = $event"
          />
        </Field>
        <Field>
          <FieldLabel class="text-sm">
            {{ phrase.share_link_duration }}
          </FieldLabel>
          <FieldOptions
            v-model="draftDuration"
            :options="durationOptions"
            classes="flex-1"
          />
        </Field>
        <p v-if="error" class="text-sm text-text-error">
          <Icon name="warning" class="mr-xs" />{{ error }}
        </p>
        <Button type="submit" :disabled="busy">
          {{ phrase.share_link_create }}
        </Button>
      </form>
    </FloatingPopup>

    <FloatingPopup
      v-model:open="extendOpen"
      :anchor="extendAnchor"
      placement="bottom-end"
      max-width="16rem"
    >
      <div
        v-if="extending"
        class="flex flex-col gap-xs rounded-normal border border-border-1
          bg-bg-2 p-sm"
      >
        <p class="text-sm font-semibold text-text-2">
          {{ phrase.share_link_extend_by }}
        </p>
        <div class="grid grid-cols-2 gap-xs">
          <!-- Always offered: what would pass a day ahead stops there. -->
          <Button
            v-for="duration in SHARE_LINK_DURATION_KEYS"
            :key="duration"
            type="button"
            variant="secondary"
            @click="extend(duration)"
          >
            {{ durationLabels[duration] }}
          </Button>
        </div>
        <p v-if="error" class="text-sm text-text-error">
          <Icon name="warning" class="mr-xs" />{{ error }}
        </p>
      </div>
    </FloatingPopup>
  </div>
</template>

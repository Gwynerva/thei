<script lang="ts" setup>
import {
  API_TOKEN_LABEL_MAX,
  API_TOKEN_PRESET_NAMES,
  apiTokenPresetOf,
  type ApiTokenCreateResponse,
  type ApiTokenItem,
  type ApiTokenListResponse,
  type ApiTokenPreset,
} from '#layers/thei/shared/api-token';
import type { FieldOptions } from '#layers/thei/app/components/field/FieldOptions.vue';
import { apiTokenModal } from '#layers/thei/app/modals/api-token/modal';

/**
 * The access keys AI apps connect with over MCP: made, shown once, revoked.
 *
 * Like a share link, a key works the moment it is made and stops the moment
 * it is revoked, outside any save. With AI off the keys are kept but open
 * nothing; the switch is above them, on the same tab.
 */
const requestFetch = useRequestFetch();
const site = useSiteUrl();
const tokens = ref<ApiTokenItem[]>([]);
const connect = ref<ApiTokenListResponse['connect']>();
const busy = ref(false);
const error = ref('');
const { copied, copyText } = useClipboardCopy<'token' | 'header'>();

/**
 * Held only until the page is left: the server keeps the hash, so this is the
 * one moment the token can be copied.
 */
const fresh = ref<ApiTokenCreateResponse>();

async function load() {
  const result = await requestFetch<ApiTokenListResponse>(
    '/api/admin/api-tokens',
    { retry: 0 },
  );
  tokens.value = result.tokens;
  connect.value = result.connect;
}

await load().catch(() => {});

const presetTitles = computed<Record<ApiTokenPreset, string>>(() => ({
  reader: phrase.value.api_token_preset_reader,
  editor: phrase.value.api_token_preset_editor,
}));
const presetHints = computed<Record<ApiTokenPreset, string>>(() => ({
  reader: phrase.value.api_token_preset_reader_hint,
  editor: phrase.value.api_token_preset_editor_hint,
}));
const PRESET_ICONS = { reader: 'visibility', editor: 'edit' } as const;
const presetOptions = computed<FieldOptions>(() =>
  Object.fromEntries(
    API_TOKEN_PRESET_NAMES.map((name) => [
      name,
      {
        icon: PRESET_ICONS[name],
        title: presetTitles.value[name],
        description: presetHints.value[name],
      },
    ]),
  ),
);

function accessOf(token: ApiTokenItem) {
  const preset = apiTokenPresetOf(token.scopes);
  return preset
    ? { title: presetTitles.value[preset], hint: presetHints.value[preset] }
    : {
        title: phrase.value.api_token_preset_custom,
        hint: token.scopes.join(', '),
      };
}

const endpoint = computed(() => site.resolve('/api/mcp'));
/**
 * What any app sends the key in, whoever made it; how each app is given it
 * is the guide's to say, above.
 */
const header = computed(() =>
  fresh.value ? `Authorization: Bearer ${fresh.value.token}` : '',
);

async function act(run: () => Promise<unknown>): Promise<boolean> {
  if (busy.value) return false;
  busy.value = true;
  error.value = '';
  try {
    await run();
    await load().catch(() => {});
    return true;
  } catch (caught) {
    error.value = errorMessage(caught, phrase.value.error_title);
    return false;
  } finally {
    busy.value = false;
  }
}

/**
 * The keys as chips, the most lately used first: the nearer its last use,
 * the stronger its colour. A key never used comes last, dashed.
 */
const liveNow = useLiveNow();
const DAY = 24 * 60 * 60 * 1000;
const chips = computed(() =>
  [...tokens.value].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)),
);
function recency(token: ApiTokenItem) {
  if (!token.lastUsedAt) return 'border-dashed border-border-1 text-text-3';
  const age = liveNow.value - token.lastUsedAt;
  if (age < DAY) return 'border-accent/50 bg-accent/15 text-accent';
  if (age < 7 * DAY) return 'border-border-3 bg-bg-3 text-text-1';
  return 'border-border-1 bg-bg-3/50 text-text-2';
}

/**
 * How long ago, as short as it can be said — "8 h": a chip has room for no
 * more, and its place in the row already says it is the past.
 */
function ago(at: number) {
  const minutes = Math.max(1, Math.round((liveNow.value - at) / 60_000));
  const [value, unit] =
    minutes < 60
      ? [minutes, 'minute']
      : minutes < 24 * 60
        ? [Math.round(minutes / 60), 'hour']
        : minutes < 30 * 24 * 60
          ? [Math.round(minutes / (24 * 60)), 'day']
          : [Math.round(minutes / (30 * 24 * 60)), 'month'];
  return new Intl.NumberFormat(language.value.code, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
  }).format(value);
}

/** What a chip's hint says: the rights, and the app it was signed in by. */
function chipHint(token: ApiTokenItem) {
  return token.client
    ? `${accessOf(token).title} · ${phrase.value.api_token_signed_in(token.client.name)}`
    : accessOf(token).title;
}

/** A chip's hint: its name, whole, as the chip may cut it, then the rest. */
function chipPopup(token: ApiTokenItem) {
  return titlePopup(
    { text: publicText(token.label), bold: true },
    { text: chipHint(token), italic: true },
  );
}

async function openToken(token: ApiTokenItem) {
  const result = await openModal(apiTokenModal, { token });
  if (result.type !== 'revoked') return;
  if (fresh.value?.item.tokenUuid === token.tokenUuid) fresh.value = undefined;
  tokens.value = tokens.value.filter(
    (item) => item.tokenUuid !== token.tokenUuid,
  );
}

const addButton = useTemplateRef('addButton');
const createOpen = ref(false);
const draftLabel = ref('');
const draftPreset = ref<ApiTokenPreset>('reader');
const labelInput = ref<HTMLInputElement>();

function openCreate() {
  draftLabel.value = '';
  draftPreset.value = 'reader';
  error.value = '';
  createOpen.value = true;
}

async function create() {
  const done = await act(async () => {
    fresh.value = await requestFetch<ApiTokenCreateResponse>(
      '/api/admin/api-tokens',
      {
        method: 'POST',
        body: { label: draftLabel.value, preset: draftPreset.value },
      },
    );
  });
  if (done) createOpen.value = false;
}
</script>

<template>
  <div class="flex flex-col gap-sm">
    <AiConnectGuide v-if="connect" :connect class="mb-md" />
    <div class="flex items-center justify-between gap-sm">
      <div class="flex min-w-0 flex-col">
        <h3 class="flex items-center gap-xs font-semibold text-text-1">
          <Icon name="key" class="shrink-0" aria-hidden="true" />{{
            phrase.api_tokens_title
          }}
        </h3>
        <p class="text-sm text-text-3">{{ phrase.api_tokens_hint }}</p>
      </div>
      <SectionAddButton
        ref="addButton"
        icon-only
        :label="phrase.api_token_create"
        :expanded="createOpen"
        @click="openCreate"
      />
    </div>

    <!-- The key just made: shown this once, with what an app needs. -->
    <div
      v-if="fresh"
      class="flex flex-col gap-sm rounded-normal bg-accent/10 p-sm"
      data-api-token-fresh
    >
      <div class="flex items-center gap-xs">
        <code
          class="scrollbar-mini min-w-0 flex-1 overflow-x-auto rounded-normal
            bg-bg-3 p-xs text-sm break-all"
          >{{ fresh.token }}</code
        >
        <Button
          variant="secondary"
          size="icon"
          class="pointer-coarse:size-11"
          :aria-label="phrase.copy"
          :data-title-popup="copied === 'token' ? phrase.copied : phrase.copy"
          @click="copyText('token', fresh.token)"
        >
          <Icon :name="copied === 'token' ? 'check' : 'files'" />
        </Button>
      </div>
      <p class="text-xs text-text-3">{{ phrase.api_token_shown_once }}</p>
      <p class="text-sm wrap-break-word text-text-2">
        {{ phrase.api_token_endpoint }}:
        <code class="break-all text-text-1">{{ endpoint }}</code>
      </p>
      <p class="text-sm text-text-2">{{ phrase.api_token_connect_hint }}</p>
      <div class="flex items-start gap-xs">
        <code
          class="scrollbar-mini min-w-0 flex-1 overflow-x-auto rounded-normal
            bg-bg-3 p-xs text-xs break-all"
          data-api-token-header
          >{{ header }}</code
        >
        <Button
          variant="secondary"
          size="icon"
          class="pointer-coarse:size-11"
          :aria-label="phrase.copy"
          :data-title-popup="copied === 'header' ? phrase.copied : phrase.copy"
          @click="copyText('header', header)"
        >
          <Icon :name="copied === 'header' ? 'check' : 'files'" />
        </Button>
      </div>
    </div>

    <p v-if="error && !createOpen" class="text-sm text-text-error">
      <Icon name="warning" class="mr-xs" />{{ error }}
    </p>
    <p v-if="!tokens.length" class="text-sm text-text-3 italic">
      {{ phrase.api_token_empty }}
    </p>
    <div v-else class="flex flex-wrap gap-xs" data-api-tokens>
      <button
        v-for="token in chips"
        :key="token.tokenUuid"
        type="button"
        class="flex max-w-full cursor-pointer items-center gap-xs rounded-full
          border px-sm py-1 text-sm transition hocus:border-accent
          hocus:text-accent"
        :class="recency(token)"
        :aria-label="`${publicText(token.label)} · ${chipHint(token)}`"
        v-bind="chipPopup(token)"
        :data-api-token="token.tokenUuid"
        @click="openToken(token)"
      >
        <Icon
          :name="
            apiTokenPresetOf(token.scopes)
              ? PRESET_ICONS[apiTokenPresetOf(token.scopes)!]
              : 'key'
          "
          class="shrink-0"
          aria-hidden="true"
        />
        <span class="min-w-0 truncate font-semibold">{{
          publicText(token.label)
        }}</span>
        <ClientOnly>
          <span class="shrink-0 text-xs opacity-75">{{
            token.lastUsedAt ? ago(token.lastUsedAt) : '—'
          }}</span>
        </ClientOnly>
      </button>
    </div>

    <FloatingPopup
      v-model:open="createOpen"
      :anchor="addButton?.element ?? null"
      placement="bottom-end"
      max-width="24rem"
      density="card"
      complex
      @opened="labelInput?.focus()"
      @closed="addButton?.focus?.()"
    >
      <form class="flex flex-col gap-sm" @submit.prevent="create">
        <Field>
          <FieldLabel class="text-sm" required>{{
            phrase.api_token_label
          }}</FieldLabel>
          <FieldInput
            v-model="draftLabel"
            class="text-sm"
            autocomplete="off"
            :maxlength="API_TOKEN_LABEL_MAX"
            :placeholder="phrase.api_token_label_placeholder"
            @element="labelInput = $event"
          />
        </Field>
        <Field>
          <FieldLabel class="text-sm">{{ phrase.api_token_access }}</FieldLabel>
          <FieldOptions
            v-model="draftPreset"
            :options="presetOptions"
            direction="column"
          />
        </Field>
        <p v-if="error" class="text-sm text-text-error">
          <Icon name="warning" class="mr-xs" />{{ error }}
        </p>
        <Button type="submit" :disabled="busy">
          {{ phrase.api_token_create }}
        </Button>
      </form>
    </FloatingPopup>
  </div>
</template>

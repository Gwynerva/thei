<script setup lang="ts">
import { renderSVG } from 'uqr';
import type { SignInLinkItem } from '#layers/thei/shared/api/sign-in';
import ModalContainer from '../ModalContainer.vue';
import ModalTitle from '../ModalTitle.vue';

/**
 * Creates a one-time sign-in link and shows it as a QR code.
 *
 * The phone's own camera reads the code and opens the address in its browser,
 * which is where the session is created — no scanner and no app in between.
 */
const liveNow = useLiveNow();
const link = ref<SignInLinkItem>();
const creating = ref(false);
const error = ref('');
const copied = ref(false);

const qr = computed(() =>
  link.value?.url
    ? renderSVG(link.value.url, { ecc: 'M', border: 2 })
    : undefined,
);
const remaining = computed(() => {
  if (!link.value) return '';
  const seconds = Math.max(
    0,
    Math.round((link.value.expiresAt - liveNow.value) / 1000),
  );
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
});
const expired = computed(
  () => Boolean(link.value) && link.value!.expiresAt <= liveNow.value,
);

async function create() {
  if (creating.value) return;
  creating.value = true;
  error.value = '';
  try {
    link.value = await $fetch<SignInLinkItem>('/api/admin/sign-in-links', {
      method: 'POST',
    });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    creating.value = false;
  }
}

async function copy() {
  if (!link.value?.url) return;
  try {
    await navigator.clipboard.writeText(link.value.url);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // A browser that refuses the clipboard still shows the address itself.
  }
}

async function revoke() {
  if (!link.value) return;
  const { tokenHash } = link.value;
  link.value = undefined;
  await $fetch(`/api/admin/sign-in-links/${tokenHash}`, {
    method: 'DELETE',
  }).catch(() => {});
}

onMounted(create);
onBeforeUnmount(() => {
  // A link left on screen is a link left usable; closing the modal ends it.
  if (link.value && !expired.value) void revoke();
});
</script>

<template>
  <ModalContainer class="max-w-110">
    <template #header
      ><div class="flex items-center justify-between gap-sm p-sm">
        <ModalTitle :title="phrase.sign_in_link" /></div
    ></template>
    <div class="flex flex-col items-center gap-md p-md">
      <p class="text-center text-sm text-text-2">
        {{ phrase.sign_in_link_description }}
      </p>
      <div
        v-if="qr && !expired"
        class="rounded-normal bg-white p-sm text-black [&_svg]:size-56"
        v-html="qr"
      />
      <div
        v-else-if="creating"
        class="flex size-56 items-center justify-center text-text-3"
      >
        <Icon name="loading" class="text-3xl" />
      </div>
      <template v-if="link && !expired">
        <p class="text-sm font-semibold text-text-2">
          {{ phrase.sign_in_link_expires(remaining) }}
        </p>
        <code
          class="w-full rounded-normal bg-bg-3 p-xs text-center text-xs
            wrap-anywhere"
          >{{ link.url }}</code
        >
        <div class="flex flex-wrap items-center justify-center gap-sm">
          <Button @click="copy">
            <Icon name="link" class="mr-xs" />
            {{ copied ? phrase.sign_in_link_copied : phrase.copy }}
          </Button>
          <Button variant="delete" @click="revoke">
            <Icon name="delete" class="mr-xs" />
            {{ phrase.delete }}
          </Button>
        </div>
      </template>
      <template v-else-if="!creating">
        <p v-if="expired" class="text-sm text-text-3">
          {{ phrase.sign_in_link_invalid }}
        </p>
        <Button @click="create">{{ phrase.sign_in_link_create }}</Button>
      </template>
      <p
        v-if="error"
        class="w-full rounded-normal border border-border-error bg-bg-error p-xs
          text-center text-xs text-text-error"
      >
        <Icon name="warning" class="mr-xs" />{{ error }}
      </p>
    </div>
  </ModalContainer>
</template>

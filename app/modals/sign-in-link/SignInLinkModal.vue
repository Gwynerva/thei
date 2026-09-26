<script setup lang="ts">
import type { SignInLinkItem } from '#layers/thei/shared/api/sign-in';
import ModalContainer from '../ModalContainer.vue';
import ModalHeaderButton from '../ModalHeaderButton.vue';
import ModalTitle from '../ModalTitle.vue';
import { renderQrImage, type QrImage } from './qr-image';

/**
 * Creates a one-time sign-in link and shows it as a QR code.
 *
 * The phone's own camera reads the code and opens the address in its browser,
 * which is where the session is created — no scanner and no app in between.
 * The code is a picture, so it can also be copied or saved from the browser's
 * own menu and sent to the other device.
 */
const liveNow = useLiveNow();
const link = ref<SignInLinkItem>();
const creating = ref(false);
const error = ref('');

const qrFrame = useTemplateRef<HTMLElement>('qrFrame');
const qr = shallowRef<QrImage>();
watch(
  () => link.value?.url,
  async (url) => {
    qr.value = undefined;
    if (!url || !qrFrame.value) return;
    const ink = getComputedStyle(qrFrame.value).color;
    const image = await renderQrImage(url, ink).catch(() => undefined);
    if (link.value?.url === url) qr.value = image;
  },
  // After the frame is on screen, where the colour of the code is read.
  { flush: 'post' },
);

/** Which copy button shows its check for a moment. */
const copied = ref<'link' | 'qr'>();
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
/** Not every browser can put a picture on the clipboard. */
const canCopyImage = ref(false);
const copyButtonClass = `flex flex-1 items-center justify-center gap-xs
  whitespace-nowrap px-xs`;

function showCopied(what: 'link' | 'qr') {
  copied.value = what;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copied.value = undefined), 2000);
}

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

async function copyLink() {
  if (!link.value?.url) return;
  try {
    await navigator.clipboard.writeText(link.value.url);
    showCopied('link');
  } catch {
    // A browser that refuses the clipboard still shows the address itself.
  }
}

async function copyQr() {
  if (!qr.value) return;
  try {
    // Written at once, within the click: Safari refuses a clipboard write
    // that comes after anything else has been awaited.
    await navigator.clipboard.write([
      new ClipboardItem({ [qr.value.blob.type]: qr.value.blob }),
    ]);
    showCopied('qr');
  } catch {
    // The picture itself can still be copied from the browser's menu.
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

onMounted(() => {
  canCopyImage.value =
    typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;
  void create();
});
onBeforeUnmount(() => {
  clearTimeout(copiedTimer);
  // A link left on screen is a link left usable; closing the modal ends it.
  if (link.value && !expired.value) void revoke();
});
</script>

<template>
  <ModalContainer class="max-w-110">
    <template #header
      ><div class="flex items-center gap-xs p-sm">
        <ModalTitle :title="phrase.sign_in_link" class="flex-1" />
        <span
          v-if="link && !expired"
          class="shrink-0 text-sm font-semibold text-text-2 tabular-nums"
          >{{ phrase.sign_in_link_expires(remaining) }}</span
        >
        <ModalHeaderButton
          v-if="link && !expired"
          icon="delete"
          variant="delete"
          :label="phrase.delete"
          @click="revoke"
        />
        <ModalHeaderButton
          icon="close"
          :label="phrase.close_modal"
          @click="closeModal"
        /></div
    ></template>
    <div class="flex flex-col items-center gap-md p-md">
      <p class="text-center text-sm text-text-2">
        {{ phrase.sign_in_link_description }}
      </p>
      <!-- The code's ink: dark, with a touch of the site's accent. -->
      <div
        v-if="creating || (link && !expired)"
        ref="qrFrame"
        class="flex size-56 items-center justify-center
          text-[color-mix(in_oklab,var(--color-accent)_30%,var(--color-black))]"
      >
        <img
          v-if="qr"
          :src="qr.src"
          :alt="phrase.sign_in_link_qr"
          class="size-full rounded-normal"
        />
        <Icon v-else name="loading" class="text-3xl text-text-3" />
      </div>
      <template v-if="link && !expired">
        <code
          class="w-full rounded-normal bg-bg-3 p-xs text-center text-xs
            wrap-anywhere"
          >{{ link.url }}</code
        >
        <!-- Side by side where they fit; on a narrow screen the second one
        moves to a line of its own, and both take the whole width. -->
        <div class="flex w-full flex-wrap gap-xs">
          <Button :class="copyButtonClass" @click="copyLink">
            <Icon :name="copied === 'link' ? 'check' : 'link'" />
            <span>{{ phrase.sign_in_link_copy }}</span>
          </Button>
          <Button
            v-if="canCopyImage"
            :class="copyButtonClass"
            :disabled="!qr"
            @click="copyQr"
          >
            <Icon :name="copied === 'qr' ? 'check' : 'qr-code'" />
            <span>{{ phrase.sign_in_link_copy_qr }}</span>
          </Button>
        </div>
      </template>
      <template v-else-if="!creating">
        <p v-if="expired" class="text-sm text-text-3">
          {{ phrase.sign_in_link_invalid }}
        </p>
        <Button @click="create">{{ phrase.sign_in_link_renew }}</Button>
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

<script lang="ts" setup>
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import { anyFileExtensionProfile } from '#layers/thei/shared/assets/extensions';
import { launchAssetWizard } from '#layers/thei/app/composables/asset-wizard';

definePageMeta({
  layout: 'public',
});

const maxSizeMb = ref('10');
const extensionsInput = ref('jpg, jpeg, png, webp, mp4, webm');
const resultAsset = ref<AssetVariantInfo | null>(null);
const cancelled = ref(false);
const isLaunching = ref(false);
const errorMessage = ref('');

const maxSizeBytes = computed(() => {
  const parsed = Number.parseFloat(maxSizeMb.value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed * 1024 * 1024);
});

const parsedExtensions = computed<string[] | '*'>(() => {
  const raw = extensionsInput.value.trim();
  if (!raw || raw === '*') return '*';
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((extension) => extension.trim().replace(/^\./, '').toLowerCase())
        .filter(Boolean),
    ),
  );
});

async function launchWizard() {
  isLaunching.value = true;
  cancelled.value = false;
  resultAsset.value = null;
  errorMessage.value = '';

  try {
    const acceptedExtensions = parsedExtensions.value;
    const asset = await launchAssetWizard({
      accept:
        acceptedExtensions === '*'
          ? anyFileExtensionProfile
          : acceptedExtensions,
      maxSize: maxSizeBytes.value,
      acceptedExtensions,
    });

    if (asset) {
      resultAsset.value = asset;
    } else {
      cancelled.value = true;
    }
  } catch (error) {
    cancelled.value = true;
    errorMessage.value =
      error instanceof Error ? error.message : 'Wizard failed.';
  } finally {
    isLaunching.value = false;
  }
}
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-lg p-md text-text-1">
    <section class="flex flex-col gap-md">
      <h1 class="text-3xl font-bold tracking-tight">Upload Wizard Test</h1>

      <div class="grid gap-md sm:grid-cols-2">
        <Field>
          <FieldLabel>Maximum file size, MB</FieldLabel>
          <FieldInput v-model="maxSizeMb" inputmode="decimal" />
        </Field>

        <Field>
          <FieldLabel>Allowed extensions</FieldLabel>
          <FieldInput v-model="extensionsInput" placeholder="jpg, png, mp4" />
          <FieldHint>Use * to allow any file.</FieldHint>
        </Field>
      </div>

      <div>
        <Button :disabled="isLaunching" @click="launchWizard">
          <Icon
            :name="isLaunching ? 'loading' : 'cloud-upload'"
            class="mr-xs"
          />
          <span>{{ isLaunching ? 'Wizard is open' : 'Launch Wizard' }}</span>
        </Button>
      </div>
    </section>

    <section class="flex flex-col gap-sm">
      <h2 class="text-xl font-bold tracking-tight">Server result</h2>

      <div
        class="min-h-40 rounded-normal border-2 border-border-1 bg-bg-1 p-sm"
      >
        <div
          v-if="errorMessage"
          class="mb-sm rounded-normal border border-border-error bg-bg-error
            p-sm text-sm text-text-error"
        >
          <Icon name="warning" class="mr-xs" />
          <span>{{ errorMessage }}</span>
        </div>

        <template v-if="resultAsset">
          <div class="flex flex-col gap-sm">
            <Field>
              <FieldLabel>File link</FieldLabel>
              <FieldInput :model-value="resultAsset.assetUrl" readonly />
            </Field>
            <a
              :href="resultAsset.assetUrl"
              target="_blank"
              class="text-accent underline-offset-2 hocus:underline"
            >
              {{ resultAsset.assetUrl }}
            </a>
            <pre
              class="overflow-auto rounded-normal bg-bg-2 p-sm text-xs
                text-text-2"
              >{{ JSON.stringify(resultAsset, null, 2) }}</pre
            >
          </div>
        </template>
        <template v-else>
          <div class="text-sm text-text-3">
            {{
              cancelled
                ? 'Wizard was cancelled. No server asset was selected.'
                : 'No finished upload yet.'
            }}
          </div>
        </template>
      </div>
    </section>
  </main>
</template>

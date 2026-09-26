<script lang="ts" setup>
import {
  normalizeUrlSegment,
  normalizeUrlSegmentDraft,
} from '#layers/thei/shared/language/slugify';

/**
 * The readable part of an address: a field joined to a chain button.
 *
 * While the chain is whole, the field follows `source` — a title — and cannot
 * be typed in; breaking it hands the field over. What the admin types is
 * left alone while they type and cleaned a moment after they stop, so a
 * character a URL cannot carry disappears on its own, while a gap at the end
 * stays for the next word. Leaving the field cleans it for good.
 */
const slug = defineModel<string>({ required: true });
const synchronized = defineModel<boolean>('synchronized', { required: true });
const { source, label, required } = defineProps<{
  source: string;
  label: string;
  required?: boolean;
}>();

/** How long typing has to pause before the field is cleaned. */
const NORMALIZE_DELAY_MS = 400;
let normalizeTimer: ReturnType<typeof setTimeout> | undefined;

function stopNormalizing() {
  if (normalizeTimer !== undefined) clearTimeout(normalizeTimer);
  normalizeTimer = undefined;
}

function onInput(value: string | undefined) {
  slug.value = value ?? '';
  stopNormalizing();
  normalizeTimer = setTimeout(() => {
    normalizeTimer = undefined;
    slug.value = normalizeUrlSegmentDraft(slug.value);
  }, NORMALIZE_DELAY_MS);
}

function onBlur() {
  stopNormalizing();
  slug.value = normalizeUrlSegment(slug.value);
}

onBeforeUnmount(stopNormalizing);

watch(
  () => source,
  (value) => {
    if (synchronized.value) slug.value = language.value.slugify(value);
  },
);

function toggleSynchronization() {
  stopNormalizing();
  // Read before writing: a model bound by the parent only changes once the
  // parent has taken the new value, on the next tick.
  const next = !synchronized.value;
  synchronized.value = next;
  if (next) slug.value = language.value.slugify(source);
}
</script>

<template>
  <div class="flex">
    <FieldInput
      :model-value="slug"
      type="text"
      autocomplete="off"
      spellcheck="false"
      :required
      :readonly="synchronized"
      :aria-label="label"
      wrapper-class="flex-1"
      class="rounded-r-none"
      :class="synchronized && 'text-text-2'"
      @update:model-value="onInput"
      @blur="onBlur"
    />
    <Button
      variant="secondary"
      class="h-12 rounded-l-none"
      :aria-label="
        synchronized
          ? phrase.disable_url_synchronization
          : phrase.enable_url_synchronization
      "
      :data-title-popup="
        synchronized
          ? phrase.disable_url_synchronization
          : phrase.enable_url_synchronization
      "
      @mousedown.prevent
      @click="toggleSynchronization"
    >
      <Icon
        :name="synchronized ? 'link' : 'link-broken'"
        class="scale-110 transition-colors"
        :class="synchronized ? 'text-accent' : 'text-text-3'"
      />
    </Button>
  </div>
</template>

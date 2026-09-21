<script lang="ts" setup>
/**
 * Hides one block until the reader asks for it.
 *
 * Renders nothing of its own when the block is not a spoiler — the slot goes
 * straight through, so the rhythm between blocks is the same either way.
 */
const props = defineProps<{ spoiler?: boolean }>();

const revealed = ref(false);
const hidden = computed(() => props.spoiler && !revealed.value);

function reveal() {
  revealed.value = true;
}
</script>

<template>
  <div
    v-if="spoiler"
    class="content-spoiler"
    :data-revealed="hidden ? 'false' : 'true'"
    :role="hidden ? 'button' : undefined"
    :tabindex="hidden ? 0 : undefined"
    :aria-expanded="hidden ? 'false' : undefined"
    :aria-label="hidden ? phrase.content_spoiler_reveal : undefined"
    @click="hidden && reveal()"
    @keydown.enter.prevent="hidden && reveal()"
    @keydown.space.prevent="hidden && reveal()"
  >
    <slot></slot>
  </div>
  <slot v-else></slot>
</template>

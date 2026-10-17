<script lang="ts" setup>
/**
 * The head of a form, for the AI: a word when a session changed the entity
 * while the form was open — saving over it would be refused — and the
 * proposals that belong to no one field of it. Nothing with AI off.
 */
const ai = useEntityAi();

function reload() {
  reloadNuxtApp({ persistState: false });
}
</script>

<template>
  <div
    v-if="ai?.shown.value && (ai.outdated.value || ai.offersAt('form').length)"
    class="flex flex-col gap-sm"
  >
    <div
      v-if="ai.outdated.value"
      role="status"
      class="@container rounded-normal border border-border-warning
        bg-bg-warning"
      data-ai-outdated
    >
      <div
        class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5
          gap-y-1.5 px-3 py-2 @max-[26rem]:grid-cols-[auto_minmax(0,1fr)]"
      >
        <Icon name="warning" class="text-text-warning" />
        <span class="flex min-w-0 flex-col text-sm leading-snug">
          <b class="font-semibold">{{ phrase.ai_form_outdated }}</b>
          <span class="text-xs text-text-2">{{
            phrase.ai_form_outdated_hint
          }}</span>
        </span>
        <Button
          variant="secondary"
          class="flex h-8 items-center justify-self-end text-sm
            @max-[26rem]:col-span-full pointer-coarse:h-11"
          data-ai-outdated-reload
          @click="reload"
          >{{ phrase.ai_form_reload }}</Button
        >
      </div>
    </div>
    <AiOffers place="form" />
  </div>
</template>

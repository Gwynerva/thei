<script lang="ts" setup>
import type { PublicExcerptSecret } from '#layers/thei/shared/api/public';

/**
 * An excerpt the reader may not read, in its place among the ones on its
 * parent's page, set as one they may (`PublicExcerptInline.vue`): what it is
 * about over its name, an arrow coming up to it — itself a codename when
 * that is closed to them too — then its own codename with a lock where the
 * title would be. Nothing more of it: no heading of the page's outline, no
 * link, no text.
 */
const { secret } = defineProps<{ secret: PublicExcerptSecret }>();

const subject = computed(() => publicExcerptSubjectLine(secret.about));
</script>

<template>
  <PublicExcerptHead
    :media="secret.iconMedia"
    data-public-secret
    data-excerpt-secret
  >
    <PublicPageParent
      v-if="subject"
      :parent="subject"
      arrow="start"
      class="justify-start!"
      data-excerpt-subject
    />
    <div
      class="flex min-w-0 items-start gap-xs text-xl font-bold tracking-tight
        text-text-3 sm:text-2xl"
    >
      <span class="min-w-0 italic">{{ secret.title }}</span>
      <Icon
        name="lock-close"
        :data-title-popup="phrase.secret_hint"
        :aria-label="phrase.secret_hint"
        role="img"
        class="mt-[0.25em] shrink-0 text-[0.75em] opacity-60"
      />
    </div>
    <!-- The words every secret is given with its codename, as a card of a
         secret section says them. -->
    <p
      v-if="secret.summary"
      class="text-base leading-relaxed font-semibold text-text-2"
      data-excerpt-secret-summary
    >
      {{ publicText(secret.summary) }}
    </p>
  </PublicExcerptHead>
</template>

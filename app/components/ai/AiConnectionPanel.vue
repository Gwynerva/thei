<script lang="ts" setup>
/**
 * How AI and Thei reach each other. Above, the switch for all of it; below,
 * the two ways, each on its own card, since they run in opposite directions
 * and are easy to mix up: an AI app working with the archive through an
 * access key Thei gives out, and Thei calling a model itself with an API key
 * the provider gives out. They are independent — one, both or neither.
 */
const aiEnabled = useAiEnabled();

const FACTS = ['what', 'how', 'pays', 'rights'] as const;

// Each way reads as an arrow between the site, by its own icon and name,
// and AI: the direction is the whole difference between the two.
const publicAdmin = await usePublicAdmin();
const site = useSiteUrl();
const siteName = computed(() => publicText(publicAdmin.value.displayName));
const faviconSrc = computed(() => {
  const favicon = publicAdmin.value.favicon;
  return site.path(
    favicon
      ? `/favicon/icon.${favicon.iconExtension}?v=${favicon.version}`
      : '/favicon/thei/icon.svg',
  );
});
const ENDS = { app: ['ai', 'site'], model: ['site', 'ai'] } as const;
</script>

<template>
  <div class="flex flex-col gap-lg">
    <AiSwitch />

    <!-- Before anything is on: what AI does here at all. -->
    <p v-if="!aiEnabled" class="text-sm text-text-2" data-ai-welcome>
      {{ phrase.ai_welcome }}
    </p>

    <section class="flex flex-col gap-sm">
      <!-- Side by side where both fit, one under the other where not. -->
      <div
        class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),1fr))]
          items-start gap-md"
      >
        <Box
          v-for="way in ['app', 'model'] as const"
          :key="way"
          class="flex min-w-0 flex-col"
          :data-ai-way="way"
        >
          <header
            class="flex flex-col gap-xs border-b border-border-1 p-sm sm:p-md"
          >
            <h2
              class="flex min-w-0 flex-wrap items-center gap-x-xs text-lg
                font-semibold"
            >
              <span class="sr-only">{{ phrase.ai_ways_cards[way].title }}</span>
              <template v-for="(end, index) in ENDS[way]" :key="end">
                <span v-if="index" class="text-text-3" aria-hidden="true"
                  >→</span
                >
                <span
                  v-if="end === 'ai'"
                  class="flex shrink-0 items-center gap-1"
                  aria-hidden="true"
                  ><Icon name="sparkles" class="text-accent" />{{
                    phrase.ai_page
                  }}</span
                >
                <span
                  v-else
                  class="flex min-w-0 items-center gap-1"
                  aria-hidden="true"
                  ><img
                    :src="faviconSrc"
                    alt=""
                    class="size-5 shrink-0 rounded-sm"
                  /><span class="truncate">{{ siteName }}</span></span
                >
              </template>
            </h2>
            <!-- A label beside its answer where there is room; on a phone
                 above it, so neither is squeezed into a narrow column. -->
            <dl
              class="grid gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]
                sm:gap-x-sm"
            >
              <template v-for="fact in FACTS" :key="fact">
                <dt
                  class="text-text-3 max-sm:text-xs max-sm:font-semibold
                    max-sm:not-first:pt-xs"
                >
                  {{ phrase.ai_ways_facts[fact] }}
                </dt>
                <dd class="wrap-break-word text-text-2">
                  {{ phrase.ai_ways_cards[way][fact] }}
                </dd>
              </template>
            </dl>
          </header>
          <div class="flex flex-col gap-lg p-sm sm:p-md">
            <template v-if="way === 'app'">
              <SettingsApiTokens />
            </template>
            <AiModelSettings v-else />
          </div>
        </Box>
      </div>
    </section>
  </div>
</template>

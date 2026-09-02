<script lang="ts" setup>
import type {
  PublicAction,
  PublicAssetDescriptor,
} from '#layers/thei/shared/api/public';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { accentHueCssColor } from '#layers/thei/shared/accent-color';

const props = defineProps<{
  title: string;
  summary: string;
  iconMedia: MediaDescriptor;
  bannerMedia?: MediaDescriptor;
  action?: PublicAction;
  showcase: PublicAssetDescriptor[];
  isShowcase: boolean;
  isPortfolio: boolean;
}>();
const reducedMotion = ref(true);
onMounted(() => {
  reducedMotion.value = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
});
const accent = computed(() =>
  accentHueCssColor(
    props.bannerMedia?.accentHue ?? props.iconMedia.accentHue,
    'var(--color-accent)',
  ),
);
const heroStyle = computed(() => ({ '--project-hero-accent': accent.value }));
</script>

<template>
  <header
    class="project-hero relative isolate w-full overflow-hidden text-white"
    :class="{ 'has-banner': bannerMedia }"
    :style="heroStyle"
  >
    <div
      class="relative m-auto flex w-(--width-wide) flex-col gap-md px-window
        py-lg sm:py-xl"
    >
      <div
        class="relative flex min-w-0 flex-col justify-center"
        :class="bannerMedia ? 'sm:min-h-80' : ''"
      >
        <div
          v-if="bannerMedia"
          class="hero-banner relative -mx-window -mt-lg mb-md h-44 min-w-0
            sm:absolute sm:-inset-y-md
            sm:right-[calc((var(--width-wide)-100vw)/2)] sm:left-[30%] sm:m-0
            sm:h-auto sm:w-auto"
          aria-hidden="true"
        >
          <Media
            v-bind="bannerMedia"
            :autoplay="bannerMedia.kind === 'video' && !reducedMotion"
            muted
            loop
            class="size-full"
          />
        </div>

        <div
          class="relative z-2 flex min-w-0 flex-col items-start gap-sm"
          :class="bannerMedia ? 'sm:max-w-2/3' : 'sm:max-w-4/5'"
        >
          <div class="flex min-w-0 items-center gap-md">
            <span
              class="flex size-16 shrink-0 items-center justify-center
                overflow-hidden rounded-normal bg-white/10 shadow-xl ring-1
                ring-white/15 sm:size-24"
            >
              <Media v-bind="iconMedia" class="size-full" />
            </span>
            <h1
              class="hero-title min-w-0 text-3xl leading-tight font-bold
                tracking-tight text-balance sm:text-5xl"
            >
              {{ title }}
            </h1>
          </div>
          <p
            class="hero-summary max-w-180 text-base leading-relaxed
              font-semibold text-white/72 sm:text-xl"
          >
            {{ summary }}
          </p>
          <PublicAction v-if="action" :action class="mt-xs" />
        </div>
      </div>

      <div
        v-if="showcase.length || isShowcase || isPortfolio"
        class="relative z-2 flex min-w-0 flex-col gap-sm"
      >
        <PublicAssetGallery
          v-if="showcase.length"
          :items="showcase"
          variant="hero"
        />
        <div
          v-if="isShowcase || isPortfolio"
          class="flex flex-wrap items-center gap-xs"
        >
          <span
            v-if="isShowcase"
            class="inline-flex cursor-help items-center gap-2 rounded-full
              bg-white/9 px-xs py-1 text-sm font-semibold text-white/78 ring-1
              ring-white/12"
            :data-title-popup="phrase.project_showcase_badge_hint"
          >
            <Icon name="star" />
            <span>{{ phrase.project_showcase_badge }}</span>
          </span>
          <span
            v-if="isPortfolio"
            class="inline-flex cursor-help items-center gap-2 rounded-full
              bg-white/9 px-xs py-1 text-sm font-semibold text-white/78 ring-1
              ring-white/12"
            :data-title-popup="phrase.project_portfolio_badge_hint"
          >
            <Icon name="case-important" />
            <span>{{ phrase.project_portfolio_badge }}</span>
          </span>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
@reference "../../styles/main.css";
.project-hero {
  background: color-mix(in oklab, var(--project-hero-accent) 42%, black);
}
.hero-banner {
  opacity: 0.94;
  mask-image: linear-gradient(to bottom, black 0%, black 90%, transparent 100%);
}
.hero-banner :deep(img),
.hero-banner :deep(video) {
  object-position: center center;
}
.hero-title {
  text-shadow:
    0 0.08em 0.34em color-mix(in oklab, var(--project-hero-accent) 56%, black),
    0 0.03em 0.1em rgb(0 0 0 / 72%);
}
.hero-summary {
  text-shadow:
    0 0.08em 0.3em color-mix(in oklab, var(--project-hero-accent) 48%, black),
    0 0.03em 0.08em rgb(0 0 0 / 64%);
}

@variant sm {
  .hero-banner {
    mask-image: radial-gradient(
      ellipse 66% 64% at 62% 50%,
      black 28%,
      rgb(0 0 0 / 92%) 50%,
      rgb(0 0 0 / 46%) 78%,
      transparent 100%
    );
  }
}
</style>

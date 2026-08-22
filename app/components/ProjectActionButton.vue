<script lang="ts" setup>
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type {
  ProjectActionBackgroundRepeat,
  ProjectActionBackgroundSize,
  ProjectActionBackgroundMode,
  ProjectActionTarget,
} from '#layers/thei/shared/project-action';
import { projectActionContextAccentHue } from '#layers/thei/shared/project-action';

const props = defineProps<{
  text: string;
  accentColor: string;
  target: ProjectActionTarget;
  href?: string;
  iconMedia?: MediaDescriptor;
  fileMedia?: MediaDescriptor;
  backgroundMedia?: MediaDescriptor;
  faviconMedia?: MediaDescriptor;
  useFavicon?: boolean;
  backgroundMode: ProjectActionBackgroundMode;
  backgroundSize: ProjectActionBackgroundSize;
  backgroundRepeat: ProjectActionBackgroundRepeat;
  interactive?: boolean;
  activate?: () => void;
}>();

const displayedIcon = computed(
  () => props.iconMedia ?? (props.useFavicon ? props.faviconMedia : undefined),
);
const neutralColor = 'var(--color-text-3)';
const hueColor = (hue: number | undefined) =>
  hue === undefined
    ? neutralColor
    : `oklch(var(--lightness-accent) var(--chroma-accent) ${hue})`;
const manualAccent = computed(() =>
  /^#[0-9a-fA-F]{6}$/.test(props.accentColor)
    ? props.accentColor
    : 'var(--color-accent)',
);
const contextualAccentHue = computed(() =>
  projectActionContextAccentHue(props.backgroundMode, {
    icon: props.iconMedia?.accentHue,
    file: props.fileMedia?.accentHue,
    link: props.faviconMedia?.accentHue,
  }),
);
const gradientColor = computed(() => {
  if (
    props.backgroundMode === 'link-gradient' ||
    props.backgroundMode === 'icon-gradient' ||
    props.backgroundMode === 'file-gradient'
  )
    return hueColor(contextualAccentHue.value);
  if (props.backgroundMode === 'standard-gradient')
    return 'var(--color-accent)';
  if (props.backgroundMode === 'asset' && !props.backgroundMedia)
    return neutralColor;
  return manualAccent.value;
});
const highlightColor = computed(() => {
  if (props.backgroundMode === 'asset')
    return hueColor(props.backgroundMedia?.accentHue);
  if (
    props.backgroundMode === 'link-gradient' ||
    props.backgroundMode === 'icon-gradient' ||
    props.backgroundMode === 'file-gradient'
  )
    return hueColor(contextualAccentHue.value);
  if (props.backgroundMode === 'standard-gradient')
    return 'var(--color-accent)';
  return manualAccent.value;
});
const backgroundSize = computed(() => {
  if (props.backgroundSize === 'natural') return 'auto';
  if (props.backgroundSize === 'stretch') return '100% 100%';
  return props.backgroundSize;
});
const buttonStyle = computed(() => ({
  '--action-accent': manualAccent.value,
  '--action-gradient': gradientColor.value,
  '--action-highlight': highlightColor.value,
  '--action-image': props.backgroundMedia
    ? `url("${props.backgroundMedia.src.replaceAll('"', '\\"')}")`
    : 'none',
  '--action-size': backgroundSize.value,
  '--action-repeat': props.backgroundRepeat,
}));

function activate() {
  if (!props.href) props.activate?.();
}
</script>

<template>
  <component
    :is="href ? 'a' : 'button'"
    :href="href"
    :disabled="href || interactive ? undefined : true"
    :target="href ? '_blank' : undefined"
    :rel="href ? 'noopener noreferrer' : undefined"
    class="project-action-button inline-flex min-h-12 max-w-full items-center
      justify-center gap-xs overflow-hidden rounded-normal border px-md py-xs
      font-semibold text-white shadow-md transition enabled:cursor-pointer
      disabled:cursor-not-allowed disabled:opacity-55 sm:max-w-75"
    :class="{
      'has-image': backgroundMode === 'asset' && backgroundMedia,
      'has-gradient': backgroundMode !== 'asset' || !backgroundMedia,
    }"
    :style="buttonStyle"
    @click="activate"
  >
    <Media
      v-if="displayedIcon"
      v-bind="displayedIcon"
      class="action-icon size-6 shrink-0 rounded-xs object-cover"
    />
    <Icon
      v-else
      :name="target === 'file' ? 'file' : 'external-link'"
      class="action-icon shrink-0 text-xl"
    />
    <span class="action-label truncate">{{ text || 'Кнопка действия' }}</span>
  </component>
</template>

<style scoped>
.project-action-button {
  --action-dark-shadow: color-mix(in oklab, var(--action-highlight) 30%, black);
  border-color: color-mix(in oklab, var(--action-highlight) 70%, transparent);
  background-color: var(--action-accent);
}
.project-action-button.has-gradient {
  background-image: linear-gradient(
    to top right,
    color-mix(in oklab, var(--action-gradient) 72%, black),
    color-mix(in oklab, var(--action-gradient) 72%, white)
  );
}
.project-action-button:is(:hover, :focus-visible) {
  border-color: var(--action-highlight);
  box-shadow:
    0 0 0.35rem color-mix(in oklab, var(--action-highlight) 55%, transparent),
    0 0 1.1rem color-mix(in oklab, var(--action-highlight) 35%, transparent);
}
.project-action-button.has-image {
  border-color: transparent;
  background-color: transparent;
  background-image: var(--action-image);
  background-position: center;
  background-repeat: var(--action-repeat);
  background-size: var(--action-size);
}
.action-label {
  text-shadow:
    0 0 0.28em var(--action-dark-shadow),
    0 0.08em 0.18em var(--action-dark-shadow);
}
.action-icon {
  filter: drop-shadow(0 0 0.24em var(--action-dark-shadow))
    drop-shadow(0 0.08em 0.14em var(--action-dark-shadow));
}
@media (prefers-reduced-motion: reduce) {
  .project-action-button {
    transition: none;
  }
}
</style>

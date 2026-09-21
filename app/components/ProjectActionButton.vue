<script lang="ts" setup>
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type {
  ProjectActionBackgroundRepeat,
  ProjectActionBackgroundSize,
  ProjectActionBackgroundMode,
  ProjectActionTarget,
} from '#layers/thei/shared/project-action';
import { projectActionAutoAccent } from '#layers/thei/shared/project-action';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';

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
  /** Renders an inert copy of the button, as in the editor preview. */
  preview?: boolean;
}>();

const displayedIcon = computed(
  () => props.iconMedia ?? (props.useFavicon ? props.faviconMedia : undefined),
);
const siteAccent = 'var(--color-accent)';
const manualAccent = computed(() =>
  /^#[0-9a-fA-F]{6}$/.test(props.accentColor) ? props.accentColor : siteAccent,
);
const hasImage = computed(
  () => props.backgroundMode === 'asset' && !!props.backgroundMedia,
);
const gradientColor = computed(() => {
  switch (props.backgroundMode) {
    case 'accent-gradient':
      return manualAccent.value;
    case 'auto-gradient':
      return imageAccentCssColor(
        projectActionAutoAccent(props.target, {
          icon: displayedIcon.value?.accent,
          file: props.fileMedia?.accent,
          favicon: props.faviconMedia?.accent,
        }),
        siteAccent,
      );
    case 'asset':
      return props.backgroundMedia
        ? imageAccentCssColor(props.backgroundMedia.accent)
        : 'var(--color-text-3)';
    default:
      return siteAccent;
  }
});
const backgroundSize = computed(() => {
  if (props.backgroundSize === 'natural') return 'auto';
  if (props.backgroundSize === 'stretch') return '100% 100%';
  return props.backgroundSize;
});
const buttonStyle = computed(() => ({
  '--action-color': gradientColor.value,
  '--action-image': props.backgroundMedia
    ? `url("${props.backgroundMedia.src.replaceAll('"', '\\"')}")`
    : 'none',
  '--action-size': backgroundSize.value,
  '--action-repeat': props.backgroundRepeat,
}));
</script>

<template>
  <component
    :is="preview ? 'span' : 'a'"
    :href="preview ? undefined : sitePath(href)"
    :target="preview ? undefined : '_blank'"
    :rel="preview ? undefined : 'noopener noreferrer'"
    class="project-action-button inline-flex min-h-12 max-w-full items-center
      justify-center gap-xs overflow-hidden rounded-normal border px-md py-xs
      font-semibold text-white shadow-md transition sm:max-w-75"
    :class="[
      hasImage ? 'has-image' : 'has-gradient',
      preview ? 'cursor-default' : 'cursor-pointer',
    ]"
    :style="buttonStyle"
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
    <span class="action-label truncate">{{
      text || phrase.project_action_placeholder
    }}</span>
  </component>
</template>

<style scoped>
.project-action-button {
  --action-dark-shadow: color-mix(in oklab, var(--action-color) 30%, black);
  border-color: color-mix(in oklab, var(--action-color) 70%, transparent);
  background-color: var(--action-color);
}
.project-action-button.has-gradient {
  background-image: linear-gradient(
    to top right,
    color-mix(in oklab, var(--action-color) 72%, black),
    color-mix(in oklab, var(--action-color) 72%, white)
  );
}
.project-action-button:is(:hover, :focus-visible) {
  border-color: var(--action-color);
  box-shadow:
    0 0 0.35rem color-mix(in oklab, var(--action-color) 55%, transparent),
    0 0 1.1rem color-mix(in oklab, var(--action-color) 35%, transparent);
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

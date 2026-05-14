<script lang="ts" setup>
import { useInstallPhrases } from '../install-language';
import {
  visualsAccentHues,
  type VisualsFontStyle,
  type VisualsTheme,
} from '#layers/thei/app/scripts/visuals';
import type { FieldOptionValue } from '#layers/thei/app/components/field/FieldOptions.vue';

const visuals = useVisuals();

const {
  visuals: visuals_title,
  visuals_description,
  theme,
  theme_system,
  theme_light,
  theme_dark,
  accent_color,
  font_style,
  font_sans,
  font_serif,
} = useInstallPhrases();

const themeOptions: Record<VisualsTheme, FieldOptionValue> = {
  system: { icon: 'contrast', title: theme_system },
  light: { icon: 'sun', title: theme_light },
  dark: { icon: 'moon', title: theme_dark },
} as const;

const fontStyleOptions: Record<VisualsFontStyle, FieldOptionValue> = {
  sans: { icon: 'font-sans', title: font_sans },
  serif: { icon: 'font-serif', title: font_serif },
};
</script>

<template>
  <Box icon="palette" :title="visuals_title" :description="visuals_description">
    <div class="flex flex-col gap-md">
      <Field>
        <FieldLabel>{{ theme }}</FieldLabel>
        <FieldOptions :options="themeOptions" v-model="visuals.theme" />
      </Field>

      <Field>
        <FieldLabel>{{ accent_color }}</FieldLabel>
        <div class="flex flex-wrap gap-md">
          <button
            v-for="accentHue of visualsAccentHues"
            @click="visuals.accentHue = accentHue"
            :style="`--_accent-variant: oklch(var(--lightness-accent) var(--chroma-accent) ${accentHue})`"
            :class="[
              visuals.accentHue === accentHue
                ? 'ring-bw-reverse'
                : 'ring-transparent hactive:ring-bw-reverse/50',
            ]"
            class="size-[28px] shrink-0 cursor-pointer rounded-full
              bg-(--_accent-variant) ring-2 ring-offset-2 ring-offset-bg-2
              transition"
          ></button>
        </div>
      </Field>

      <Field>
        <FieldLabel>{{ font_style }}</FieldLabel>
        <FieldOptions :options="fontStyleOptions" v-model="visuals.fontStyle" />
      </Field>
    </div>
  </Box>
</template>

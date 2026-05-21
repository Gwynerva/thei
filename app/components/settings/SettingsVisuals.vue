<script lang="ts" setup>
import {
  visualsAccentHues,
  type VisualsFontStyle,
  type VisualsTheme,
} from '#layers/thei/app/scripts/visuals';
import type { FieldOptionValue } from '#layers/thei/app/components/field/FieldOptions.vue';

const visuals = useVisuals();

const themeOptions: ComputedRef<Record<VisualsTheme, FieldOptionValue>> =
  computed(() => ({
    system: { icon: 'contrast', title: phrase.value.theme_system },
    light: { icon: 'sun', title: phrase.value.theme_light },
    dark: { icon: 'moon', title: phrase.value.theme_dark },
  }));

const fontStyleOptions: ComputedRef<
  Record<VisualsFontStyle, FieldOptionValue>
> = computed(() => ({
  sans: { icon: 'font-sans', title: phrase.value.font_sans },
  serif: { icon: 'font-serif', title: phrase.value.font_serif },
}));
</script>

<template>
  <div>
    <SectionHeader
      icon="palette"
      :title="phrase.visuals"
      :description="phrase.visuals_description"
      class="mb-md"
    />
    <Box>
      <div class="flex flex-col gap-md p-sm sm:p-md">
        <Field>
          <FieldLabel>{{ phrase.theme }}</FieldLabel>
          <FieldOptions :options="themeOptions" v-model="visuals.theme" />
        </Field>

        <Field>
          <FieldLabel>{{ phrase.accent_color }}</FieldLabel>
          <div class="flex flex-wrap gap-md">
            <button
              v-for="accentHue of visualsAccentHues"
              @click="visuals.accentHue = accentHue"
              :style="`--_accent-variant: oklch(var(--lightness-accent) var(--chroma-accent) ${accentHue})`"
              :class="[
                visuals.accentHue === accentHue
                  ? 'ring-bw-reverse'
                  : 'ring-transparent hocus:ring-bw-reverse/50',
              ]"
              class="size-[20px] shrink-0 cursor-pointer rounded-full
                bg-(--_accent-variant) ring-2 ring-offset-2 ring-offset-bg-2
                transition sm:size-[26px]"
            ></button>
          </div>
        </Field>

        <Field>
          <FieldLabel>{{ phrase.font_style }}</FieldLabel>
          <FieldOptions
            :options="fontStyleOptions"
            v-model="visuals.fontStyle"
          />
        </Field>
      </div>
    </Box>
  </div>
</template>

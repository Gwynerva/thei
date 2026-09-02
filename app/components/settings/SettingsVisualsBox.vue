<script lang="ts" setup>
import {
  visualsAccentHues,
  type VisualsFontStyle,
  type VisualsTheme,
} from '#layers/thei/app/scripts/visuals';
import type { FieldOptionValue } from '#layers/thei/app/components/field/FieldOptions.vue';
import { accentHueCssColor } from '#layers/thei/shared/accent-color';

const { showPublicViewMode = false } = defineProps<{
  showPublicViewMode?: boolean;
}>();

const visuals = useVisuals();
const publicViewAsGuest = usePublicViewAsGuest();
const publicViewMode = computed({
  get: () => (publicViewAsGuest.value ? 'guest' : 'admin'),
  set: (mode: string) => {
    publicViewAsGuest.value = mode === 'guest';
  },
});
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
const publicViewOptions = computed<Record<string, FieldOptionValue>>(() => ({
  admin: { icon: 'visibility', title: phrase.value.public_view_admin },
  guest: { icon: 'visibility-off', title: phrase.value.public_view_guest },
}));
</script>

<template>
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
            :key="accentHue"
            type="button"
            :aria-label="`${phrase.accent_color}: ${accentHue}`"
            @click="visuals.accentHue = accentHue"
            :style="{
              '--_accent-variant': accentHueCssColor(
                accentHue,
                'var(--color-accent)',
              ),
            }"
            :class="[
              visuals.accentHue === accentHue
                ? 'ring-bw-reverse'
                : 'ring-transparent hocus:ring-bw-reverse/50',
            ]"
            class="size-5 shrink-0 cursor-pointer rounded-full
              bg-(--_accent-variant) ring-2 ring-offset-2 ring-offset-bg-2
              transition sm:size-6"
          ></button>
        </div>
      </Field>
      <Field>
        <FieldLabel>{{ phrase.font_style }}</FieldLabel>
        <FieldOptions :options="fontStyleOptions" v-model="visuals.fontStyle" />
      </Field>
      <Field v-if="showPublicViewMode">
        <FieldLabel>{{ phrase.public_view_mode }}</FieldLabel>
        <FieldOptions :options="publicViewOptions" v-model="publicViewMode" />
        <FieldHint>
          {{
            publicViewMode === 'admin'
              ? phrase.public_view_admin_hint
              : phrase.public_view_guest_hint
          }}
        </FieldHint>
      </Field>
    </div>
  </Box>
</template>

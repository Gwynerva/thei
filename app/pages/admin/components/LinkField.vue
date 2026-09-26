<script lang="ts" setup>
import SlugInput from './SlugInput.vue';

const title = defineModel<string>('title', { required: true });
const readableSlug = defineModel<string>('humanReadableSlug', {
  required: true,
});
const publicId = defineModel<string>('publicId', { required: true });

const props = defineProps<{
  entityName?: string;
  linkDescription: (slug: string, publicId: string) => string;
  publicIdError?: string;
}>();

const entityName = computed(() => props.entityName ?? phrase.value.project);

function slugify(value: string) {
  return language.value.slugify(value);
}

const synchronized = ref(readableSlug.value === slugify(title.value));

const linkDescription = computed(() =>
  props.linkDescription(readableSlug.value, publicId.value),
);
</script>

<template>
  <Field class="w-full">
    <FieldLabel>{{ phrase.public_link(entityName) }}</FieldLabel>
    <div class="flex flex-wrap gap-md">
      <div class="min-w-50 flex-1">
        <FieldLabel class="mb-xs text-sm font-normal text-text-2">
          {{ phrase.human_readable_url }}
        </FieldLabel>
        <SlugInput
          v-model="readableSlug"
          v-model:synchronized="synchronized"
          :source="title"
          :label="phrase.human_readable_url"
        />
      </div>
      <div class="min-w-50 flex-1">
        <FieldLabel
          class="mb-xs text-sm font-normal text-text-2"
          :on-activate="() => undefined"
        >
          {{ phrase.public_id }}
        </FieldLabel>
        <div class="flex">
          <FieldInput
            v-model="publicId"
            type="text"
            readonly
            autocomplete="off"
            spellcheck="false"
            :aria-label="phrase.public_id"
            wrapper-class="flex-1"
            class="rounded-r-none text-text-2"
            :error="
              props.publicIdError && {
                message: props.publicIdError,
                hard: true,
              }
            "
          />
          <Button
            variant="secondary"
            class="h-12 rounded-l-none"
            :data-title-popup="phrase.generate_random"
            @mousedown.prevent
            @click="publicId = randomId(14)"
          >
            <Icon name="dice" class="scale-125" />
          </Button>
        </div>
      </div>
    </div>
    <FieldHint>{{ linkDescription }}</FieldHint>
  </Field>
</template>

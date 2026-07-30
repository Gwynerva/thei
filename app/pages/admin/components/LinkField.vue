<script lang="ts" setup>
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

watch(title, (value) => {
  if (synchronized.value) readableSlug.value = slugify(value);
});

function toggleSynchronization() {
  synchronized.value = !synchronized.value;
  if (synchronized.value) readableSlug.value = slugify(title.value);
}

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
        <div class="flex">
          <FieldInput
            v-model="readableSlug"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :readonly="synchronized"
            :aria-label="phrase.human_readable_url"
            wrapper-class="flex-1"
            class="rounded-r-none"
            :class="synchronized && 'text-text-2'"
          />
          <Button
            variant="secondary"
            class="h-12 rounded-l-none"
            :data-title-popup="
              synchronized
                ? phrase.disable_url_synchronization
                : phrase.enable_url_synchronization
            "
            @mousedown.prevent
            @click="toggleSynchronization"
          >
            <Icon
              :name="synchronized ? 'link' : 'link-broken'"
              class="scale-110 transition-colors"
              :class="synchronized ? 'text-accent' : 'text-text-3'"
            />
          </Button>
        </div>
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

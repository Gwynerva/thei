<script lang="ts" setup>
const emit = defineEmits<{
  password: [string];
}>();

//
//
//

const sampleNicknames = [
  'Gwynerva',
  'Destroyer',
  'TheMastermind',
  'TheConqueror',
  'TheGreat',
];

const sampleName = computed(() => {
  const samplePool = [...language.value.sampleDisplayNames, ...sampleNicknames];

  return samplePool[Math.floor(Math.random() * samplePool.length)]!;
});

const displayNameElement = shallowRef<HTMLInputElement>();
const displayNameModel = defineModel<string>('displayName');

//
//
//

const sampleSecretPhrase = computed(() => {
  const samplePool = language.value.sampleSecretPhrases;

  return samplePool[Math.floor(Math.random() * samplePool.length)]!;
});
const secretPhraseElement = shallowRef<HTMLInputElement>();
const secretPhraseModel = defineModel<string>('secretPhrase');

//
//
//

const passwordElement = shallowRef<HTMLInputElement>();
const confirmPasswordElement = shallowRef<HTMLInputElement>();
const password = ref('');
const confirmPassword = ref('');

watchEffect(() => {
  emit(
    'password',
    password.value === confirmPassword.value ? password.value : '',
  );
});
</script>

<template>
  <div>
    <SectionHeader
      icon="person-key"
      :title="phrase.admin_data"
      :description="phrase.admin_data_description"
      class="mb-md"
    />
    <Box>
      <div class="flex flex-col gap-md p-sm sm:p-md">
        <Field>
          <FieldLabel :focus="displayNameElement">
            {{ phrase.how_to_address_you }}
          </FieldLabel>
          <FieldInput
            v-model="displayNameModel"
            v-on:element="displayNameElement = $event"
            :placeholder="sampleName"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :required="true"
          />
          <FieldHint>
            {{ phrase.display_name_hint(displayName || sampleName) }}
          </FieldHint>
        </Field>

        <Field>
          <FieldLabel :focus="secretPhraseElement">
            {{ phrase.secret_phrase }}
          </FieldLabel>
          <FieldInput
            v-model="secretPhraseModel"
            v-on:element="secretPhraseElement = $event"
            :placeholder="sampleSecretPhrase"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :required="true"
          />
          <FieldHint>
            {{ phrase.secret_phrase_hint }}
          </FieldHint>
        </Field>

        <div class="flex flex-wrap gap-md">
          <Field class="min-w-[200px] flex-1">
            <FieldLabel :focus="passwordElement">
              {{ phrase.password }}
            </FieldLabel>
            <FieldInput
              v-model="password"
              v-on:element="passwordElement = $event"
              type="password"
              autocomplete="off"
              :required="true"
            />
          </Field>

          <Field class="flex-1">
            <FieldLabel :focus="confirmPasswordElement">
              {{ phrase.repeat_password }}
            </FieldLabel>
            <FieldInput
              v-model="confirmPassword"
              v-on:element="confirmPasswordElement = $event"
              type="password"
              autocomplete="off"
              :error="password !== confirmPassword && 'Не совпадает бля!'"
            />
          </Field>
        </div>
      </div>
    </Box>
  </div>
</template>

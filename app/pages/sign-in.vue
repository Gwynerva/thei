<script lang="ts" setup>
if (useIsAdmin().value) {
  await navigateTo('/admin/');
}

await useAdminTabTitle(computed(() => phrase.value.sign_in));
const publicAdmin = await usePublicAdmin();

const signInError = ref('');
const signingIn = ref(false);
const cooldown = ref(0);

const secretPhraseElement = ref<HTMLInputElement>();
const secretPhrase = ref('');

const passwordElement = ref<HTMLInputElement>();
const password = ref('');

const signInData = computed(() => {
  return {
    secretPhrase: secretPhrase.value.trim(),
    password: password.value.trim(),
  };
});

const canSignIn = computed(() => {
  return (
    !signingIn.value &&
    !cooldown.value &&
    signInData.value.secretPhrase &&
    signInData.value.password
  );
});

async function signIn() {
  if (!canSignIn.value) {
    return;
  }

  signInError.value = '';
  signingIn.value = true;
  try {
    const signInResponse = await $fetch('/api/sign-in/', {
      method: 'POST',
      body: signInData.value,
    });

    if (signInResponse.type === 'error') {
      throw signInResponse.message;
    }

    window.location.href = '/admin/';
  } catch (error) {
    signInError.value = error instanceof Error ? error.message : String(error);
    signingIn.value = false;
    cooldown.value = 3;
  }
}

function submit() {
  if (!secretPhrase.value.trim()) {
    secretPhraseElement.value?.focus();
  } else if (!password.value.trim()) {
    passwordElement.value?.focus();
  } else {
    signIn();
  }
}

let cooldownTimer: ReturnType<typeof setTimeout> | undefined;

watch(cooldown, (newCooldown) => {
  if (newCooldown === 0) {
    return;
  }

  clearTimeout(cooldownTimer);
  cooldownTimer = setTimeout(() => {
    cooldown.value = newCooldown - 1;
  }, 1000);
});

watch(secretPhraseElement, (newElement) => {
  if (newElement) {
    newElement.focus();
  }
});
</script>

<template>
  <AdminGridWrapper>
    <div class="flex min-h-screen min-w-screen items-center justify-center">
      <section
        class="intems-center rounded-normal flex min-h-screen
          w-[min(380px,100%)] min-w-screen flex-col justify-center gap-md border
          border-border-1 bg-bg-2 p-md shadow-lg shadow-shadow-1 sm:min-h-auto
          sm:min-w-auto"
      >
        <div class="flex items-center justify-around">
          <Media
            :src="publicAdmin.avatarUrl"
            class="size-[64px] rounded-full ring-2 ring-accent ring-offset-2
              ring-offset-bg-2"
          />
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold">
            {{ publicAdmin.displayName }}
          </div>
          <div class="text-text-2">
            {{ phrase.thei_admin_panel_sign_in }}
          </div>
        </div>
        <Field>
          <FieldLabel :focus="secretPhraseElement" class="tracking-tight">
            {{ phrase.secret_phrase }}
          </FieldLabel>
          <FieldInput
            type="text"
            v-model="secretPhrase"
            v-on:element="secretPhraseElement = $event"
            autocomplete="off"
            spellcheck="false"
            class="text-sm"
            v-on:submit="submit"
          />
        </Field>
        <Field>
          <FieldLabel :focus="passwordElement" class="tracking-tight">
            {{ phrase.password }}
          </FieldLabel>
          <FieldInput
            type="password"
            v-model="password"
            v-on:element="passwordElement = $event"
            autocomplete="off"
            spellcheck="false"
            class="text-sm"
            v-on:submit="submit"
          />
        </Field>
        <Button
          @click="signIn"
          :disabled="!canSignIn"
          class="text-lg font-semibold"
        >
          <template v-if="signingIn">
            <Icon name="loading" class="mr-xs" />
            <span>
              {{ phrase.signing_in }}
            </span>
          </template>
          <template v-else>
            {{ phrase.sign_in + (cooldown ? ` (${cooldown})` : '') }}
          </template>
        </Button>
        <div
          v-if="signInError"
          class="rounded-normal border border-border-error bg-bg-error p-xs
            text-xs text-text-error"
        >
          <Icon name="warning" class="mr-xs" />
          <span>{{ signInError }}</span>
        </div>
      </section>
    </div>
  </AdminGridWrapper>
</template>

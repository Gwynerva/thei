<script lang="ts" setup>
import userSvg from '~/assets/fallback/user.svg?raw';
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
</script>

<template>
  <AdminGridWrapper>
    <div class="flex min-h-screen min-w-screen items-center justify-center">
      <section
        class="intems-center flex min-h-screen w-[min(380px,100%)] min-w-screen
          flex-col justify-center gap-md rounded-normal border border-border-1
          bg-bg-2 p-md shadow-lg shadow-shadow-1 sm:min-h-auto sm:min-w-auto"
      >
        <div class="flex items-center justify-around">
          <div
            class="size-[64px] overflow-clip rounded-full ring-2 ring-border-3
              ring-offset-2 ring-offset-bg-2"
          >
            <Media
              v-if="publicAdmin.avatarUrl"
              :src="publicAdmin.avatarUrl"
              class="size-full"
            />
            <TintedIcon
              v-else
              :svg="userSvg"
              :seed="publicAdmin.displayName"
              class="size-full"
            />
          </div>
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
          <FieldLabel class="tracking-tight">
            {{ phrase.secret_phrase }}
          </FieldLabel>
          <FieldInput
            type="text"
            v-model="secretPhrase"
            autofocus
            v-on:element="secretPhraseElement = $event"
            autocomplete="off"
            spellcheck="false"
            class="text-sm"
            v-on:submit="submit"
          />
        </Field>
        <Field>
          <FieldLabel class="tracking-tight">
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

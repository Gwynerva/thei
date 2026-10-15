<script lang="ts" setup>
import type { FieldOptions } from '#layers/thei/app/components/field/FieldOptions.vue';
import type { ApiTokenListResponse } from '#layers/thei/shared/api-token';

/**
 * How to connect an AI app, app by app: where in it to go, the address to
 * give it, and what happens next — signing in on this site, where the owner
 * allows it, or an access key for an app that cannot sign in. Without HTTPS
 * an app cannot sign in, and is pointed to a key instead.
 */
const { connect } = defineProps<{
  connect: ApiTokenListResponse['connect'];
}>();

type App = 'claude' | 'chatgpt' | 'claude-code' | 'other';
const app = ref<App>('claude');

const appOptions = computed<FieldOptions>(() =>
  Object.fromEntries(
    (['claude', 'chatgpt', 'claude-code', 'other'] as const).map((key) => [
      key,
      { title: phrase.value.ai_connect_apps[key] },
    ]),
  ),
);

/** An app that connects only by signing in, where signing in is not possible. */
const blocked = computed(
  () => !connect.signIn && (app.value === 'claude' || app.value === 'chatgpt'),
);
const command = computed(
  () => `claude mcp add --transport http thei ${connect.endpoint}`,
);
const { copied, copyText } = useClipboardCopy<'address' | 'command'>();
</script>

<template>
  <section class="flex flex-col gap-sm" data-ai-connect-guide>
    <h3 class="flex items-center gap-xs font-semibold text-text-1">
      <Icon name="link" class="shrink-0" aria-hidden="true" />{{
        phrase.ai_connect_title
      }}
    </h3>
    <FieldOptions v-model="app" :options="appOptions" />

    <p v-if="blocked" class="text-sm text-text-warning">
      <Icon name="warning" class="mr-xs" />{{ phrase.ai_connect_no_sign_in }}
    </p>
    <ol
      v-else
      class="flex list-decimal flex-col gap-1 pl-lg text-sm text-text-2"
    >
      <li v-for="(step, index) in phrase.ai_connect_steps[app]" :key="index">
        {{ step }}
      </li>
    </ol>

    <div class="flex items-center gap-xs">
      <code
        class="scrollbar-mini min-w-0 flex-1 overflow-x-auto rounded-normal
          bg-bg-3 p-xs text-sm break-all"
        data-ai-connect-address
        >{{ app === 'claude-code' ? command : connect.endpoint }}</code
      >
      <Button
        variant="secondary"
        size="icon"
        class="pointer-coarse:size-11"
        :aria-label="phrase.copy"
        :data-title-popup="
          copied === 'address' || copied === 'command'
            ? phrase.copied
            : phrase.copy
        "
        @click="
          app === 'claude-code'
            ? copyText('command', command)
            : copyText('address', connect.endpoint)
        "
      >
        <Icon
          :name="
            copied === 'address' || copied === 'command' ? 'check' : 'files'
          "
        />
      </Button>
    </div>

    <p
      v-if="connect.proxyRule && connect.signIn"
      class="text-xs wrap-break-word text-text-3"
    >
      {{ phrase.ai_connect_proxy }}
      <code class="break-all text-text-2">{{ connect.proxyRule.from }}</code>
      →
      <code class="break-all text-text-2">{{ connect.proxyRule.to }}</code>
    </p>
  </section>
</template>

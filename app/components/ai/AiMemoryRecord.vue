<script lang="ts" setup>
import type { AiEntityRef } from '#layers/thei/shared/ai';
import {
  AI_MEMORY_TEXT_MAX,
  type AiMemoryItem,
} from '#layers/thei/shared/ai-memory';

/**
 * One thing the AI keeps: a fact, or something never to be offered — what
 * it says, where it came from, and the owner's answers to it. A fact is
 * said anew in place; a «never» is only let go.
 */
const props = defineProps<{
  item: AiMemoryItem;
  /** The entity whose list it is in: a pair's record names the other end. */
  about?: AiEntityRef;
  /** Said before the text: the kind a record is about. */
  label?: string;
}>();
const emit = defineEmits<{ forget: []; saved: [item: AiMemoryItem] }>();

const never = computed(() => props.item.type === 'never');
/** The other end of a pair, seen from the entity whose list it is in. */
const other = computed(() => {
  const { entity, other } = props.item;
  if (!entity || !other) return undefined;
  return props.about?.ref === other.ref ? entity : other;
});

const editing = ref(false);
const draft = ref('');
const busy = ref(false);
const error = ref('');

function edit() {
  draft.value = props.item.text;
  error.value = '';
  editing.value = true;
}

async function save() {
  const text = draft.value.trim();
  if (busy.value || !text) return;
  if (text === props.item.text) {
    editing.value = false;
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const item = await $fetch<AiMemoryItem>(
      `/api/admin/ai/memory/${props.item.memoryUuid}`,
      { method: 'PATCH', body: { text } },
    );
    emit('saved', item);
    editing.value = false;
  } catch (caught) {
    error.value = errorMessage(caught, phrase.value.ai_error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div
    class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5
      gap-y-0.5 border-t border-border-1/70 px-sm py-2.5 first:border-t-0"
    :data-memory-record="item.memoryUuid"
  >
    <Icon
      :name="never ? 'visibility-off' : 'brain'"
      class="mt-1 text-text-2"
      :aria-label="never ? phrase.ai_action_never : undefined"
    />

    <div v-if="editing" class="col-span-2 flex flex-col gap-xs">
      <FieldTextarea
        v-model="draft"
        rows="2"
        :maxlength="AI_MEMORY_TEXT_MAX"
        :aria-label="phrase.ai_memory_edit"
        data-memory-edit-text
        @keydown.enter.exact.prevent="save"
        @keydown.esc.prevent="editing = false"
      />
      <div class="flex items-center gap-xs">
        <span v-if="error" class="mr-auto text-xs text-text-error">{{
          error
        }}</span>
        <Button
          variant="secondary"
          class="ml-auto flex h-8 items-center bg-transparent text-sm
            pointer-coarse:h-11"
          @click="editing = false"
          >{{ phrase.ai_memory_cancel }}</Button
        >
        <Button
          class="flex h-8 items-center gap-xs text-sm pointer-coarse:h-11"
          :disabled="busy || !draft.trim()"
          data-memory-edit-save
          @click="save"
        >
          <Icon v-if="busy" name="loading" />{{ phrase.save }}
        </Button>
      </div>
    </div>

    <template v-else>
      <p class="min-w-0 text-sm leading-normal wrap-anywhere">
        <b v-if="label" class="font-semibold">{{ label }}: </b>
        <span v-if="other" class="mr-1 inline-block align-middle"
          ><AiEntityChip :entity="other"
        /></span>
        {{ publicText(item.text) }}
      </p>
      <span class="col-start-3 row-span-2 row-start-1 flex gap-0.5 self-center">
        <Button
          v-if="!never"
          variant="secondary"
          size="icon-sm"
          class="bg-transparent pointer-coarse:size-11"
          :aria-label="phrase.ai_memory_edit"
          :data-title-popup="phrase.ai_memory_edit"
          data-memory-edit
          @click="edit"
        >
          <Icon name="edit" />
        </Button>
        <Button
          variant="secondary"
          size="icon-sm"
          class="bg-transparent pointer-coarse:size-11"
          :aria-label="never ? phrase.ai_memory_allow : phrase.ai_memory_forget"
          :data-title-popup="
            never ? phrase.ai_memory_allow : phrase.ai_memory_forget
          "
          data-memory-forget
          @click="emit('forget')"
        >
          <Icon :name="never ? 'close' : 'delete'" />
        </Button>
      </span>
      <p class="col-start-2 text-xs leading-snug text-text-2">
        <TheiLink
          v-if="item.session"
          :to="{
            path: '/admin/ai/',
            query: { session: item.session.sessionUuid },
          }"
          class="underline decoration-text-2/35 underline-offset-2
            transition-colors hocus:text-accent"
          >{{ sessionTitle(item.session) }}</TheiLink
        >
        <template v-else>{{ phrase.ai_memory_by_you }}</template>
        · {{ shortWhen(item.updatedAt) }}
      </p>
    </template>
  </div>
</template>

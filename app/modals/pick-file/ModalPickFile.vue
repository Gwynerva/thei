<script setup lang="ts">
import type { ExtensionProfile } from '#layers/thei/shared/assets/extensions';

const props = defineProps<{
  modalData: {
    accept: string | ExtensionProfile | (string | ExtensionProfile)[];
    maxSize?: number;
  };
}>();

const emit = defineEmits<{
  complete: [result: { type: 'file'; value: File } | { type: 'empty' }];
}>();

const humanSize = useHumanSize();

const errorMessage = ref(' sdaf jasdklf ja;sdlfj lasdjfkl ajsdklfj a;sdjf ls');

const acceptArray = computed(() => {
  const { accept } = props.modalData;
  if (Array.isArray(accept)) {
    return accept;
  }
  return [accept];
});
</script>

<template>
  <section class="absolute h-screen w-screen bg-bg-1/80 p-md sm:p-lg">
    <div
      class="relative flex h-full w-full flex-col items-center justify-center
        gap-md overflow-clip rounded-xl border-4 border-dashed border-border-1
        p-md text-center sm:gap-lg sm:border-8 sm:p-lg"
    >
      <button
        @click.prevent="emit('complete', { type: 'empty' })"
        class="absolute top-sm right-sm cursor-pointer rounded-full
          bg-transparent p-xs text-3xl text-text-3 transition sm:p-sm
          hocus:bg-bg-2 hocus:text-text-1"
      >
        <Icon name="close" />
      </button>

      <div v-if="errorMessage" class="text-xl font-semibold text-text-error">
        <Icon name="warning" class="mr-xs" />
        <span>{{ errorMessage }}</span>
      </div>
      <div class="rounded-full bg-bg-3 p-md shadow-lg shadow-black/20 sm:p-lg">
        <Icon
          name="upload"
          class="relative -top-1 text-[3em] text-text-2 sm:-top-3 sm:text-[8em]"
        />
      </div>
      <div class="text-xl font-bold text-text-2 sm:text-3xl">
        {{ phrase.drop_browse_paste }}
      </div>
      <div class="flex flex-col gap-md sm:text-xl">
        <div
          class="flex flex-wrap items-center justify-center gap-sm
            font-semibold"
        >
          <div class="text-text-3">
            {{ phrase.format }}
          </div>
          <div class="text-text-2">
            <template v-for="(accept, index) in acceptArray" :key="index">
              <span v-if="typeof accept === 'string'" class="font-mono">
                {{ accept }}
              </span>
              <span v-else>
                {{ phrase[accept.title] }}
              </span>
              <span v-if="index < acceptArray.length - 1">, </span>
            </template>
          </div>
        </div>

        <div
          v-if="modalData.maxSize"
          class="flex flex-wrap items-center justify-center gap-sm
            font-semibold"
        >
          <div class="text-text-3">
            {{ phrase.max_size }}
          </div>
          <div class="text-text-2">
            {{ humanSize(modalData.maxSize) }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

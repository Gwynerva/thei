<script lang="ts" setup>
const { datetime } = defineProps<{
  datetime: string | number | Date;
}>();

const liveNow = useLiveNow();

const dateOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

const locale = computed(() => language.value.code);

const relative = computed(() => {
  const date = new Date(datetime);
  const now = new Date(liveNow.value);
  const diff = Math.abs(now.getTime() - date.getTime());
  return diff < 1000 * 60 * 60 * 24 * 30 * 3;
});
</script>

<template>
  <NuxtTime
    :datetime
    :locale
    :relative
    v-bind="dateOptions"
    :class="relative && 'cursor-help'"
    :data-title-popup="
      relative
        ? new Date(datetime).toLocaleDateString(locale, {
            ...dateOptions,
            hour: '2-digit',
            minute: '2-digit',
          })
        : undefined
    "
  />
</template>

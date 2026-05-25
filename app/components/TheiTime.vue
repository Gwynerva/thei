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

const diffMs = computed(() => {
  const date = new Date(datetime);
  const now = new Date(liveNow.value);
  return now.getTime() - date.getTime();
});

const relative = computed(
  () => Math.abs(diffMs.value) < 1000 * 60 * 60 * 24 * 30 * 3,
);

const justNow = computed(() => Math.abs(diffMs.value) < 60 * 1000);

const titlePopup = computed(() =>
  relative.value
    ? new Date(datetime).toLocaleDateString(locale.value, {
        ...dateOptions,
        hour: '2-digit',
        minute: '2-digit',
      })
    : undefined,
);
</script>

<template>
  <span :class="relative && 'cursor-help'" :data-title-popup="titlePopup">
    <template v-if="justNow">
      {{ phrase.just_now }}
    </template>
    <template v-else-if="relative">
      <NuxtTime :datetime :locale relative class="hidden sm:inline" />
      <NuxtTime
        :datetime
        :locale
        relative
        relativeStyle="short"
        numeric="always"
        class="sm:hidden"
      />
    </template>
    <template v-else>
      <NuxtTime
        :datetime
        :locale
        v-bind="dateOptions"
        class="hidden sm:inline"
      />
      <NuxtTime
        :datetime
        :locale
        day="2-digit"
        month="2-digit"
        year="numeric"
        class="sm:hidden"
      />
    </template>
  </span>
</template>

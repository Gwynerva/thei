<script setup lang="ts">
defineProps<{
  title: string;
  icon: 'cog' | 'person';
  dirty: boolean;
  saving: boolean;
  canSave: boolean;
  error?: string;
}>();
defineEmits<{ save: [] }>();
</script>
<template>
  <StickyGlassHeader width="var(--width-wide)" :error="error">
    <div class="flex items-center justify-between gap-xs py-xs">
      <h1 class="flex min-w-0 items-center gap-xs text-xl font-bold">
        <Icon :name="icon" class="shrink-0" /><span class="truncate">{{
          title
        }}</span>
      </h1>
      <Button
        :disabled="saving || !canSave"
        class="shrink-0 font-semibold"
        @click="$emit('save')"
        ><Icon v-if="saving" name="loading" class="mr-xs" />{{
          dirty ? phrase.save : phrase.saved
        }}</Button
      >
    </div>
  </StickyGlassHeader>
</template>

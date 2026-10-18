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
      <h1 class="flex min-w-0 items-center gap-xs text-lg font-bold sm:text-xl">
        <Icon :name="icon" class="shrink-0" /><span class="truncate">{{
          title
        }}</span>
      </h1>
      <div class="flex shrink-0 items-center gap-xs">
        <slot />
        <AdminSaveButton
          :label="dirty ? phrase.save : phrase.saved"
          :saving
          :done="!dirty"
          :disabled="saving || !canSave"
          @click="$emit('save')"
        />
      </div>
    </div>
  </StickyGlassHeader>
</template>

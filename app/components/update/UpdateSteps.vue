<script lang="ts" setup>
import type { UpdateStep } from '#layers/thei/update/types';
import type { IconName } from '#thei/icons';

defineProps<{ steps: UpdateStep[] }>();

const stepIcons: Record<UpdateStep['status'], IconName> = {
  pending: 'minus',
  running: 'loading',
  done: 'check',
  failed: 'close',
  skipped: 'minus',
};

function stepKind(step: UpdateStep): string | undefined {
  if (step.kind === 'phase') return phrase.value.update_step_phase;
  if (step.kind === 'migration') return phrase.value.update_step_migration;
  if (step.kind === 'task') return phrase.value.update_step_task;
}
</script>

<template>
  <ol class="flex flex-col" :aria-label="phrase.update_steps">
    <li
      v-for="step in steps"
      :key="step.id"
      class="flex gap-sm py-xs"
      :class="{ 'opacity-60': step.status === 'skipped' }"
      :data-update-step="step.status"
    >
      <span
        class="mt-0.5 flex size-6 shrink-0 items-center justify-center
          rounded-full text-sm"
        :class="{
          'bg-bg-3 text-text-3':
            step.status === 'pending' || step.status === 'skipped',
          'bg-accent/15 text-accent': step.status === 'running',
          'bg-accent text-white': step.status === 'done',
          'bg-bg-error text-text-error': step.status === 'failed',
        }"
        aria-hidden="true"
      >
        <Icon :name="stepIcons[step.status]" />
      </span>
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="flex flex-wrap items-baseline gap-x-xs">
          <span
            class="font-semibold"
            :class="step.status === 'pending' ? 'text-text-2' : 'text-text-1'"
          >
            {{ step.title }}
          </span>
          <span v-if="stepKind(step)" class="text-xs text-text-3">
            {{ stepKind(step) }}
          </span>
        </span>
        <span v-if="step.description" class="text-sm text-text-3 tabular-nums">
          {{ step.description }}
        </span>
        <span v-if="step.error" class="text-sm break-words text-text-error">
          {{ step.error }}
        </span>
      </span>
    </li>
  </ol>
</template>

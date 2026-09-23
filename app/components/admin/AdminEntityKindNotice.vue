<script lang="ts" setup>
import type { IconName } from '#thei/icons';

/**
 * What the kind of entity listed below is, above its admin list.
 *
 * The three main kinds form a ladder — diary entry, event, project — and the
 * right rung is the one question worth answering before writing anything, so
 * the notice says what this kind is, where it sits against the other two, and
 * what usually belongs in it.
 */
const { kind } = defineProps<{ kind: 'project' | 'event' | 'diary' }>();

const icon = computed<IconName>(() => (kind === 'diary' ? 'thought' : kind));
const text = computed(() => {
  const p = phrase.value;
  return {
    project: {
      title: p.admin_kind_project_title,
      what: p.admin_kind_project_what,
      rank: p.admin_kind_project_rank,
      examples: p.admin_kind_project_examples,
    },
    event: {
      title: p.admin_kind_event_title,
      what: p.admin_kind_event_what,
      rank: p.admin_kind_event_rank,
      examples: p.admin_kind_event_examples,
    },
    diary: {
      title: p.admin_kind_diary_title,
      what: p.admin_kind_diary_what,
      rank: p.admin_kind_diary_rank,
      examples: p.admin_kind_diary_examples,
    },
  }[kind];
});
</script>

<template>
  <Box class="flex items-start gap-sm p-sm sm:gap-md sm:p-md">
    <span
      class="hidden size-12 shrink-0 items-center justify-center rounded-normal
        bg-accent/20 text-xl text-accent sm:flex"
      aria-hidden="true"
    >
      <Icon :name="icon" />
    </span>
    <div class="flex min-w-0 flex-col gap-xs text-sm">
      <p class="text-base font-semibold">{{ text.title }}</p>
      <p class="text-text-2">{{ text.what }}</p>
      <p class="text-text-2">{{ text.rank }}</p>
      <p class="text-text-3 italic">{{ text.examples }}</p>
    </div>
  </Box>
</template>

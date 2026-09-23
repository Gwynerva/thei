<script lang="ts" setup>
import {
  isPublicSecret,
  type PublicEntityLink,
} from '#layers/thei/shared/api/public';
import { relationEntityIcon } from '#layers/thei/shared/relation-display';

/**
 * What a card is related to, as one quiet line under its summary.
 *
 * One related entity gets its icon and its full name; several get a row of
 * icons, named on hover — a card is a glance, and a list of names would turn
 * it into a table of contents. Every token is a link. There is deliberately
 * no box around the row: the arrows on the left already say what it is.
 */
const { projects } = defineProps<{ projects: PublicEntityLink[] }>();

const single = computed(() => projects.length === 1);
function titleOf(entity: PublicEntityLink) {
  return isPublicSecret(entity) ? phrase.value.secret_hint : entity.title;
}
</script>

<template>
  <div v-if="projects.length" class="flex min-w-0 items-center gap-xs text-sm">
    <Icon
      name="arrow-cycle"
      class="shrink-0 text-text-3"
      :aria-label="phrase.related_entities"
      role="img"
    />
    <div class="flex min-w-0 flex-wrap items-center gap-1">
      <template
        v-for="entity in projects"
        :key="isPublicSecret(entity) ? entity.key : entity.href"
      >
        <span
          v-if="isPublicSecret(entity)"
          :data-title-popup="`${entity.title} · ${phrase.secret_hint}`"
          class="pointer-events-auto relative z-3 inline-flex min-w-0
            items-center gap-xs text-text-3"
        >
          <BeveledIcon
            :media="entity.iconMedia"
            :icon="relationEntityIcon(entity.entityType ?? 'project')"
            class="size-6 sm:size-7"
          />
          <span v-if="single" class="min-w-0 truncate italic">
            {{ entity.title }}
          </span>
        </span>
        <TheiLink
          v-else
          :to="entity.href"
          :aria-label="entity.title"
          :data-title-popup="single ? entity.summary : titleOf(entity)"
          class="group/entity pointer-events-auto relative z-3 inline-flex
            min-w-0 items-center gap-xs rounded-sm text-text-2 transition
            focus-visible:ring-2 focus-visible:ring-accent
            focus-visible:outline-none"
        >
          <BeveledIcon
            :media="entity.iconMedia"
            :icon="relationEntityIcon(entity.entityType)"
            class="size-6 transition group-hocus/entity:brightness-125
              sm:size-7"
          />
          <span
            v-if="single"
            class="min-w-0 truncate transition group-hocus/entity:text-accent"
          >
            {{ entity.title }}
          </span>
        </TheiLink>
      </template>
    </div>
  </div>
</template>

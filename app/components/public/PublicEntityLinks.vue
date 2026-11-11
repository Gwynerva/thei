<script lang="ts" setup>
import {
  isPublicSecret,
  type PublicEntityLink,
} from '#layers/thei/shared/api/public';
import { relationEntityIcon } from '#layers/thei/shared/relation-display';
import {
  entityCardFromLink,
  entityLinkName,
  vEntityCard,
} from '#layers/thei/app/composables/entity-cards';

/**
 * What a card is related to, as one quiet line under its summary.
 *
 * One related entity is its chip, with its name (`EntityChip`); several get
 * a row of tokens — a card is a glance, and a list of names would turn it
 * into a table of contents. Every one of them a reader may open is a link,
 * and resting on any shows the entity's card, which names it and says what
 * kind of thing it is. There is deliberately no box around the row: the
 * arrows on the left already say what it is, and explain it on hover.
 */
const { projects } = defineProps<{ projects: PublicEntityLink[] }>();

const single = computed(() => projects.length === 1);
</script>

<template>
  <div v-if="projects.length" class="flex min-w-0 items-center gap-xs text-sm">
    <Icon
      name="arrow-cycle"
      class="pointer-events-auto relative z-3 shrink-0 cursor-help text-text-3"
      :aria-label="phrase.related_entities"
      :data-title-popup="phrase.related_entities"
      role="img"
    />
    <EntityChip
      v-if="single"
      :title="entityLinkName(projects[0]!, 'abbreviated')"
      :href="isPublicSecret(projects[0]!) ? undefined : projects[0]!.href"
      :media="projects[0]!.iconMedia"
      :icon="relationEntityIcon(projects[0]!.entityType ?? 'project')"
      :card="entityCardFromLink(projects[0]!)"
      size="sm"
      class="pointer-events-auto z-3"
    />
    <div v-else class="flex min-w-0 flex-wrap items-center gap-1">
      <template
        v-for="entity in projects"
        :key="isPublicSecret(entity) ? entity.key : entity.href"
      >
        <span
          v-if="isPublicSecret(entity)"
          v-entity-card="entityCardFromLink(entity)"
          role="img"
          :aria-label="entityLinkName(entity)"
          class="pointer-events-auto relative z-3 inline-flex min-w-0
            items-center gap-xs text-text-3"
        >
          <EntityTokenIcon
            :media="entity.iconMedia"
            :icon="relationEntityIcon(entity.entityType ?? 'project')"
            class="size-6 sm:size-7"
          />
        </span>
        <TheiLink
          v-else
          v-entity-card="entityCardFromLink(entity)"
          :to="entity.href"
          :aria-label="entityLinkName(entity)"
          class="group/entity pointer-events-auto relative z-3 inline-flex
            min-w-0 items-center gap-xs rounded-sm text-text-2 transition
            focus-visible:ring-2 focus-visible:ring-accent
            focus-visible:outline-none"
        >
          <EntityTokenIcon
            :media="entity.iconMedia"
            :icon="relationEntityIcon(entity.entityType)"
            class="size-6 transition group-hocus/entity:brightness-125
              sm:size-7"
          />
        </TheiLink>
      </template>
    </div>
  </div>
</template>

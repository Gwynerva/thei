<script lang="ts" setup>
import {
  isPublicSecret,
  type PublicEntityLink,
} from '#layers/thei/shared/api/public';
import { relationEntityIcon } from '#layers/thei/shared/relation-display';
import {
  TITLE_POPUP_GAP,
  titlePopup,
} from '#layers/thei/app/composables/title-popup-content';

/**
 * What a card is related to, as one quiet line under its summary.
 *
 * One related entity gets its icon and its full name; several get a row of
 * icons, named on hover — a card is a glance, and a list of names would turn
 * it into a table of contents. Every token is a link. There is deliberately
 * no box around the row: the arrows on the left already say what it is, and
 * explain it on hover. Each token's popup ends with what kind of entity it
 * is, set apart in italics, since the icons alone do not always tell.
 */
const { projects } = defineProps<{ projects: PublicEntityLink[] }>();

const single = computed(() => projects.length === 1);
function typeLine(entity: PublicEntityLink) {
  return {
    text: entityTypeLabel(entity.entityType ?? 'project'),
    italic: true,
  };
}
function popupOf(entity: PublicEntityLink) {
  if (isPublicSecret(entity))
    return titlePopup(
      `${entity.title} · ${phrase.value.secret_hint}`,
      TITLE_POPUP_GAP,
      typeLine(entity),
    );
  // A lone entity already shows its name, so its popup tells what it is about.
  return titlePopup(
    single.value ? entity.summary : entity.title,
    TITLE_POPUP_GAP,
    typeLine(entity),
  );
}
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
    <div class="flex min-w-0 flex-wrap items-center gap-1">
      <template
        v-for="entity in projects"
        :key="isPublicSecret(entity) ? entity.key : entity.href"
      >
        <span
          v-if="isPublicSecret(entity)"
          v-bind="popupOf(entity)"
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
          v-bind="popupOf(entity)"
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

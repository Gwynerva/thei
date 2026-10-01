<script lang="ts" setup>
import type {
  RelationEditItem,
  RelationEntityType,
  RelationNote,
  RelationType,
} from '#layers/thei/shared/relation';
import {
  relationEntityIcon,
  relationSentence,
  relationTypeIcon,
} from '#layers/thei/shared/relation-display';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { IconName } from '#thei/icons';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';

/**
 * One relation of the relations block, read as what it says — this entity,
 * what the relation is, the other one — as two pictures with the kind of
 * relation between them, in its icon and its words, chosen from a list;
 * what can be done with the row sits at its end. The names are in the
 * pictures' hints, so the whole width below is left to the note, written
 * once or once per side.
 *
 * A row of its own, so that typing into one note draws that row again and
 * not every other one: a project may gather hundreds of diary entries.
 */
const {
  relation,
  ownerType,
  ownerName,
  ownerMedia,
  directions,
  sortable,
  groupTitle,
} = defineProps<{
  relation: RelationEditItem;
  ownerType: RelationEntityType;
  /** What this entity is called, formatted. */
  ownerName: string;
  ownerMedia?: MediaDescriptor;
  /** The kinds a relation can be, with their words, in the list's order. */
  directions: { type: RelationType; label: string }[];
  /** Whether the row is ordered by hand. */
  sortable: boolean;
  /** The name of the row's group, for its handle. */
  groupTitle: string;
}>();

const emit = defineEmits<{
  type: [type: RelationType];
  note: [note: RelationNote];
  remove: [];
}>();

const href = computed(() => {
  if (relation.date) return buildDiaryUrl(relation.date);
  if (!relation.publicId) return undefined;
  return relation.entityType === 'project'
    ? buildProjectUrl(relation.humanReadableSlug ?? '', relation.publicId)
    : buildEventUrl(relation.humanReadableSlug ?? '', relation.publicId);
});

const title = computed(() => {
  if (relation.date)
    return publicText(
      entityDisplayTitle({ title: relation.title ?? '', date: relation.date }),
    );
  return relation.title ? publicText(relation.title) : relation.entityId;
});

/** The other end's name, and what it is about, for its picture's hint. */
const popup = computed(() =>
  titlePopup(
    { text: title.value, bold: true },
    relation.summary && {
      text: publicText(relation.summary),
      italic: Boolean(relation.date),
      clamp: true,
    },
  ),
);

const directionLabel = computed(
  () => directions.find((direction) => direction.type === relation.type)?.label,
);

/** What the chosen direction means for this very pair. */
const directionTitle = computed(() =>
  relationSentence(phrase.value, relation.type, ownerName, title.value),
);

function setType(value: string) {
  const direction = directions.find((option) => option.type === value);
  if (direction && direction.type !== relation.type)
    emit('type', direction.type);
}

/**
 * A note is one paragraph that wraps in its field: a line break pasted into
 * it becomes a space, as it would in a single-line field.
 */
function noteText(value: unknown) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ');
}

const split = computed(() => relation.note?.type === 'split');

/** The two sides of a note written once per side, each with its picture. */
const sides = computed(() => {
  const note = relation.note?.type === 'split' ? relation.note : undefined;
  return [
    {
      side: 'current' as const,
      key: 'currentText' as const,
      text: note?.currentText ?? '',
      media: ownerMedia,
      icon: relationEntityIcon(ownerType) as IconName,
      tone: 'text-text-2',
      label: phrase.value.relation_note_for(ownerName),
    },
    {
      side: 'related' as const,
      key: 'relatedText' as const,
      text: note?.relatedText ?? '',
      media: relation.iconMedia,
      icon: relationEntityIcon(relation.entityType) as IconName,
      tone: 'text-text-3',
      label: phrase.value.relation_note_for(title.value),
    },
  ];
});

function updateSide(key: 'currentText' | 'relatedText', text: string) {
  const note =
    relation.note?.type === 'split'
      ? relation.note
      : { type: 'split' as const };
  emit('note', { ...note, [key]: text });
}

function toggleSplit() {
  const note = relation.note;
  if (note?.type === 'split') {
    const current = note.currentText ?? '';
    const related = note.relatedText ?? '';
    const text =
      current === related
        ? current
        : !current
          ? related
          : !related
            ? current
            : `${current} — ${related}`;
    emit('note', { type: 'shared', text });
    return;
  }
  const text = note?.text ?? '';
  emit('note', { type: 'split', currentText: text, relatedText: text });
}
</script>

<template>
  <div class="border-t border-border-1 p-sm first:border-t-0 sm:p-md">
    <div class="flex min-w-0 items-center gap-1 sm:gap-xs">
      <!-- What the relation says, as it reads: this entity, the relation,
           the other one. The filled end of the relation's icon is this
           entity. -->
      <div
        class="flex min-w-0 items-center gap-0.5 sm:gap-1.5"
        data-relation-sentence
      >
        <span
          role="img"
          :aria-label="ownerName"
          v-bind="titlePopup(ownerName)"
          class="flex size-7 shrink-0 items-center justify-center
            overflow-hidden rounded-sm bg-bg-3 text-text-2 sm:size-8"
          data-relation-owner
        >
          <Media
            v-if="ownerMedia"
            v-bind="ownerMedia"
            class="size-full object-cover"
          />
          <Icon v-else :name="relationEntityIcon(ownerType)" />
        </span>
        <!-- The kind of relation, chosen from a list: the system's own
             picker on a phone. What shows is the chosen kind, its icon and
             its words; the select lies over them. -->
        <label
          class="relative flex h-7 min-w-0 cursor-pointer items-center gap-1
            rounded-normal bg-bg-3 pr-1.5 pl-1 text-accent transition-colors
            has-focus-visible:ring-2 has-focus-visible:ring-accent sm:h-8
            sm:pr-2 sm:pl-1.5 hocus:bg-bg-accent"
          data-relation-type
        >
          <Icon
            :name="relationTypeIcon(relation.type)"
            class="shrink-0 text-lg"
            aria-hidden="true"
          />
          <span
            class="min-w-0 truncate text-xs font-semibold"
            aria-hidden="true"
            data-relation-direction-label
            >{{ directionLabel }}</span
          >
          <Icon
            name="chevron-right"
            class="shrink-0 rotate-90 text-sm text-text-3"
            aria-hidden="true"
          />
          <select
            :value="relation.type"
            :aria-label="phrase.relation_direction"
            :data-title-popup="directionTitle"
            class="absolute inset-0 cursor-pointer appearance-none text-text-1
              opacity-0"
            @change="setType(($event.target as HTMLSelectElement).value)"
          >
            <!-- The list opens in the theme's colours, as FieldSelect's
                 does: an option left alone takes the system's light ones. -->
            <option
              v-for="direction in directions"
              :key="direction.type"
              :value="direction.type"
              class="bg-bg-1 checked:bg-accent checked:text-white"
            >
              {{ direction.label }}
            </option>
          </select>
        </label>
        <NuxtLink
          v-if="href"
          :to="href"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="title"
          v-bind="popup"
          class="flex size-7 shrink-0 items-center justify-center
            overflow-hidden rounded-sm bg-bg-3 text-text-3 transition sm:size-8
            hocus:ring-2 hocus:ring-accent"
          data-relation-other
        >
          <Media
            v-if="relation.iconMedia"
            v-bind="relation.iconMedia"
            class="size-full object-cover"
          />
          <Icon v-else :name="relationEntityIcon(relation.entityType)" />
        </NuxtLink>
        <span
          v-else
          role="img"
          :aria-label="title"
          v-bind="popup"
          class="flex size-7 shrink-0 items-center justify-center
            overflow-hidden rounded-sm bg-bg-3 text-text-3 sm:size-8"
          data-relation-other
        >
          <Icon :name="relationEntityIcon(relation.entityType)" />
        </span>
      </div>
      <!-- What can be done with the row, at its end: the note made one or
           two, the row moved, the row removed. -->
      <div
        class="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5"
        data-relation-actions
      >
        <button
          type="button"
          class="flex size-7 shrink-0 cursor-pointer items-center justify-center
            rounded-normal bg-bg-3 text-text-2 transition-colors sm:size-8
            hocus:bg-bg-accent hocus:text-accent"
          :aria-label="
            split ? phrase.merge_relation_note : phrase.split_relation_note
          "
          :data-title-popup="
            split ? phrase.merge_relation_note : phrase.split_relation_note
          "
          data-relation-split
          @click="toggleSplit"
        >
          <Icon :name="split ? 'link' : 'link-broken'" />
        </button>
        <button
          v-if="sortable"
          type="button"
          class="flex size-7 shrink-0 cursor-grab items-center justify-center
            rounded-normal bg-bg-3 text-text-2 transition-colors
            active:cursor-grabbing sm:size-8 hocus:bg-bg-accent
            hocus:text-accent"
          :aria-label="`${groupTitle}: ${title}`"
          data-relation-handle
        >
          <Icon name="grip" />
        </button>
        <Button
          type="button"
          size="icon-sm"
          variant="delete"
          class="size-7! sm:size-8!"
          :aria-label="phrase.delete_relation"
          :data-title-popup="phrase.delete_relation"
          @click="emit('remove')"
        >
          <Icon name="delete" />
        </Button>
      </div>
    </div>
    <!-- The note has the whole width: it wraps rather than scrolls. Notes
         per side carry the picture of their side, set on the first line as a
         letter would be: the field's border and padding in, and as tall as a
         line of its text. -->
    <div v-if="split" class="mt-xs grid min-w-0 gap-xs sm:grid-cols-2">
      <div v-for="side in sides" :key="side.side" class="relative min-w-0">
        <span
          class="pointer-events-none absolute top-[calc(var(--spacing-xs)+2px)]
            left-[calc(var(--spacing-xs)+2px)] flex size-5 items-center
            justify-center overflow-hidden rounded-sm bg-bg-3 text-xs"
          :class="side.tone"
          aria-hidden="true"
        >
          <Media
            v-if="side.media"
            v-bind="side.media"
            class="size-full object-cover"
          />
          <Icon v-else :name="side.icon" />
        </span>
        <FieldTextarea
          :model-value="side.text"
          autocomplete="off"
          spellcheck="true"
          :placeholder="side.label"
          :aria-label="side.label"
          class="min-w-0! pl-[calc(var(--spacing-xs)*2+1.25rem)] text-sm"
          :data-relation-note="side.side"
          @keydown.enter.prevent
          @update:model-value="updateSide(side.key, noteText($event))"
        />
      </div>
    </div>
    <FieldTextarea
      v-else
      :model-value="
        relation.note?.type === 'shared' ? (relation.note.text ?? '') : ''
      "
      autocomplete="off"
      spellcheck="true"
      :placeholder="phrase.relation_note_placeholder"
      :aria-label="phrase.relation_note_placeholder"
      class="mt-xs min-w-0! text-sm"
      data-relation-note="shared"
      @keydown.enter.prevent
      @update:model-value="
        emit('note', { type: 'shared', text: noteText($event) })
      "
    />
  </div>
</template>

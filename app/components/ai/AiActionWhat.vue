<script lang="ts" setup>
import type { AiActionItem, AiEntityRef } from '#layers/thei/shared/ai';
import { isContentEntityType } from '#layers/thei/shared/content-link';

/**
 * What an action changes, as the first line of its card says it: the field,
 * the text or the kind of change, in bold, and what it is of — the entity,
 * the memory, a section's project — in plain words beside it. No icons: the
 * change itself is said under it. In a card of one kind the kind's name is
 * left to the card's head (`plain`); in an entity's own form the entity
 * goes unnamed (`here`).
 */
const props = defineProps<{
  action: AiActionItem;
  plain?: boolean;
  /** The ref of the entity whose form shows it. */
  here?: string;
}>();

const payload = computed(() => props.action.payload as Record<string, any>);

/** The words for the change. */
const words = computed(() => {
  const kind = props.action.kind;
  const said = phrase.value;
  if (kind === 'field') return fieldName(String(payload.value.field));
  if (kind === 'update') {
    const fields =
      (props.action.base as { fields?: string[] } | null)?.fields ??
      Object.keys((payload.value.changes ?? {}) as object);
    return fields.map(fieldName).join(', ');
  }
  if (kind === 'write')
    return said.ai_action_write_modes[
      payload.value.mode as keyof typeof said.ai_action_write_modes
    ];
  if (kind === 'revise')
    return payload.value.mode === 'order'
      ? said.ai_action_order
      : payload.value.mode === 'relink'
        ? said.ai_action_relink
        : kindName(kind);
  if (kind === 'create')
    return (
      said.ai_action_create[
        payload.value.entity as keyof typeof said.ai_action_create
      ] ?? kindName(kind)
    );
  if (kind === 'relation' && payload.value.op === 'remove')
    return said.ai_action_relation_removed;
  return kindName(kind);
});

/** A text it writes or corrects, by its name, unless it is the main one. */
const textName = computed(() => {
  if (props.action.kind !== 'write' && props.action.kind !== 'revise')
    return '';
  const name = String(payload.value.text ?? '');
  // The text of an entity goes without saying; its notes, say, do not.
  if (name === 'body') return '';
  return (
    phrase.value.ai_action_texts[
      name as keyof typeof phrase.value.ai_action_texts
    ] ?? name
  );
});

/**
 * What it is of: the entity — unless its own form shows it — a part of the
 * memory, or the name a new entity would have. A file is shown under it.
 */
const of = computed<{ entity?: AiEntityRef; words?: string }[]>(() => {
  const action = props.action;
  const target = action.target;
  const named = (entity: AiEntityRef | null | undefined) =>
    entity && entity.ref !== props.here && entity.type !== 'asset'
      ? [{ entity }]
      : [];
  if (action.kind === 'remember' || action.kind === 'memory-compact') {
    const about = payload.value.about;
    if (about === 'owner') return [{ words: phrase.value.ai_memory_owner }];
    if (about === 'kind')
      return [
        {
          words:
            phrase.value.ai_memory_kinds[
              payload.value
                .entityKind as keyof typeof phrase.value.ai_memory_kinds
            ] ?? String(payload.value.entityKind),
        },
      ];
    const other =
      about === 'pair' && payload.value.other
        ? action.refs[payload.value.other]
        : undefined;
    return [...named(target), ...named(other)];
  }
  // A new entity is named under it, with the rest of its fields; a section
  // says whose it is.
  if (action.kind === 'create')
    return payload.value.entity === 'project-section' ? named(target) : [];
  // A word of the dictionary is told apart by its letters: said as stored.
  if (action.kind === 'term') return [{ words: String(payload.value.word) }];
  // A relation names both its ends under it.
  if (action.kind === 'relation') return [];
  return named(target);
});

/**
 * In a card of one kind the kind's own name is the card's: a row says only
 * what it is of. A field, a mode or a new entity's kind is said still.
 */
const showWords = computed(
  () =>
    !props.plain ||
    !of.value.length ||
    words.value !== kindName(props.action.kind),
);

/** What it is of says it alone, as its first line does in a card of one kind. */
const leads = computed(() => !showWords.value && !textName.value);

/** Where an entity named here is edited, when it is one of the archive's. */
function pathOf(entity: AiEntityRef) {
  return isContentEntityType(entity.type) ? entity.path : undefined;
}
</script>

<template>
  <p class="min-w-0 leading-snug wrap-anywhere" data-action-what>
    <b v-if="showWords" class="font-semibold">{{ words }}</b>
    <template v-if="textName">
      <span v-if="showWords" class="text-text-3"> · </span>
      <span class="font-semibold">{{ textName }}</span>
    </template>
    <template v-for="(item, index) in of" :key="index">
      <span v-if="index > 0 || showWords || textName" class="text-text-3">{{
        index > 0 ? ` ${phrase.ai_action_and} ` : ' · '
      }}</span>
      <TheiLink
        v-if="item.entity && pathOf(item.entity)"
        :to="pathOf(item.entity)!"
        class="underline decoration-text-2/30 underline-offset-2
          transition-colors hocus:text-accent"
        :class="leads ? 'font-semibold' : 'text-text-2'"
        data-action-of
        >{{ aiEntityName(item.entity) }}</TheiLink
      >
      <span
        v-else
        :class="leads ? 'font-semibold' : 'text-text-2'"
        data-action-of
        >{{ item.entity ? aiEntityName(item.entity) : item.words }}</span
      >
    </template>
  </p>
</template>

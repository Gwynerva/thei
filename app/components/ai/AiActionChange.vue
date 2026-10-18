<script lang="ts" setup>
import type { AiActionItem } from '#layers/thei/shared/ai';
import type { AiRevisePart } from '#layers/thei/shared/ai-actions';
import type { Period } from '#layers/thei/shared/period';
import {
  RELATION_WORD_FROM_OTHER_END,
  type RelationWord,
} from '#layers/thei/shared/relation';
import { relationWordIcon } from '#layers/thei/shared/relation-display';
import { libraryAssetDetailsModal } from '#layers/thei/app/modals/asset-library/details-modal';
import {
  valueChange,
  wordsChange,
  type AiValueChange,
} from '#layers/thei/app/composables/ai-change';

/**
 * What an action changes, under its card's first line: the value it had and
 * the one it would have, for every kind — a field, a form's fields, dates,
 * tags, a relation, access, a text written or corrected, a new entity, a
 * deletion, what is remembered, a word of the dictionary, a file's
 * description beside the file. A click on words that can be corrected
 * starts correcting them (`edit`).
 */
const props = defineProps<{
  action: AiActionItem;
  /** The ref of the entity whose form shows it. */
  here?: string;
  /** It waits, is being made, or holds: what it changes is told in colour. */
  live: boolean;
  editable?: boolean;
}>();
const emit = defineEmits<{ edit: [] }>();

const payload = computed(() => props.action.payload as Record<string, any>);
const base = computed(() => (props.action.base ?? {}) as Record<string, any>);
const kind = computed(() => props.action.kind);

/** A text change as one line: the field's, or each of a form's. */
const lines = computed<{ name: string; change: AiValueChange }[] | null>(() => {
  if (kind.value === 'field')
    return [
      {
        name: '',
        change: valueChange(base.value.value, payload.value.value),
      },
    ];
  if (kind.value === 'access')
    return [
      {
        name: '',
        change: {
          type: 'whole',
          before: base.value.access
            ? (phrase.value.ai_action_access[
                base.value.access as keyof typeof phrase.value.ai_action_access
              ] ?? '')
            : '',
          after:
            phrase.value.ai_action_access[
              payload.value.access as keyof typeof phrase.value.ai_action_access
            ] ?? '',
        },
      },
    ];
  if (kind.value === 'update') {
    const fields = (base.value.fields ?? []) as string[];
    const before = (base.value.before ?? {}) as Record<string, unknown>;
    const after = (base.value.after ?? {}) as Record<string, unknown>;
    // One field is named by the first line already.
    return fields.map((field) => ({
      name: fields.length > 1 ? fieldName(field) : '',
      change: valueChange(before[field], after[field]),
    }));
  }
  if (kind.value === 'term' && base.value.before) {
    const was = base.value.before as Record<string, any>;
    return [
      {
        name: phrase.value.ai_action_term_note,
        change: valueChange(was.note ?? '', payload.value.note ?? ''),
      },
      {
        name: phrase.value.ai_action_term_forms,
        change: valueChange(was.forms ?? [], payload.value.forms ?? []),
      },
    ].filter((line) => !sameChange(line.change));
  }
  return null;
});

/** A line whose value stays as it is: nothing to say. */
function sameChange(change: AiValueChange) {
  if (change.type === 'items')
    return change.items.every((item) => item.kind === 'same');
  if (change.type === 'words')
    return change.pieces.every((piece) => piece.kind === 'same');
  if (change.type === 'whole') return change.before === change.after;
  return true;
}

/** A file's description, word by word, beside the file. */
const description = computed(() =>
  kind.value === 'describe'
    ? wordsChange(
        publicText(String(base.value.text ?? '')),
        publicText(String(payload.value.text ?? '')),
      )
    : null,
);
function openFile() {
  if (props.action.file)
    void openModal(libraryAssetDetailsModal, { asset: props.action.file });
}
/** In the file's own window the file is not opened again. */
const fileHere = computed(() => props.here === props.action.target?.ref);

/** Dates: the ones that stay, go and come. */
const periods = computed(() => {
  if (kind.value !== 'periods') return null;
  const key = (period: Period) => JSON.stringify(period);
  const was = (base.value.periods ?? []) as Period[];
  const next = (payload.value.periods ?? []) as Period[];
  const after = new Set(next.map(key));
  const before = new Set(was.map(key));
  return [
    ...was.map((period) => ({
      period,
      kind: after.has(key(period)) ? 'same' : 'removed',
    })),
    ...next
      .filter((period) => !before.has(key(period)))
      .map((period) => ({ period, kind: 'added' })),
  ];
});

const tags = computed(() =>
  kind.value === 'tags'
    ? {
        added: (payload.value.add ?? []) as { ref?: string; title: string }[],
        removed: (payload.value.remove ?? []) as {
          ref: string;
          title: string;
        }[],
      }
    : null,
);

/** A relation, read from the end whose form shows it. */
const relation = computed(() => {
  if (kind.value !== 'relation') return null;
  const removed = payload.value.op === 'remove';
  const fromOther = Boolean(props.here) && props.here === payload.value.other;
  const fromTarget =
    Boolean(props.here) && props.here === props.action.target?.ref;
  const word = (payload.value.relation ?? 'related') as RelationWord;
  const read = (said: RelationWord) =>
    fromOther ? RELATION_WORD_FROM_OTHER_END[said] : said;
  const was = (base.value.relation as { relation?: RelationWord } | null)
    ?.relation;
  const note = payload.value.note as
    { text?: string; from?: string; to?: string } | undefined;
  return {
    removed,
    from: fromOther || fromTarget ? null : props.action.target,
    to: fromOther
      ? props.action.target
      : props.action.refs[payload.value.other],
    toRef: String(payload.value.other),
    word: read(word),
    was: !removed && was && was !== word ? read(was) : null,
    note: note
      ? [note.text, note.from, note.to].filter(Boolean).map(String)
      : [],
  };
});

/** A whole text written, noted or remembered: it is all new. */
const quote = computed(() => {
  if (kind.value === 'write' || kind.value === 'note')
    return plainLines(String(payload.value.markdown ?? ''));
  if (kind.value === 'remember')
    return publicText(String(payload.value.text ?? ''));
  return '';
});

/** A word of the dictionary, new. */
const term = computed(() =>
  kind.value === 'term' && !base.value.before
    ? {
        word: String(payload.value.word ?? ''),
        forms: (payload.value.forms ?? []) as string[],
        note: publicText(String(payload.value.note ?? '')),
      }
    : null,
);

/** Facts of a memory said again: what goes, what comes. */
const facts = computed(() => {
  if (kind.value !== 'memory-compact') return null;
  const was = ((base.value.facts ?? []) as { text: string }[]).map((fact) =>
    publicText(fact.text),
  );
  const next = ((payload.value.facts ?? []) as string[]).map((fact) =>
    publicText(fact),
  );
  return valueChange(was, next);
});

/** A new entity's fields, every one new; its parts are listed apart. */
const created = computed(() => {
  if (kind.value !== 'create') return null;
  const fields = (payload.value.fields ?? {}) as Record<string, unknown>;
  const said: { name: string; text?: string; periods?: Period[] }[] = [];
  for (const [field, value] of Object.entries(fields)) {
    if (['sections', 'tags', 'relations'].includes(field)) continue;
    if (field === 'date' && typeof value === 'string') {
      said.push({
        name: fieldName(field),
        text: aiEntityName({ type: 'diary-entry', title: value }),
      });
      continue;
    }
    if (field === 'periods' && Array.isArray(value)) {
      if (value.length)
        said.push({ name: fieldName(field), periods: value as Period[] });
      continue;
    }
    const text =
      field === 'content' || field === 'body' || field === 'notes'
        ? plainWords(String(value ?? ''), 200)
        : fieldValueWords(value);
    // A diary entry's text is its body, as every other text is.
    if (text)
      said.push({
        name: fieldName(field === 'content' ? 'body' : field),
        text,
      });
  }
  return said;
});

/** A text edit, its first parts said as they change the text. */
const PREVIEW = 3;
const revise = computed(() => {
  if (kind.value !== 'revise') return null;
  const parts = (payload.value.parts ?? []) as AiRevisePart[];
  const kinds = phrase.value.ai_review_kinds;
  const lines = parts.slice(0, PREVIEW).map((part) => {
    const unsure = part.certainty === 'unsure';
    if (part.type === 'correction')
      return {
        unsure,
        change: wordsChange(publicText(part.find), publicText(part.replace)),
      };
    if (part.type === 'relink')
      return {
        unsure,
        name: part.words ? phrase.value.quoted(publicText(part.words)) : '',
        change: {
          type: 'whole',
          before: publicText(part.fromTitle),
          after: part.toTitle
            ? publicText(part.toTitle)
            : phrase.value.ai_review_link_off,
        } as AiValueChange,
      };
    if (part.type === 'heading')
      return {
        unsure,
        name: kinds.heading,
        change: {
          type: 'whole',
          before: '',
          after: publicText(part.text),
        } as AiValueChange,
      };
    if (part.type === 'removal')
      return {
        unsure,
        name: kinds.removal,
        change: {
          type: 'words',
          pieces: [{ kind: 'removed', text: publicText(part.quote) }],
        } as AiValueChange,
      };
    if (part.type === 'order')
      return { unsure, name: phrase.value.ai_review_moved(part.moved.length) };
    return { unsure, name: kinds[part.type] };
  });
  return { lines, more: Math.max(0, parts.length - PREVIEW) };
});

const deleted = computed(() =>
  kind.value === 'delete' && props.action.target
    ? aiEntityName(props.action.target)
    : '',
);

/** The rule along a change's left edge; its colour is the change's. */
const rule = 'min-w-0 border-l-2 pl-2.5 leading-normal wrap-anywhere';
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1.5" data-action-change>
    <!-- A value, or several of a form: each old → new -->
    <template v-if="lines">
      <p
        v-for="(line, index) in lines"
        :key="index"
        :class="[rule, 'border-border-2', editable ? 'cursor-text' : '']"
        :data-title-popup="editable ? phrase.ai_action_edit : undefined"
        @click="editable && emit('edit')"
      >
        <span v-if="line.name" class="mr-1 text-text-3">{{ line.name }}:</span>
        <AiActionValue :change="line.change" :live />
      </p>
    </template>

    <!-- A file's description, beside the file -->
    <div v-if="description" class="flex min-w-0 items-start gap-2.5">
      <button
        v-if="action.file && !fileHere"
        type="button"
        class="shrink-0 cursor-pointer rounded-sm transition-opacity
          hocus:opacity-85"
        :aria-label="phrase.ai_action_open_file"
        :data-title-popup="phrase.ai_action_open_file"
        data-action-file
        @click="openFile"
      >
        <ContentFileTile :asset="action.file as never" small />
      </button>
      <ContentFileTile
        v-else-if="action.file"
        :asset="action.file as never"
        small
        class="shrink-0"
        data-action-file
      />
      <p
        :class="[rule, 'flex-1 border-border-2', editable ? 'cursor-text' : '']"
        :data-title-popup="editable ? phrase.ai_action_edit : undefined"
        data-action-description
        @click="editable && emit('edit')"
      >
        <AiActionValue :change="description" :live />
      </p>
    </div>

    <!-- Dates -->
    <div
      v-if="periods"
      :class="[rule, 'flex flex-wrap items-center gap-1 border-border-2']"
    >
      <span
        v-for="(item, index) in periods"
        :key="index"
        class="inline-flex rounded-normal"
        :class="
          item.kind === 'removed'
            ? 'line-through opacity-55'
            : item.kind === 'added' && live
              ? 'ring-2 ring-text-success/45'
              : ''
        "
        :data-change="item.kind"
      >
        <DateRangeChip :period="item.period" />
      </span>
    </div>

    <!-- Tags put on and taken off -->
    <div
      v-if="tags"
      :class="[rule, 'flex flex-wrap items-center gap-1 border-border-2']"
    >
      <span
        v-for="tag in tags.added"
        :key="tag.ref ?? tag.title"
        class="inline-flex h-6.5 items-center rounded-full px-2 text-xs
          font-semibold"
        :class="[
          live ? 'text-text-success' : 'text-text-2',
          tag.ref
            ? live
              ? 'bg-bg-success'
              : 'bg-bg-3'
            : 'border border-dashed border-current bg-transparent',
        ]"
        data-tag-add
        >+{{ publicText(action.refs[tag.ref ?? '']?.title ?? tag.title) }}</span
      >
      <span
        v-for="tag in tags.removed"
        :key="tag.ref"
        class="inline-flex h-6.5 items-center rounded-full px-2 text-xs
          font-semibold line-through"
        :class="live ? 'bg-bg-error text-text-error' : 'bg-bg-3 text-text-3'"
        data-tag-remove
        >{{ publicText(action.refs[tag.ref]?.title ?? tag.title) }}</span
      >
    </div>

    <!-- A relation: one end, how they stand, the other -->
    <div
      v-if="relation"
      :class="[
        rule,
        'flex flex-wrap items-center gap-x-1.5 gap-y-1 border-border-2',
        relation.removed && 'line-through decoration-1',
        relation.removed && (live ? 'text-text-error' : 'text-text-3'),
      ]"
      data-action-relation
    >
      <AiEntityChip v-if="relation.from" :entity="relation.from" />
      <span
        v-if="relation.was"
        class="inline-flex items-center gap-1 whitespace-nowrap line-through
          decoration-1"
        :class="live ? 'text-text-error' : 'text-text-3'"
        ><Icon :name="relationWordIcon(relation.was)" class="shrink-0" />{{
          phrase.ai_action_relations[relation.was]
        }}</span
      >
      <span v-if="relation.was" class="text-text-3">→</span>
      <span
        class="inline-flex items-center gap-1 whitespace-nowrap"
        :class="
          relation.removed
            ? ''
            : live && (relation.was || !relation.removed)
              ? 'font-medium text-text-success'
              : 'text-text-2'
        "
        ><Icon :name="relationWordIcon(relation.word)" class="shrink-0" />{{
          phrase.ai_action_relations[relation.word]
        }}</span
      >
      <AiEntityChip :entity="relation.to" :title="relation.toRef" />
    </div>
    <p
      v-for="(note, index) in relation?.note ?? []"
      :key="`note-${index}`"
      :class="[rule, 'border-text-success/50']"
      :data-title-popup="editable ? phrase.ai_action_edit : undefined"
      @click="editable && emit('edit')"
    >
      {{ publicText(note) }}
    </p>

    <!-- A whole text: written, noted, remembered -->
    <p
      v-if="quote"
      :class="[
        rule,
        'line-clamp-5 whitespace-pre-line',
        live ? 'border-text-success/50' : 'border-border-2',
        editable ? 'cursor-text' : '',
      ]"
      :data-title-popup="editable ? phrase.ai_action_edit : undefined"
      data-action-quote
      @click="editable && emit('edit')"
    >
      {{ quote }}
    </p>

    <!-- A word of the dictionary -->
    <div
      v-if="term"
      :class="[
        rule,
        live ? 'border-text-success/50' : 'border-border-2',
        editable ? 'cursor-text' : '',
      ]"
      @click="editable && emit('edit')"
    >
      <p>
        <b class="font-semibold">{{ term.word }}</b>
        <span v-if="term.forms.length" class="text-text-2">
          · {{ term.forms.join(', ') }}</span
        >
        <AiPill v-if="payload.keep" class="ml-1.5">{{
          phrase.ai_action_term_keep
        }}</AiPill>
      </p>
      <p v-if="term.note" class="text-text-2">{{ term.note }}</p>
    </div>

    <!-- A memory in fewer facts -->
    <p v-if="facts" :class="[rule, 'border-border-2']">
      <AiActionValue :change="facts" :live />
    </p>

    <!-- A new entity: its fields -->
    <div
      v-if="created?.length"
      :class="[rule, 'flex flex-col gap-0.5 border-border-2']"
    >
      <p v-for="field in created" :key="field.name">
        <span class="mr-1 text-text-3">{{ field.name }}:</span>
        <template v-if="field.periods">
          <DateRangeChip
            v-for="(period, index) in field.periods"
            :key="index"
            :period
            class="mr-1"
          />
        </template>
        <span
          v-else
          class="font-medium"
          :class="live ? 'text-text-success' : 'text-text-2'"
          >{{ field.text }}</span
        >
      </p>
    </div>

    <!-- A text edit: its first parts -->
    <div v-if="revise" :class="[rule, 'flex flex-col gap-0.5 border-border-2']">
      <p v-for="(line, index) in revise.lines" :key="index">
        <span
          v-if="line.unsure"
          class="mr-1 font-semibold text-text-warning"
          :data-title-popup="phrase.ai_review_unsure"
          >?</span
        >
        <span v-if="line.name" class="mr-1 text-text-3"
          >{{ line.name }}<template v-if="line.change">:</template></span
        >
        <AiActionValue v-if="line.change" :change="line.change" :live />
      </p>
      <p v-if="revise.more" class="text-xs text-text-3">
        {{ phrase.ai_action_more(revise.more) }}
      </p>
    </div>

    <!-- A deletion: what goes -->
    <p
      v-if="deleted"
      :class="[
        rule,
        'font-medium line-through decoration-1',
        live
          ? 'border-text-error/50 text-text-error'
          : 'border-border-2 text-text-3',
      ]"
      data-action-deleted
    >
      {{ deleted }}
    </p>
  </div>
</template>

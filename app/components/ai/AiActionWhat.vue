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

/**
 * What one action says, in its row: the kind's words, the entities it
 * names, the change itself — a value and the one it replaces, tags added
 * and taken off, the text it writes. In a card of one kind the kind's name
 * is left to the header (`plain`); in an entity's own form the entity goes
 * unnamed, and a relation reads from its end (`here`).
 */
const props = defineProps<{
  action: AiActionItem;
  plain?: boolean;
  /** The ref of the entity whose form shows it. */
  here?: string;
}>();

/** The target is named unless its own form shows the action. */
const showTarget = computed(
  () => !props.here || props.here !== props.action.target?.ref,
);
/** A relation proposed from its other end, read from this one. */
const fromOtherEnd = computed(
  () => Boolean(props.here) && props.here === payload.value.other,
);
const payload = computed(() => props.action.payload as Record<string, any>);
const base = computed(() => (props.action.base ?? {}) as Record<string, any>);
const kindWords = computed(() => kindName(props.action.kind));

/**
 * How two entities stand to each other, drawn as the admin's relations
 * block draws it. A verb that agrees with no name — «depends on», «affects»
 * — is written out; «related» and a relation taken away are the icon alone,
 * their words in its hint, since in Russian they would have to agree with
 * the name before them.
 */
const relation = computed(() => {
  const removed = payload.value.op === 'remove';
  const word = (payload.value.relation ?? 'related') as RelationWord;
  const kind = fromOtherEnd.value ? RELATION_WORD_FROM_OTHER_END[word] : word;
  const words = removed
    ? phrase.value.ai_action_relation_removed
    : phrase.value.ai_action_relations[kind];
  return {
    icon: removed ? ('link-broken' as const) : relationWordIcon(kind),
    words,
    shown: !removed && kind !== 'related',
  };
});

const fieldWords = computed(() => fieldName(String(payload.value.field)));

/** The file a description is proposed for, in the library's window of it. */
function openFile() {
  if (props.action.file)
    void openModal(libraryAssetDetailsModal, { asset: props.action.file });
}
/**
 * What a change of a form says: each field in words, and the new words of a
 * short text — a button, a status line — where it sets them.
 */
const SHORT_TEXTS = new Set([
  'title',
  'summary',
  'reminder',
  'slogan',
  'displayName',
  'nickname',
  'actionText',
]);
const updateLines = computed(() =>
  Object.entries((payload.value.changes ?? {}) as Record<string, unknown>).map(
    ([field, value]) => ({
      field: fieldName(field),
      words:
        SHORT_TEXTS.has(field) && typeof value === 'string'
          ? [value]
          : field === 'statuses' && Array.isArray(value)
            ? value.map((item) => String((item as { text?: unknown }).text))
            : [],
    }),
  ),
);

const textName = computed(() => {
  const name = payload.value.text as string;
  return (
    phrase.value.ai_action_texts[
      name as keyof typeof phrase.value.ai_action_texts
    ] ?? name
  );
});

const reviseParts = computed(
  () => (payload.value.parts ?? []) as AiRevisePart[],
);
const corrections = computed(
  () => reviseParts.value.filter((part) => part.type === 'correction').length,
);
/** Parts left to the owner's judgement that still wait for it. */
const unsure = computed(() => {
  const states = new Map(
    (props.action.parts ?? []).map((part) => [part.id, part.state]),
  );
  return reviseParts.value.filter(
    (part) =>
      part.certainty === 'unsure' &&
      (states.get(part.id) ?? 'pending') === 'pending',
  ).length;
});

const tagsAdded = computed(
  () => (payload.value.add ?? []) as { ref?: string; title: string }[],
);
const tagsRemoved = computed(
  () => (payload.value.remove ?? []) as { ref: string; title: string }[],
);

const createTitle = computed(() => {
  const fields = (payload.value.fields ?? {}) as Record<string, unknown>;
  return String(fields.title ?? fields.date ?? '');
});
</script>

<template>
  <div
    class="flex min-w-0 flex-wrap items-center gap-1.5 leading-snug"
    data-action-what
  >
    <!-- A field set on its own -->
    <template v-if="action.kind === 'field'">
      <span class="text-text-2">{{ fieldWords }}</span>
      <AiEntityChip v-if="showTarget" :entity="action.target" />
    </template>

    <template v-else-if="action.kind === 'update'">
      <b v-if="!plain">{{
        phrase.ai_action_update_fields(
          updateLines.map((line) => line.field).join(', '),
        )
      }}</b>
      <AiEntityChip v-if="showTarget" :entity="action.target" />
      <template v-for="line in updateLines" :key="line.field">
        <span
          v-for="(words, index) in line.words.slice(0, 3)"
          :key="index"
          class="text-text-2"
          >{{ phrase.quoted(publicText(words)) }}</span
        >
      </template>
    </template>

    <template v-else-if="action.kind === 'periods'">
      <AiEntityChip v-if="showTarget" :entity="action.target" />
      <DateRangeChip
        v-for="(period, index) in payload.periods as Period[]"
        :key="index"
        :period
      />
    </template>

    <template v-else-if="action.kind === 'tags'">
      <AiEntityChip v-if="showTarget" :entity="action.target" />
      <span
        v-for="tag in tagsAdded"
        :key="tag.ref ?? tag.title"
        class="inline-flex h-6.5 items-center rounded-full px-2 text-xs
          font-semibold text-text-success"
        :class="
          tag.ref
            ? 'bg-bg-success'
            : 'border border-dashed border-text-success bg-transparent'
        "
        data-tag-add
        >+{{ publicText(action.refs[tag.ref ?? '']?.title ?? tag.title) }}</span
      >
      <span
        v-for="tag in tagsRemoved"
        :key="tag.ref"
        class="inline-flex h-6.5 items-center rounded-full bg-bg-error px-2
          text-xs font-semibold text-text-error line-through"
        data-tag-remove
        >{{ publicText(action.refs[tag.ref]?.title ?? tag.title) }}</span
      >
    </template>

    <template v-else-if="action.kind === 'relation'">
      <AiEntityChip
        v-if="showTarget && !fromOtherEnd"
        :entity="action.target"
      />
      <span
        class="inline-flex items-center gap-1 text-sm whitespace-nowrap
          text-text-2"
        :data-title-popup="relation.shown ? undefined : relation.words"
        data-action-relation
      >
        <Icon :name="relation.icon" class="shrink-0" />
        <span :class="{ 'sr-only': !relation.shown }">{{
          relation.words
        }}</span>
      </span>
      <AiEntityChip
        v-if="!fromOtherEnd"
        :entity="action.refs[payload.other]"
        :title="payload.other"
      />
      <AiEntityChip v-else :entity="action.target" />
    </template>

    <template v-else-if="action.kind === 'note'">
      <b v-if="!plain">{{ kindWords }}</b>
      <AiEntityChip v-if="showTarget" :entity="action.target" />
    </template>

    <!-- Remembered, or a memory said again in fewer facts: what about -->
    <template
      v-else-if="action.kind === 'remember' || action.kind === 'memory-compact'"
    >
      <b v-if="!plain">{{ kindWords }}</b>
      <span v-if="payload.about === 'owner'" class="font-medium">{{
        phrase.ai_memory_owner
      }}</span>
      <span v-else-if="payload.about === 'kind'" class="font-medium">{{
        phrase.ai_memory_kinds[
          payload.entityKind as keyof typeof phrase.ai_memory_kinds
        ] ?? payload.entityKind
      }}</span>
      <template v-else>
        <AiEntityChip v-if="showTarget" :entity="action.target" />
        <template v-if="payload.about === 'pair' && payload.other">
          <span class="text-text-3">{{ phrase.ai_action_and }}</span>
          <AiEntityChip
            :entity="action.refs[payload.other]"
            :title="payload.other"
          />
        </template>
      </template>
      <span v-if="action.kind === 'memory-compact'" class="text-text-2">{{
        phrase.ai_action_facts((payload.facts ?? []).length)
      }}</span>
    </template>

    <!-- A word of the owner's dictionary -->
    <template v-else-if="action.kind === 'term'">
      <b v-if="!plain">{{ kindWords }}</b>
      <span class="font-semibold">{{ payload.word }}</span>
      <span v-if="payload.forms?.length" class="text-text-2">{{
        payload.forms.join(', ')
      }}</span>
      <AiPill v-if="payload.keep">{{ phrase.ai_action_term_keep }}</AiPill>
    </template>

    <template v-else-if="action.kind === 'access'">
      <b v-if="!plain">{{ kindWords }}</b>
      <AiEntityChip v-if="showTarget" :entity="action.target" />
      <span
        v-if="base.access"
        class="text-text-error line-through decoration-1"
        >{{
          phrase.ai_action_access[
            base.access as keyof typeof phrase.ai_action_access
          ]
        }}</span
      >
      <span v-if="base.access" class="text-text-3">→</span>
      <span class="font-medium text-text-success">{{
        phrase.ai_action_access[
          payload.access as keyof typeof phrase.ai_action_access
        ]
      }}</span>
    </template>

    <template v-else-if="action.kind === 'write'">
      <b>{{
        phrase.ai_action_write_modes[
          payload.mode as keyof typeof phrase.ai_action_write_modes
        ]
      }}</b>
      <AiEntityChip v-if="showTarget" :entity="action.target" />
      <span class="text-text-2">{{ textName }}</span>
      <span
        class="inline-flex items-center gap-0.5 text-xs font-bold
          whitespace-nowrap text-accent"
        ><Icon name="sparkles" />{{ phrase.ai_action_by_ai }}</span
      >
    </template>

    <template v-else-if="action.kind === 'revise'">
      <b v-if="!plain">{{
        payload.mode === 'order'
          ? phrase.ai_action_order
          : payload.mode === 'relink'
            ? phrase.ai_action_relink
            : kindWords
      }}</b>
      <AiEntityChip v-if="showTarget" :entity="action.target" />
      <span class="text-text-2">{{ textName }}</span>
      <AiPill v-if="payload.mode === 'order'">{{
        phrase.ai_action_order_parts(reviseParts.length)
      }}</AiPill>
      <AiPill v-else-if="payload.mode === 'relink'">{{
        phrase.ai_action_relinks(reviseParts.length)
      }}</AiPill>
      <AiPill v-else>{{ phrase.ai_action_corrections(corrections) }}</AiPill>
      <AiPill v-if="unsure" tone="warning">{{
        phrase.ai_action_unsure_count(unsure)
      }}</AiPill>
    </template>

    <template v-else-if="action.kind === 'create'">
      <b>{{
        phrase.ai_action_create[
          payload.entity as keyof typeof phrase.ai_action_create
        ]
      }}</b>
      <AiEntityChip :kind="payload.entity" :title="createTitle" fresh />
      <template v-if="payload.entity === 'project-section'">
        <AiEntityChip v-if="showTarget" :entity="action.target" />
      </template>
    </template>

    <!-- A file described: the file itself, small, so the words can be
         checked against it, and opened for a closer look — but in its own
         window, where it is open already. -->
    <template v-else-if="action.kind === 'describe'">
      <b v-if="!plain">{{ kindWords }}</b>
      <button
        v-if="action.file && showTarget"
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
        data-action-file
      />
      <AiEntityChip v-if="showTarget" :entity="action.target" />
    </template>

    <template v-else-if="action.kind === 'delete'">
      <b v-if="!plain">{{ kindWords }}</b>
      <AiEntityChip v-if="showTarget" :entity="action.target" />
    </template>

    <template v-else>
      <b>{{ kindWords }}</b>
      <AiEntityChip v-if="showTarget" :entity="action.target" />
    </template>
  </div>
</template>

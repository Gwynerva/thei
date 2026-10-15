<script lang="ts" setup>
import { AI_OWNER_MEMORY_MAX } from '#layers/thei/shared/ai';
import type {
  AiMemoryEntityGroup,
  AiMemoryIndex,
  AiMemoryItem,
  AiTermItem,
} from '#layers/thei/shared/ai-memory';
import type { AiSettings } from '#layers/thei/shared/ai-settings';
import ContentInlineLinkDecorator from '#layers/thei/app/components/content/ContentInlineLinkDecorator.vue';

/**
 * What the AI keeps, in one place: «about you» — the owner's own words that
 * every session reads — the dictionary, what is kept about a whole kind, and
 * about entities, each opening in place. A search narrows all of it. What is
 * forgotten can be brought back for a moment, before it goes for good.
 */
const requestFetch = useRequestFetch();
// The entities named in records are links with their pictures, as in a text.
const root = useTemplateRef<HTMLElement>('root');
const linkResolver = useContentLinkResolver('admin');

const query = ref('');
const searched = ref('');
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(query, (value) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => (searched.value = value.trim()), 250);
});

const { data: index, refresh } = await useAsyncData(
  'ai-memory',
  () =>
    requestFetch<AiMemoryIndex>('/api/admin/ai/memory', {
      query: { q: searched.value || undefined },
    }),
  { watch: [searched] },
);

// ---- About you ------------------------------------------------------------------

const instructions = ref(index.value?.owner.text ?? '');
const savedInstructions = ref(instructions.value);
const dirty = computed(() => instructions.value !== savedInstructions.value);
useLeaveGuard({ dirty: () => dirty.value, inTab: true });
const saving = ref(false);
const ownerError = ref('');

async function saveInstructions() {
  if (saving.value || !dirty.value) return;
  saving.value = true;
  ownerError.value = '';
  try {
    const result = await $fetch<AiSettings>('/api/admin/ai/settings', {
      method: 'PUT',
      body: { instructions: instructions.value },
    });
    savedInstructions.value = result.instructions;
    instructions.value = result.instructions;
  } catch (caught) {
    ownerError.value = errorMessage(caught, phrase.value.ai_error);
  } finally {
    saving.value = false;
  }
}
useSaveShortcut(() => void saveInstructions(), {
  canSave: computed(() => dirty.value && !saving.value),
});

// ---- Forgetting, with a moment to bring it back -----------------------------------

const { hidden, forget } = useUndoableForget();

function forgetRecord(item: AiMemoryItem) {
  forget(item.memoryUuid, () =>
    sendDelete(`/api/admin/ai/memory/${item.memoryUuid}`),
  );
}

function forgetTerm(term: AiTermItem) {
  forget(`term:${term.word}`, () =>
    sendDelete(`/api/admin/ai/terms/${encodeURIComponent(term.word)}`),
  );
}

// ---- What is shown ------------------------------------------------------------

const ownerNever = computed(
  () =>
    index.value?.owner.never.filter(
      (item) => !hidden.value.has(item.memoryUuid),
    ) ?? [],
);
const terms = computed(
  () =>
    index.value?.terms.filter(
      (term) => !hidden.value.has(`term:${term.word}`),
    ) ?? [],
);
const kinds = computed(
  () =>
    index.value?.kinds.filter((item) => !hidden.value.has(item.memoryUuid)) ??
    [],
);

/** The entities shown: the first page, and the ones «more» brought. */
const more = ref<AiMemoryEntityGroup[]>([]);
const next = ref<number | undefined>();
watch(
  index,
  (value) => {
    more.value = [];
    next.value = value?.next;
  },
  { immediate: true },
);
const entities = computed(() =>
  [...(index.value?.entities ?? []), ...more.value].filter((group) =>
    group.items.some((item) => !hidden.value.has(item.memoryUuid)),
  ),
);
const loadingMore = ref(false);
async function loadMore() {
  if (loadingMore.value || next.value === undefined) return;
  loadingMore.value = true;
  try {
    const page = await $fetch<AiMemoryIndex>('/api/admin/ai/memory', {
      query: { q: searched.value || undefined, offset: next.value },
    });
    more.value = [...more.value, ...page.entities];
    next.value = page.next;
  } catch (caught) {
    showToast(errorMessage(caught, phrase.value.ai_error));
  } finally {
    loadingMore.value = false;
  }
}

/** A record said anew, in whichever list holds it. */
function saved(item: AiMemoryItem) {
  const swap = (items: AiMemoryItem[]) =>
    items.map((each) => (each.memoryUuid === item.memoryUuid ? item : each));
  if (!index.value) return;
  index.value = {
    ...index.value,
    kinds: swap(index.value.kinds),
    entities: index.value.entities.map((group) => ({
      ...group,
      items: swap(group.items),
    })),
  };
  more.value = more.value.map((group) => ({
    ...group,
    items: swap(group.items),
  }));
}

const searching = computed(() => Boolean(searched.value));
const nothingFound = computed(
  () =>
    searching.value &&
    !ownerNever.value.length &&
    !terms.value.length &&
    !kinds.value.length &&
    !entities.value.length,
);

// ---- The dictionary: a word added or changed in a popup ----------------------------

const termOpen = ref(false);
const termAnchor = ref<HTMLElement | null>(null);
const editingTerm = ref<AiTermItem>();
const termList = useTemplateRef<HTMLElement>('termList');

function openTerm(event: MouseEvent, term?: AiTermItem) {
  editingTerm.value = term;
  termAnchor.value = event.currentTarget as HTMLElement;
  termOpen.value = true;
}

/** A word added goes on top, where it is seen; one changed stays in place. */
function termSaved(term: AiTermItem, previous?: string) {
  if (!index.value) return;
  index.value = {
    ...index.value,
    terms: previous
      ? index.value.terms.map((each) => (each.word === previous ? term : each))
      : [term, ...index.value.terms],
  };
  if (!previous) termList.value?.scrollTo({ top: 0 });
}

// ---- Entities open one at a time, the opened row kept in its place -------------------

const openRef = ref<string>();
const entityList = useTemplateRef<HTMLElement>('entityList');

/**
 * Opens one entity and closes the other at once, so the row just opened
 * stays where the eye is: only it moves, inside its own window. While they
 * change, the list keeps its height — near the foot of the page, a page
 * growing shorter would pull everything down with it.
 */
async function toggle(ref: string) {
  if (openRef.value === ref) {
    openRef.value = undefined;
    return;
  }
  const list = entityList.value;
  const row = list?.querySelector<HTMLElement>(
    `[data-memory-entity="${CSS.escape(ref)}"]`,
  );
  const before = row?.getBoundingClientRect().top;
  const previous = openRef.value
    ? list?.querySelector<HTMLElement>(
        `[data-memory-entity="${CSS.escape(openRef.value)}"] [data-memory-entity-panel]`,
      )
    : null;
  if (list) list.style.minHeight = `${list.offsetHeight}px`;
  // The one closing does so without its transition, or the rows under it
  // would slide while the eye follows the one opening.
  if (previous) previous.style.transition = 'none';
  openRef.value = ref;
  await nextTick();
  if (row && before !== undefined)
    window.scrollBy(0, row.getBoundingClientRect().top - before);
  if (previous) requestAnimationFrame(() => (previous.style.transition = ''));
  setTimeout(() => {
    if (list) list.style.minHeight = '';
  }, 300);
}
</script>

<template>
  <div
    ref="root"
    class="mx-auto flex w-full max-w-184 flex-col gap-lg"
    data-ai-memory
  >
    <ContentInlineLinkDecorator :root="root ?? null" :resolver="linkResolver" />
    <label class="relative block">
      <FieldInput
        v-model="query"
        type="search"
        class="pl-9 pointer-coarse:h-11"
        :placeholder="phrase.ai_memory_search"
        :aria-label="phrase.ai_memory_search"
        data-memory-search
      />
      <Icon
        name="search"
        class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2
          text-text-3"
      />
    </label>

    <!-- About you: the owner's words, read in every session. -->
    <section v-if="!searching" class="flex flex-col gap-1.5">
      <SectionHeader
        icon="person"
        :title="phrase.ai_memory_owner"
        :description="phrase.ai_memory_owner_hint"
        class="mb-xs"
      ></SectionHeader>
      <div
        class="flex flex-col gap-sm rounded-normal border border-border-1
          bg-bg-2 p-sm sm:p-md"
      >
        <FieldTextarea
          v-model="instructions"
          class="min-h-26"
          :maxlength="AI_OWNER_MEMORY_MAX"
          :placeholder="phrase.ai_instructions_placeholder"
          :aria-label="phrase.ai_memory_owner"
          no-typography
          data-ai-instructions
        />
        <div class="flex flex-wrap items-center gap-sm">
          <span
            class="flex min-w-40 flex-1 items-center gap-2.5 text-xs text-text-2
              tabular-nums"
          >
            <span class="h-1 flex-1 overflow-hidden rounded-full bg-bg-3">
              <span
                class="block h-full rounded-full bg-accent"
                :style="{
                  width: `${Math.min(100, (instructions.length / AI_OWNER_MEMORY_MAX) * 100)}%`,
                }"
              ></span>
            </span>
            {{
              phrase.ai_memory_chars(instructions.length, AI_OWNER_MEMORY_MAX)
            }}
          </span>
          <span v-if="ownerError" class="text-sm text-text-error">{{
            ownerError
          }}</span>
          <Button
            class="flex h-9 items-center gap-xs pointer-coarse:h-11"
            :disabled="saving || !dirty"
            data-ai-instructions-save
            @click="saveInstructions"
          >
            <Icon v-if="saving" name="loading" />{{
              dirty ? phrase.save : phrase.saved
            }}
          </Button>
        </div>
      </div>
    </section>
    <section v-if="ownerNever.length" class="flex flex-col gap-1.5">
      <SectionHeader
        icon="visibility-off"
        :title="phrase.ai_memory_owner_never"
        :description="undefined"
        class="mb-xs"
      ></SectionHeader>
      <div class="rounded-normal border border-border-1 bg-bg-2">
        <AiMemoryRecord
          v-for="item in ownerNever"
          :key="item.memoryUuid"
          :item
          @forget="forgetRecord(item)"
          @saved="saved"
        />
      </div>
    </section>

    <!-- The dictionary: a word added from the «+», the words in a window of
         their own, so the page keeps its height. -->
    <section
      v-if="!searching || terms.length"
      class="flex flex-col gap-1.5"
      data-memory-terms
    >
      <SectionHeader
        icon="case-important"
        :title="phrase.ai_memory_terms"
        :description="phrase.ai_memory_terms_hint"
        class="mb-xs"
      >
        <template #action>
          <SectionAddButton
            :label="phrase.ai_memory_term_add"
            :expanded="termOpen && !editingTerm"
            data-term-add
            @click="openTerm($event)"
          />
        </template>
      </SectionHeader>
      <div class="rounded-normal border border-border-1 bg-bg-2">
        <div
          ref="termList"
          class="scrollbar-hover max-h-76 overflow-y-auto overscroll-contain"
        >
          <AiTermRow
            v-for="term in terms"
            :key="term.word"
            :term
            @edit="openTerm($event, term)"
            @remove="forgetTerm(term)"
          />
          <p v-if="!terms.length" class="px-sm py-2.5 text-sm text-text-3">
            {{ phrase.ai_memory_nothing }}
          </p>
        </div>
      </div>
    </section>

    <section
      v-if="!searching || kinds.length"
      class="flex flex-col gap-1.5"
      data-memory-kinds
    >
      <SectionHeader
        icon="list-check"
        :title="phrase.ai_memory_kinds_title"
        :description="phrase.ai_memory_kinds_hint"
        class="mb-xs"
      ></SectionHeader>
      <div class="rounded-normal border border-border-1 bg-bg-2">
        <AiMemoryRecord
          v-for="item in kinds"
          :key="item.memoryUuid"
          :item
          :label="
            item.kind && item.kind !== 'profile'
              ? phrase.ai_memory_kinds[item.kind]
              : undefined
          "
          @forget="forgetRecord(item)"
          @saved="saved"
        />
        <p v-if="!kinds.length" class="px-sm py-2.5 text-sm text-text-3">
          {{ phrase.ai_memory_nothing }}
        </p>
      </div>
    </section>

    <section
      v-if="!searching || entities.length"
      class="flex flex-col gap-1.5"
      data-memory-entities
    >
      <SectionHeader
        icon="project"
        :title="phrase.ai_memory_entities_title"
        :description="phrase.ai_memory_entities_hint"
        class="mb-xs"
      ></SectionHeader>
      <div
        ref="entityList"
        class="overflow-hidden rounded-normal border border-border-1 bg-bg-2
          [overflow-anchor:none]"
      >
        <AiMemoryEntity
          v-for="group in entities"
          :key="group.entity.ref"
          :group
          :hidden
          :open="openRef === group.entity.ref"
          @toggle="toggle(group.entity.ref)"
          @forget="forgetRecord"
          @saved="saved"
        />
        <p v-if="!entities.length" class="px-sm py-2.5 text-sm text-text-3">
          {{ phrase.ai_memory_nothing }}
        </p>
        <div
          v-if="next !== undefined"
          class="flex justify-center border-t border-border-1/70 p-1"
        >
          <Button
            variant="secondary"
            class="flex h-8 items-center gap-xs bg-transparent text-sm
              pointer-coarse:h-11"
            :disabled="loadingMore"
            data-memory-more
            @click="loadMore"
          >
            <Icon v-if="loadingMore" name="loading" />{{
              phrase.ai_memory_more((index?.entityCount ?? 0) - entities.length)
            }}
          </Button>
        </div>
      </div>
    </section>

    <p v-if="nothingFound" class="text-center text-sm text-text-3">
      {{ phrase.admin_search_no_results }}
    </p>

    <AiTermPopup
      v-model:open="termOpen"
      :anchor="termAnchor"
      :term="editingTerm"
      :terms="index?.terms ?? []"
      @saved="termSaved"
    />
  </div>
</template>

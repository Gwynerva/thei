<script lang="ts" setup>
import ReviewMark from './ReviewMark.vue';
import type {
  ReviewDecision,
  ReviewPart,
} from '#layers/thei/shared/content-review';
import ReviewFiles from './ReviewFiles.vue';
import { reviewChangesLine, reviewPartIcon, reviewQuoteMark } from './review';

/**
 * Every part in a row, under the heading each stands in, with the owner's
 * word on each beside it: a way through a long edit without reading the
 * text, narrowed to what waits for a decision, the words, or the blocks.
 * The part in hand — the one the bar went on to — is marked and brought
 * into sight.
 */
const props = defineProps<{
  parts: ReviewPart[];
  mode: 'ai' | 'version';
  decisions: Readonly<Record<string, ReviewDecision>>;
  current?: string;
}>();
const emit = defineEmits<{
  decide: [id: string, decision: ReviewDecision];
}>();

type Filter = 'all' | 'unsure' | 'words' | 'blocks';
const filter = ref<Filter>('all');

const counts = computed(() => ({
  all: props.parts.length,
  unsure: props.parts.filter((part) => !part.sure).length,
  words: props.parts.filter((part) => !part.whole).length,
  blocks: props.parts.filter((part) => part.whole).length,
}));
/** The filters that would narrow anything at all. */
const filters = computed(() =>
  (['all', 'unsure', 'words', 'blocks'] as const).filter(
    (key) =>
      key === 'all' ||
      (counts.value[key] > 0 && counts.value[key] < counts.value.all),
  ),
);

const shown = computed(() =>
  props.parts.filter(
    (part) =>
      filter.value === 'all' ||
      (filter.value === 'unsure' && !part.sure) ||
      (filter.value === 'words' && !part.whole) ||
      (filter.value === 'blocks' && part.whole),
  ),
);

/** The parts under each heading, in order; private ones under their own. */
const groups = computed(() => {
  const result: { title: string; private: boolean; parts: ReviewPart[] }[] = [];
  for (const part of shown.value) {
    const title = part.private
      ? phrase.value.ai_review_private
      : (part.heading ?? '');
    const last = result.at(-1);
    if (last && last.title === title && last.private === part.private)
      last.parts.push(part);
    else result.push({ title, private: part.private, parts: [part] });
  }
  return result;
});

const words = computed(() => phrase.value.ai_review_modes[props.mode]);

const root = useTemplateRef<HTMLElement>('root');
/** Brings a part's row into sight, the filters let go when they hide it. */
async function reveal(id: string) {
  if (!shown.value.some((part) => part.id === id)) {
    filter.value = 'all';
    await nextTick();
  }
  root.value
    ?.querySelector(`[data-review-item="${CSS.escape(id)}"]`)
    ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
defineExpose({ reveal });
const stateOf = (part: ReviewPart) => props.decisions[part.id] ?? 'pending';
</script>

<template>
  <div ref="root" class="flex flex-col" data-review-list>
    <div
      v-if="filters.length > 1"
      class="mb-1.5 flex [scrollbar-width:none] gap-1.5 overflow-x-auto"
    >
      <button
        v-for="key in filters"
        :key
        type="button"
        class="flex h-8 shrink-0 cursor-pointer items-center gap-1.5
          rounded-full border px-2.5 text-xs pointer-coarse:h-10"
        :class="
          filter === key
            ? 'border-accent bg-bg-accent font-semibold text-accent'
            : 'border-border-1 bg-bg-1 text-text-2'
        "
        :aria-pressed="filter === key"
        :data-review-filter="key"
        @click="filter = key"
      >
        {{ phrase.ai_review_filters[key] }}
        <span
          class="rounded-full px-1.5 text-2xs font-bold"
          :class="
            filter === key
              ? 'bg-accent text-white dark:text-bg-1'
              : 'bg-bg-3 text-text-2'
          "
          >{{ counts[key] }}</span
        >
      </button>
    </div>

    <template v-for="(group, groupIndex) in groups" :key="groupIndex">
      <p
        v-if="group.title"
        class="mt-md mb-0.5 flex items-center gap-1.5 text-2xs font-bold
          tracking-wider text-text-3 uppercase"
      >
        <Icon v-if="group.private" name="lock-close" />{{
          publicText(group.title)
        }}
      </p>
      <div
        v-for="part in group.parts"
        :key="part.id"
        class="-mx-2 grid scroll-my-md grid-cols-[auto_minmax(0,1fr)_auto]
          items-start gap-x-2.5 gap-y-0.5 rounded-sm border-t border-border-1/70
          px-2 py-2.5 transition-colors"
        :class="part.id === current ? 'bg-bg-accent' : ''"
        :data-review-item="part.id"
        :data-current="part.id === current ? '' : undefined"
        :data-state="stateOf(part)"
      >
        <span
          class="row-span-2 flex size-7 items-center justify-center
            rounded-full"
          :class="
            stateOf(part) === 'accepted'
              ? 'bg-bg-success text-text-success'
              : stateOf(part) === 'kept'
                ? 'bg-bg-3 text-text-3'
                : part.sure
                  ? 'bg-bg-accent text-accent'
                  : 'bg-bg-warning text-text-warning'
          "
          ><Icon :name="reviewPartIcon(part)"
        /></span>
        <p class="text-sm leading-normal wrap-anywhere">
          <template v-if="part.link"
            ><template v-if="part.link.words"
              >{{ phrase.quoted(part.link.words) }} → </template
            ><ReviewMark v-if="!part.link.made" kind="removed">{{
              part.link.from
                ? publicText(part.link.from)
                : phrase.ai_review_link_gone
            }}</ReviewMark
            ><ReviewMark kind="added">{{
              part.link.to
                ? publicText(part.link.to)
                : part.link.made
                  ? phrase.ai_review_kinds.link
                  : phrase.ai_review_link_off
            }}</ReviewMark></template
          >
          <template v-else-if="part.words"
            >{{ part.words.around[0]
            }}<ReviewMark kind="removed">{{ part.words.before }}</ReviewMark
            ><ReviewMark kind="added">{{ part.words.after }}</ReviewMark
            >{{ part.words.around[1] }}</template
          >
          <template v-else-if="part.diff"
            ><template v-for="(words, index) in part.diff" :key="index"
              ><ReviewMark v-if="words.kind !== 'same'" :kind="words.kind">{{
                words.text
              }}</ReviewMark
              ><template v-else>{{ words.text }}</template></template
            ></template
          >
          <template v-else-if="part.before !== undefined"
            ><ReviewMark kind="removed">{{
              publicText(part.before)
            }}</ReviewMark
            ><ReviewMark kind="added">{{
              publicText(part.quote ?? '')
            }}</ReviewMark></template
          >
          <template v-else-if="part.quote"
            ><ReviewMark
              v-if="reviewQuoteMark(part)"
              :kind="reviewQuoteMark(part)!"
              >{{ publicText(part.quote) }}</ReviewMark
            ><template v-else>{{ publicText(part.quote) }}</template></template
          >
          <template v-else>{{ reviewChangesLine(part) }}</template>
        </p>
        <ReviewFiles
          v-if="part.files"
          :files="part.files"
          class="col-start-2 mt-1"
        />
        <p class="col-start-2 text-xs leading-snug text-text-2">
          {{ phrase.ai_review_kinds[part.kind]
          }}<template v-if="part.quote && reviewChangesLine(part)">
            · {{ reviewChangesLine(part) }}</template
          ><template v-if="part.place">
            · {{ phrase.ai_review_where[part.place] }}</template
          ><template v-if="!part.sure">
            · {{ phrase.ai_review_unsure }}</template
          ><template v-if="part.settled">
            ·
            {{
              part.link && part.settled === 'stale'
                ? phrase.ai_review_link_changed
                : phrase.ai_review_settled[part.settled]
            }}</template
          >
        </p>
        <span
          v-if="!part.settled"
          class="col-start-3 row-span-2 row-start-1 flex items-center gap-1
            self-center"
        >
          <template v-if="stateOf(part) !== 'pending'">
            <span
              class="text-xs whitespace-nowrap"
              :class="
                stateOf(part) === 'accepted'
                  ? 'text-text-success'
                  : 'text-text-2'
              "
              >{{
                stateOf(part) === 'accepted' ? words.accepted : words.kept
              }}</span
            >
            <Button
              variant="secondary"
              size="icon-sm"
              class="bg-transparent pointer-coarse:size-11"
              :aria-label="phrase.ai_review_undo"
              :data-title-popup="phrase.ai_review_undo"
              @click="emit('decide', part.id, 'pending')"
              ><Icon name="rotate-right" class="-scale-x-100"
            /></Button>
          </template>
          <template v-else>
            <Button
              variant="secondary"
              size="icon-sm"
              class="pointer-coarse:size-11"
              :aria-label="words.keep"
              :data-title-popup="words.keep"
              data-review-keep
              @click="emit('decide', part.id, 'kept')"
              ><Icon name="close"
            /></Button>
            <Button
              size="icon-sm"
              class="pointer-coarse:size-11"
              :aria-label="words.accept"
              :data-title-popup="words.accept"
              data-review-accept
              @click="emit('decide', part.id, 'accepted')"
              ><Icon name="check"
            /></Button>
          </template>
        </span>
      </div>
    </template>
  </div>
</template>

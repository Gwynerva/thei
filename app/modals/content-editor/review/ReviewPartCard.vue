<script lang="ts" setup>
import ReviewMark from './ReviewMark.vue';
import type {
  ReviewDecision,
  ReviewPart,
} from '#layers/thei/shared/content-review';
import AiCommentBox from '#layers/thei/app/components/ai/AiCommentBox.vue';
import { reviewPartIcon } from './review';

/**
 * One part, in hand: what it is, what it changes — the words as they are
 * and as they would be, or the block — why, and the owner's word on it.
 * The way through goes on from here: the part before and the part after.
 */
const props = defineProps<{
  part: ReviewPart;
  mode: 'ai' | 'version';
  decision: ReviewDecision;
  /** Its place among the parts, from 1, and how many there are. */
  index: number;
  total: number;
  /** An AI's edit is answered with a comment: the model makes it anew. */
  commentable?: boolean;
}>();
const emit = defineEmits<{
  decide: [decision: ReviewDecision];
  go: [step: -1 | 1];
  comment: [text: string];
}>();

const words = computed(() => phrase.value.ai_review_modes[props.mode]);
const commenting = ref(false);
const commented = ref(false);

function send(text: string) {
  commenting.value = false;
  commented.value = true;
  emit('comment', text);
}
</script>

<template>
  <div class="flex flex-col gap-xs" :data-review-card="part.id">
    <div class="flex flex-wrap items-center gap-1.5">
      <span
        class="inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs
          font-semibold"
        :class="
          part.sure
            ? 'bg-bg-accent text-accent'
            : 'bg-bg-warning text-text-warning'
        "
        ><Icon :name="reviewPartIcon(part)" />{{
          phrase.ai_review_kinds[part.kind]
        }}<template v-if="!part.sure">
          · {{ phrase.ai_review_unsure }}</template
        ></span
      >
      <span
        v-if="part.private"
        class="inline-flex h-6 items-center gap-1 rounded-full bg-bg-3 px-2
          text-xs text-text-2"
        ><Icon name="lock-close" />{{ phrase.ai_review_private }}</span
      >
      <span v-if="part.place" class="text-xs text-text-2">{{
        phrase.ai_review_where[part.place]
      }}</span>
    </div>

    <!-- Words: as they are, and as they would be. -->
    <dl
      v-if="part.words"
      class="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2.5
        gap-y-1 text-sm wrap-anywhere"
    >
      <dt class="text-2xs font-bold tracking-wide text-text-3 uppercase">
        {{ words.was }}
      </dt>
      <dd>
        {{ part.words.around[0]
        }}<ReviewMark kind="removed">{{ part.words.before }}</ReviewMark
        >{{ part.words.around[1] }}
      </dd>
      <dt class="text-2xs font-bold tracking-wide text-text-3 uppercase">
        {{ words.will }}
      </dt>
      <dd>
        {{ part.words.around[0]
        }}<ReviewMark kind="added">{{ part.words.after }}</ReviewMark
        >{{ part.words.around[1] }}
      </dd>
    </dl>
    <!-- A link mended: its words, where they lead now and would. -->
    <dl
      v-else-if="part.link"
      class="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2.5
        gap-y-1 text-sm wrap-anywhere"
      data-review-link
    >
      <dt class="text-2xs font-bold tracking-wide text-text-3 uppercase">
        {{ words.was }}
      </dt>
      <dd>
        <template v-if="part.link.words">«{{ part.link.words }}» → </template
        ><ReviewMark kind="removed">{{
          part.link.from
            ? publicText(part.link.from)
            : phrase.ai_review_link_gone
        }}</ReviewMark>
      </dd>
      <dt class="text-2xs font-bold tracking-wide text-text-3 uppercase">
        {{ words.will }}
      </dt>
      <dd>
        <template v-if="part.link.words">«{{ part.link.words }}» → </template
        ><ReviewMark kind="added">{{
          part.link.to ? publicText(part.link.to) : phrase.ai_review_link_off
        }}</ReviewMark>
      </dd>
    </dl>
    <!-- A block another version rewrote, its words compared. -->
    <p
      v-else-if="part.diff"
      class="max-h-48 overflow-y-auto text-sm leading-relaxed
        whitespace-pre-line"
    >
      <template v-for="(item, itemIndex) in part.diff" :key="itemIndex"
        ><ReviewMark v-if="item.kind !== 'same'" :kind="item.kind">{{
          item.text
        }}</ReviewMark
        ><template v-else>{{ item.text }}</template></template
      >
    </p>
    <!-- A block changed elsewhere than in its words: as it is, as it would be. -->
    <dl
      v-else-if="part.before !== undefined"
      class="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2.5
        gap-y-1 text-sm wrap-anywhere"
      data-review-quotes
    >
      <dt class="text-2xs font-bold tracking-wide text-text-3 uppercase">
        {{ words.was }}
      </dt>
      <dd class="line-clamp-4">
        <ReviewMark kind="removed">{{ part.before }}</ReviewMark>
      </dd>
      <dt class="text-2xs font-bold tracking-wide text-text-3 uppercase">
        {{ words.will }}
      </dt>
      <dd class="line-clamp-4">
        <ReviewMark kind="added">{{ part.quote }}</ReviewMark>
      </dd>
    </dl>
    <!-- A block that comes or goes; one that says nothing is seen in the text. -->
    <dl
      v-else-if="part.quote"
      class="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2.5
        text-sm wrap-anywhere"
    >
      <dt class="text-2xs font-bold tracking-wide text-text-3 uppercase">
        {{ part.kind === 'removed' ? words.was : words.will }}
      </dt>
      <dd
        class="line-clamp-4"
        :class="{ 'line-through': part.kind === 'removed' }"
      >
        {{ part.quote }}
      </dd>
    </dl>

    <p v-if="part.reason" class="text-xs leading-snug text-text-2">
      {{ publicText(part.reason) }}
    </p>
    <p v-if="part.settled" class="flex items-center gap-1 text-xs text-text-2">
      <Icon :name="part.settled === 'applied' ? 'check' : 'warning'" />{{
        part.link && part.settled === 'stale'
          ? phrase.ai_review_link_changed
          : phrase.ai_review_settled[part.settled]
      }}
    </p>

    <AiCommentBox
      v-if="commenting"
      :quick="[]"
      :placeholder="phrase.ai_review_comment_placeholder"
      @send="send"
    />
    <p v-else-if="commented" class="flex items-start gap-1 text-xs text-accent">
      <Icon name="sparkles" class="mt-0.5 shrink-0" />{{
        phrase.ai_review_comment_sent
      }}
    </p>

    <div class="flex items-center gap-1.5 pt-0.5">
      <span class="flex items-center text-xs text-text-2 tabular-nums">
        <Button
          variant="secondary"
          size="icon-sm"
          class="bg-transparent pointer-coarse:size-11"
          :aria-label="phrase.ai_review_prev"
          :data-title-popup="phrase.ai_review_prev"
          data-review-prev
          @click="emit('go', -1)"
          ><Icon name="chevron-left"
        /></Button>
        {{ index }} / {{ total }}
        <Button
          variant="secondary"
          size="icon-sm"
          class="bg-transparent pointer-coarse:size-11"
          :aria-label="phrase.ai_review_next"
          :data-title-popup="phrase.ai_review_next"
          data-review-next-part
          @click="emit('go', 1)"
          ><Icon name="chevron-right"
        /></Button>
      </span>

      <span v-if="!part.settled" class="ml-auto flex items-center gap-1.5">
        <template v-if="decision !== 'pending'">
          <span
            class="text-xs whitespace-nowrap"
            :class="
              decision === 'accepted' ? 'text-text-success' : 'text-text-2'
            "
            >{{ decision === 'accepted' ? words.accepted : words.kept }}</span
          >
          <Button
            variant="secondary"
            size="icon-sm"
            class="bg-transparent pointer-coarse:size-11"
            :aria-label="phrase.ai_review_undo"
            :data-title-popup="phrase.ai_review_undo"
            data-review-undo
            @click="emit('decide', 'pending')"
            ><Icon name="rotate-right" class="-scale-x-100"
          /></Button>
        </template>
        <template v-else>
          <Button
            v-if="commentable && !commenting"
            variant="secondary"
            size="icon-sm"
            class="pointer-coarse:size-11"
            :aria-label="phrase.ai_action_comment"
            :data-title-popup="phrase.ai_action_comment"
            data-review-comment
            @click="commenting = true"
            ><Icon name="comment"
          /></Button>
          <Button
            variant="secondary"
            size="icon-sm"
            class="pointer-coarse:size-11"
            :aria-label="words.keep"
            :data-title-popup="words.keep"
            data-review-keep
            @click="emit('decide', 'kept')"
            ><Icon name="close"
          /></Button>
          <Button
            size="icon-sm"
            class="pointer-coarse:size-11"
            :aria-label="words.accept"
            :data-title-popup="words.accept"
            data-review-accept
            @click="emit('decide', 'accepted')"
            ><Icon name="check"
          /></Button>
        </template>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AiReviewText } from '#layers/thei/shared/ai';
import type { ReviewDecision } from '#layers/thei/shared/content-review';
import {
  partComment,
  storedDecisions,
  textEditReview,
} from '../content-editor/review/review';
import ModalContainer from '../ModalContainer.vue';
import ContentReview from '../content-editor/review/ContentReview.vue';

/**
 * An AI's edit of a text gone through on its own, from the session it came
 * in: the text as it is stored now, the edit's parts over it. What is
 * accepted goes into the stored text at once — the text before stays in its
 * history — and what is left undecided waits in the session, the owner's
 * word on the rest kept with it.
 */
const { modalData } = defineProps<{ modalData: { actionUuid: string } }>();
const emit = defineEmits<{ modalResult: [{ type: 'applied' }] }>();

const text = shallowRef<AiReviewText>();
const loadError = ref('');
const busy = ref(false);
const error = ref('');
const linkResolver = useContentLinkResolver('admin');

onMounted(async () => {
  try {
    text.value = await $fetch<AiReviewText>(
      `/api/admin/ai/actions/${modalData.actionUuid}/text`,
    );
  } catch (caught) {
    loadError.value = errorMessage(caught, phrase.value.ai_error);
  }
});

const payload = computed(
  () => text.value?.action.payload as { text: string } | undefined,
);
const review = computed(() =>
  text.value ? textEditReview(text.value.action, text.value.data) : undefined,
);
/** The owner's word on parts so far, as the action keeps it. */
const initial = computed(() =>
  text.value ? storedDecisions(text.value.action) : {},
);

const context = computed(() => {
  const action = text.value?.action;
  if (!action?.target || !payload.value) return '';
  const name =
    phrase.value.ai_action_texts[
      payload.value.text as keyof typeof phrase.value.ai_action_texts
    ] ?? payload.value.text;
  return `${entityListName({ title: action.target.title, date: action.target.type === 'diary-entry' ? action.target.title : undefined })} · ${name}`;
});

async function done(decisions: Record<string, ReviewDecision>) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const outcome = await aiApi.apply([modalData.actionUuid], {
      [modalData.actionUuid]: decisions,
    });
    tellEntitiesChanged(outcome.changed);
    if (outcome.failed) {
      error.value = outcome.failed.error;
      return;
    }
    if (outcome.refused) {
      error.value = outcome.refused;
      return;
    }
    const count = Object.values(decisions).filter(
      (decision) => decision === 'accepted',
    ).length;
    showToast(phrase.value.ai_review_applied(count));
    emit('modalResult', { type: 'applied' });
  } catch (caught) {
    error.value = errorMessage(caught, phrase.value.ai_error);
  } finally {
    busy.value = false;
  }
}

/** Closed undecided: the owner's word on what they did decide is kept. */
async function close(decisions: Record<string, ReviewDecision>) {
  closeModal();
  const said = Object.entries(decisions).filter(
    ([id, decision]) => decision !== (initial.value[id] ?? 'pending'),
  );
  if (said.length)
    await aiApi
      .decideParts(modalData.actionUuid, Object.fromEntries(said))
      .catch(() => undefined);
}

function comment(partId: string, words: string) {
  if (!review.value) return;
  void aiApi
    .comment(modalData.actionUuid, partComment(review.value, partId, words))
    .catch((caught) => showToast(errorMessage(caught, phrase.value.ai_error)));
}
</script>

<template>
  <ContentReview
    v-if="review"
    :review
    mode="ai"
    :title="phrase.ai_review_title"
    :context
    :why="text?.action.reason ? publicText(text.action.reason) : undefined"
    :why-link="
      text?.session
        ? {
            to: {
              path: '/admin/ai/',
              query: { session: text.session.sessionUuid },
            },
            label: phrase.ai_review_from_session(sessionTitle(text.session)),
          }
        : undefined
    "
    :initial
    target="text"
    :busy
    :error
    commentable
    :link-resolver
    @close="close"
    @done="done"
    @comment="comment"
  />
  <ModalContainer v-else class="max-w-140">
    <div class="flex items-center gap-xs p-md text-text-2">
      <template v-if="loadError">
        <Icon name="warning" class="text-text-error" />{{ loadError }}
      </template>
      <Icon v-else name="loading" />
    </div>
  </ModalContainer>
</template>

<script lang="ts" setup>
import type { TagContainerType } from '#layers/thei/shared/tag';
import type { TagCandidateItem } from '#layers/thei/shared/tag-recommendation';

/**
 * Projects and events without this tag that it seems to fit, each a click
 * away from carrying it. A tag is usually created for the entity in front of
 * the person, long after the others it belongs on were written.
 *
 * Loaded in the browser only: the list is a suggestion, and the page is
 * complete without it.
 */
const { tagUuid, revision = 0 } = defineProps<{
  tagUuid: string;
  /** Changes after each save of the tag; the list is asked for again. */
  revision?: number;
}>();
const emit = defineEmits<{ added: [type: TagContainerType] }>();

const candidates = ref<TagCandidateItem[]>();
const failed = ref(false);
const added = ref(new Set<string>());
const adding = ref(new Set<string>());

const key = (candidate: TagCandidateItem) =>
  `${candidate.type}:${candidate.id}`;

async function load() {
  try {
    candidates.value = await $fetch<TagCandidateItem[]>(
      `/api/admin/tags/${tagUuid}/candidates`,
    );
    failed.value = false;
  } catch {
    failed.value = true;
  }
}

onMounted(() => {
  void load();
  watch(
    () => revision,
    () => void load(),
  );
});

async function add(candidate: TagCandidateItem) {
  const id = key(candidate);
  if (adding.value.has(id) || added.value.has(id)) return;
  adding.value = new Set(adding.value).add(id);
  try {
    await $fetch(`/api/admin/tags/${tagUuid}/usages`, {
      method: 'POST',
      body: { type: candidate.type, id: candidate.id },
    });
    added.value = new Set(added.value).add(id);
    emit('added', candidate.type);
  } catch {
    failed.value = true;
  } finally {
    const next = new Set(adding.value);
    next.delete(id);
    adding.value = next;
  }
}

function editPath(candidate: TagCandidateItem) {
  return candidate.type === 'project'
    ? `/admin/projects/${candidate.id}/edit/`
    : `/admin/events/${candidate.id}/edit/`;
}
</script>

<template>
  <div>
    <SectionHeader
      icon="tag"
      :title="phrase.tag_candidates"
      :description="phrase.tag_candidates_hint"
      class="mb-md"
    />
    <Box class="overflow-hidden">
      <div
        v-if="!candidates && !failed"
        class="flex justify-center p-md text-text-3"
      >
        <Icon name="loading" />
      </div>
      <p
        v-else-if="failed && !candidates?.length"
        role="status"
        class="p-sm text-sm text-text-error sm:p-md"
      >
        {{ phrase.tag_candidates_error }}
      </p>
      <p
        v-else-if="!candidates?.length"
        class="p-sm text-sm text-text-3 sm:p-md"
      >
        {{ phrase.tag_candidates_empty }}
      </p>
      <template v-else>
        <AdminEntityListItem
          v-for="candidate in candidates"
          :key="key(candidate)"
          :entity-type="candidate.type"
          :title="candidate.title"
          :summary="tagReasonText(candidate.reasons)"
          :preview-media="candidate.previewMedia"
          :edit-to="editPath(candidate)"
          compact
          show-type
        >
          <template #trailing>
            <Button
              variant="secondary"
              class="flex items-center gap-1 font-semibold"
              :disabled="
                added.has(key(candidate)) || adding.has(key(candidate))
              "
              :aria-label="
                added.has(key(candidate))
                  ? phrase.tag_candidate_added
                  : phrase.tag_candidate_add
              "
              @click="add(candidate)"
            >
              <Icon
                :name="
                  adding.has(key(candidate))
                    ? 'loading'
                    : added.has(key(candidate))
                      ? 'check'
                      : 'plus-circle'
                "
                class="shrink-0"
              />
              <span class="hidden sm:inline">{{
                added.has(key(candidate))
                  ? phrase.tag_candidate_added
                  : phrase.tag_candidate_add
              }}</span>
            </Button>
          </template>
        </AdminEntityListItem>
      </template>
    </Box>
  </div>
</template>

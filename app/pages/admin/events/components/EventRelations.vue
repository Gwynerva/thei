<script lang="ts" setup>
import type { EventProjectRelationEditItem } from '#layers/thei/shared/event';
import type { ProjectSearchItem } from '#layers/thei/shared/api/project';
import { buildProjectUrl } from '#layers/thei/shared/project-url';

const model = defineModel<EventProjectRelationEditItem[]>({ required: true });
const open = ref(false);
const addButton = useTemplateRef<HTMLElement>('addButton');
const popup = useTemplateRef<{ focus: () => void }>('popup');
const root = useTemplateRef<HTMLElement>('root');
let sorter: ReturnType<typeof createDragSort> | undefined;

function add(project: ProjectSearchItem) {
  model.value = [...model.value, project];
  open.value = false;
}

function remove(projectUuid: string) {
  model.value = model.value.filter((item) => item.projectUuid !== projectUuid);
}

function updateNote(projectUuid: string, note: string) {
  model.value = model.value.map((item) =>
    item.projectUuid === projectUuid ? { ...item, note } : item,
  );
}

onMounted(() => {
  if (!root.value) return;
  sorter = createDragSort(root.value, {
    handle: '[data-relation-handle]',
    onDrop: ({ id, newIndex }) => {
      const current = model.value.findIndex((item) => item.projectUuid === id);
      if (current < 0 || current === newIndex) return;
      const next = [...model.value];
      const [item] = next.splice(current, 1);
      next.splice(newIndex, 0, item!);
      model.value = next;
    },
  });
});
onUnmounted(() => sorter?.destroy());
</script>

<template>
  <div>
    <div class="mb-md flex items-center gap-md">
      <SectionHeader
        icon="arrow-cycle"
        :title="phrase.event_relations"
        :description="phrase.event_relations_hint"
        class="flex-1"
      />
      <button
        ref="addButton"
        type="button"
        class="size-12 cursor-pointer rounded-normal bg-bg-3 text-text-2
          transition hocus:bg-bg-accent hocus:text-accent"
        @click="open = !open"
      >
        <Icon name="plus" />
      </button>
    </div>
    <FloatingPopup
      v-model:open="open"
      :anchor="addButton"
      placement="bottom-end"
      @opened="popup?.focus()"
    >
      <ProjectSearchPopup
        ref="popup"
        :exclude-project-uuids="model.map((item) => item.projectUuid)"
        @select="add"
      />
    </FloatingPopup>
    <Box>
      <div ref="root" class="flex min-h-16 flex-col overflow-hidden">
        <div
          v-for="relation in model"
          :key="relation.projectUuid"
          :data-drag-id="relation.projectUuid"
          class="border-t border-border-1 p-sm first:border-t-0 sm:p-md"
        >
          <div class="flex min-w-0 items-center gap-xs">
            <Media
              v-if="relation.iconMedia"
              v-bind="relation.iconMedia"
              class="size-10 shrink-0 rounded-normal"
            />
            <Icon v-else name="project" class="size-10 shrink-0 text-text-3" />
            <div class="min-w-0 flex-1">
              <div class="truncate font-semibold">
                {{ relation.title || relation.projectUuid }}
              </div>
              <TheiLink
                v-if="relation.publicId"
                :to="
                  buildProjectUrl(
                    relation.humanReadableSlug ?? '',
                    relation.publicId,
                  )
                "
                external
                class="text-xs text-text-3 hocus:text-accent"
              >
                {{ relation.publicId }}
              </TheiLink>
            </div>
            <button
              type="button"
              data-relation-handle
              class="flex size-10 cursor-grab items-center justify-center
                rounded-normal bg-bg-3 text-text-2"
            >
              <Icon name="grip" />
            </button>
            <button
              type="button"
              class="flex size-10 cursor-pointer items-center justify-center
                rounded-normal bg-bg-3 text-text-2 hocus:bg-bg-error
                hocus:text-text-error"
              @click="remove(relation.projectUuid)"
            >
              <Icon name="delete" />
            </button>
          </div>
          <FieldInput
            :model-value="relation.note ?? ''"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :placeholder="phrase.project_relation_note_placeholder"
            wrapper-class="mt-xs w-full"
            @update:model-value="
              updateNote(relation.projectUuid, String($event ?? ''))
            "
          />
        </div>
        <div
          v-if="!model.length"
          class="flex min-h-16 items-center p-sm text-sm text-text-3 italic
            sm:p-md"
        >
          {{ phrase.project_relations_empty }}
        </div>
      </div>
    </Box>
  </div>
</template>

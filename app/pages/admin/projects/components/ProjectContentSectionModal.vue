<script lang="ts" setup>
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue';
import type {
  ProjectContentSectionEditItem,
  ProjectContentSectionPeriod,
} from '#layers/thei/shared/project-content-section';
import { normalizeProjectContentSectionPeriods } from '#layers/thei/shared/project-content-section';
import FieldContent from '#layers/thei/app/components/content/FieldContent.vue';
import FieldDateRangePicker from '#layers/thei/app/components/field/FieldDateRangePicker.vue';
import ModalWindow from '#layers/thei/app/modals/ModalWindow.vue';

type Result =
  { type: 'save'; section: ProjectContentSectionEditItem } | { type: 'delete' };

const emit = defineEmits<{ modalResult: [result: Result] }>();
const props = defineProps<{
  modalData: { section?: ProjectContentSectionEditItem };
}>();

const section = ref<ProjectContentSectionEditItem>({
  sectionUuid: props.modalData.section?.sectionUuid,
  title: props.modalData.section?.title ?? '',
  summary: props.modalData.section?.summary ?? '',
  isPrivate: props.modalData.section?.isPrivate ?? false,
  periods: [...(props.modalData.section?.periods ?? [])],
  content: props.modalData.section?.content ?? null,
});
const showCalendar = ref(false);
const confirmDelete = ref(false);
const error = ref<string | undefined>();
const calendarPeriod = ref<ProjectContentSectionPeriod>();
const editingPeriodIndex = ref<number>();
const calendarToggle = useTemplateRef<HTMLElement>('calendarToggle');
const calendarPopup = useTemplateRef<HTMLElement>('calendarPopup');
const calendarTeleportTarget = computed<string | HTMLElement>(
  () => calendarToggle.value?.closest('dialog') ?? 'body',
);
const { floatingStyles: calendarStyles } = useFloating(
  calendarToggle,
  calendarPopup,
  {
    placement: 'bottom-end',
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  },
);

function addPeriod(period: ProjectContentSectionPeriod) {
  const periods = [...section.value.periods];
  if (editingPeriodIndex.value !== undefined)
    periods.splice(editingPeriodIndex.value, 1);
  section.value.periods = normalizeProjectContentSectionPeriods([
    ...periods,
    period,
  ]);
  resetCalendar();
  showCalendar.value = false;
}

function removePeriod(index: number) {
  section.value.periods = section.value.periods.filter(
    (_, itemIndex) => itemIndex !== index,
  );
}

function toggleCalendar() {
  showCalendar.value = !showCalendar.value;
  if (!showCalendar.value) resetCalendar();
}

function editPeriod(index: number) {
  calendarPeriod.value = section.value.periods[index];
  editingPeriodIndex.value = index;
  showCalendar.value = true;
}

function resetCalendar() {
  calendarPeriod.value = undefined;
  editingPeriodIndex.value = undefined;
}

function save() {
  const title = section.value.title.trim();
  if (!title) {
    error.value = phrase.value.this_field_must_be_filled;
    return;
  }
  emit('modalResult', {
    type: 'save',
    section: { ...section.value, title, summary: section.value.summary.trim() },
  });
}

function formatPeriodDate(value: string) {
  const hasTime = value.includes('T');
  return new Intl.DateTimeFormat(language.value.code, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(hasTime
      ? {
          hour: '2-digit' as const,
          minute: '2-digit' as const,
          hourCycle: 'h23' as const,
        }
      : {}),
  }).format(new Date(hasTime ? value : `${value}T00:00`));
}
</script>

<template>
  <ModalWindow :title="section.title || phrase.content_section" width="48rem">
    <template #header-actions>
      <Button
        variant="delete"
        :data-title-popup="phrase.delete_content_section"
        @click="confirmDelete = !confirmDelete"
      >
        <Icon name="delete" />
      </Button>
      <Button class="font-semibold" @click="save">{{ phrase.save }}</Button>
    </template>

    <div class="flex flex-col gap-md">
      <Field>
        <div class="flex items-center justify-between gap-sm">
          <FieldLabel required>{{ phrase.content_section_title }}</FieldLabel>
          <span :data-title-popup="phrase.content_section_private_hint">
            <FieldToggle v-model="section.isPrivate">{{
              phrase.content_section_private
            }}</FieldToggle>
          </span>
        </div>
        <FieldInput
          v-model="section.title"
          :error="error"
          autocomplete="off"
          class="bg-transparent"
        />
      </Field>

      <Field>
        <FieldLabel>{{ phrase.content_section_summary }}</FieldLabel>
        <FieldInput
          v-model="section.summary"
          autocomplete="off"
          class="bg-transparent"
        />
      </Field>

      <section class="rounded-normal border border-border-1 bg-bg-1 p-sm">
        <div class="flex flex-wrap items-center justify-between gap-sm">
          <div class="font-semibold">
            <Icon name="event" class="mr-xs" />{{
              phrase.content_section_periods
            }}
          </div>
          <span ref="calendarToggle" class="inline-flex">
            <Button @click="toggleCalendar">
              <Icon name="plus" class="mr-xs" />{{
                phrase.content_section_add_period
              }}
            </Button>
          </span>
        </div>
        <Teleport :to="calendarTeleportTarget">
          <div
            v-if="showCalendar"
            ref="calendarPopup"
            class="fixed z-1000 w-[calc(100vw-var(--spacing-sm))] max-w-136
              shadow-lg"
            :style="calendarStyles"
          >
            <FieldDateRangePicker v-model="calendarPeriod" @save="addPeriod" />
          </div>
        </Teleport>
        <div v-if="section.periods.length" class="mt-sm flex flex-wrap gap-xs">
          <div
            v-for="(period, index) in section.periods"
            :key="`${period.startDate}-${period.endDate}`"
            role="button"
            tabindex="0"
            class="flex cursor-pointer items-center gap-xs rounded-full bg-bg-3
              px-sm py-1 text-sm transition hocus:bg-bg-accent"
            @click="editPeriod(index)"
            @keydown.enter="editPeriod(index)"
          >
            {{ formatPeriodDate(period.startDate) }} —
            {{ formatPeriodDate(period.endDate) }}
            <button
              type="button"
              class="cursor-pointer text-text-3 hocus:text-text-error"
              @click.stop="removePeriod(index)"
            >
              <Icon name="close" />
            </button>
          </div>
        </div>
        <FieldHint v-else class="mt-sm">{{
          phrase.content_section_no_periods
        }}</FieldHint>
      </section>

      <div class="border-t border-border-1 pt-md">
        <FieldContent
          v-model="section.content"
          :label="phrase.content_section_content"
        />
      </div>

      <div
        v-if="confirmDelete"
        class="flex flex-wrap items-center justify-between gap-sm rounded-normal
          bg-bg-error p-sm text-text-error"
      >
        <span>{{ phrase.delete_content_section }}?</span>
        <div class="flex gap-xs">
          <Button @click="confirmDelete = false"><Icon name="close" /></Button>
          <Button
            variant="delete"
            @click="$emit('modalResult', { type: 'delete' })"
          >
            {{ phrase.delete }}
          </Button>
        </div>
      </div>
    </div>
  </ModalWindow>
</template>

<script lang="ts" setup>
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { isContentEmpty } from '#layers/thei/shared/content';
import type { DiaryEditData } from '#layers/thei/shared/diary';
import type {
  DiaryGetResponse,
  DiarySaveResponse,
} from '#layers/thei/shared/api/diary';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { toDateString } from '#layers/thei/shared/date-range';
import { diaryDeleteModal } from '../composables';
import { provideContentOwner } from '#layers/thei/app/composables/content-history/owner';
import type { FormNeed } from '#layers/thei/app/composables/form-needs';
import { accessOptions } from '#layers/thei/app/components/field/access-options';

const { diaryUuid } = defineProps<{ diaryUuid?: string }>();

/**
 * The form of the simplest entity Thei keeps.
 *
 * Unlike the event form, it does not borrow the project form's plumbing: an
 * entry has no assets, no tags, no action and no public ID, so there is
 * nothing to pretend to be a project for.
 */
const diaryData = ref<DiaryEditData>(emptyData());
const relationsModel = computed({
  get: () => diaryData.value.relations ?? [],
  set: (value) => {
    diaryData.value.relations = value;
  },
});
/** The entry is called by its day, once it has one. */
const ownerTitle = computed(() =>
  diaryData.value.date
    ? entityDisplayTitle({
        title: diaryData.value.date,
        date: diaryData.value.date,
      })
    : phrase.value.new_diary_entry,
);
const reminderModel = computed({
  get: () => diaryData.value.reminder ?? '',
  set: (value: string) => {
    diaryData.value.reminder = value;
  },
});
const notesModel = computed({
  get: () => diaryData.value.notes ?? null,
  set: (value) => {
    diaryData.value.notes = value;
  },
});

const isEdit = computed(() => Boolean(diaryUuid));
const saving = ref(false);
const savedSnapshot = ref(JSON.stringify(diaryPayload()));
/**
 * When the entity last changed, as the form read it. A save names it, and
 * one over a change made elsewhere since — another tab, an AI client — is
 * refused rather than written over it.
 */
const formVersion = ref<number>();
provideEntityAi({
  ref: () => (diaryUuid ? `diary-entry:${diaryUuid}` : undefined),
  form: () => diaryData.value,
  version: () => formVersion.value,
});
const headerError = ref<string>();
const isDirty = computed(
  () => JSON.stringify(diaryPayload()) !== savedSnapshot.value,
);
// Where the entry's texts keep their drafts and versions. A new entry keeps
// them too, and its first save hands them over.
provideContentOwner('diary-entry', () => diaryUuid);
useLeaveGuard({ dirty: () => isDirty.value });
/**
 * The days that already hold an entry.
 *
 * One entry a day is a rule of the model, so the form has to answer for it
 * before the save does: choosing an occupied day offers the entry that is
 * already there instead of a refusal after the fact.
 */
const { data: takenDates, refresh: refreshTakenDates } = await useFetch<
  Array<{ date: string; diaryUuid: string }>
>('/api/admin/diary/dates', { default: () => [] });
const occupiedBy = computed(() => {
  const entry = takenDates.value.find(
    (item) => item.date === diaryData.value.date,
  );
  return entry && entry.diaryUuid !== diaryUuid ? entry : undefined;
});

/** What the entry still needs before it can be saved, in the form's order. */
const needs = useFormNeeds(
  () => {
    const list: FormNeed[] = [];
    const date = phrase.value.diary_date;
    if (!diaryData.value.date) list.push({ key: 'date', label: date });
    else if (occupiedBy.value)
      list.push({
        key: 'date',
        label: date,
        problem: phrase.value.diary_date_taken,
      });
    if (!diaryData.value.access)
      list.push({ key: 'access', label: phrase.value.diary_access });
    if (isContentEmpty(diaryData.value.content?.data))
      list.push({ key: 'content', label: phrase.value.diary_content });
    return list;
  },
  {
    ready: () => !saving.value && (!isEdit.value || isDirty.value),
    save,
    error: headerError,
  },
);

if (isEdit.value) {
  const data = await useRequestFetch()<DiaryGetResponse>(
    `/api/admin/diary/${diaryUuid}`,
  );
  diaryData.value = {
    date: data.date,
    access: data.access,
    content: data.content,
    relations: data.relations ?? [],
    reminder: data.reminder,
    notes: data.notes ?? null,
  };
  markSaved();
  formVersion.value = data.version;
}

/** The save itself; a press or Ctrl+S comes to it through `needs.submit`. */
async function save() {
  saving.value = true;
  headerError.value = undefined;
  try {
    const result = await $fetch<DiarySaveResponse>(
      isEdit.value ? `/api/admin/diary/${diaryUuid}` : '/api/admin/diary',
      {
        method: isEdit.value ? 'PUT' : 'POST',
        body: { ...diaryPayload(), version: formVersion.value },
      },
    );
    if (result.type === 'error') {
      headerError.value = result.message;
      if (result.code === 'date-taken') await refreshTakenDates();
      return;
    }
    formVersion.value = result.version;
    stampSavedContent(diaryData.value, savedSnapshot.value, CONTENT_FIELDS);
    markSaved();
    // A new entry leaves for its own edit page, which loads the days afresh.
    // Refreshing them here would count the entry just made as another one
    // holding its day, and flash the warning until the page is gone.
    await Promise.all([
      refreshNuxtData('admin-bar'),
      isEdit.value && refreshTakenDates(),
    ]);
    if (!isEdit.value)
      await navigateTo(sitePath(`/admin/diary/${result.diaryUuid}/edit/`), {
        external: true,
      });
  } finally {
    saving.value = false;
  }
}

await useAdminTabTitle(
  computed(() =>
    isEdit.value ? phrase.value.edit_diary_entry : phrase.value.new_diary_entry,
  ),
);

async function deleteEntry() {
  if (!diaryUuid) return;
  const result = await openModal(diaryDeleteModal, {
    diaryUuid,
    date: diaryData.value.date,
  });
  if (result.type !== 'deleted') return;
  markSaved();
  await refreshNuxtData('admin-bar');
  await navigateTo('/admin/diary/');
}

const CONTENT_FIELDS = ['content', 'notes'];

/** Saving from inside the editor saves the entry too; see the event form. */
function saveAfterContentEdit() {
  if (saving.value || needs.blocked.value || !isEdit.value || !isDirty.value)
    return;
  if (!changedOnlyIn(diaryPayload(), savedSnapshot.value, CONTENT_FIELDS))
    return;
  void save();
}

function emptyData(): DiaryEditData {
  return {
    // A new entry is about today until told otherwise, which is what makes
    // one quick enough to write on the way past — the writer's today, not
    // UTC's, or a late evening east of Greenwich would date it yesterday.
    date: dateFromQuery() ?? toDateString(new Date()),
    access: ProjectEventAccessLevel.Public,
    content: null,
    relations: [],
    reminder: '',
    notes: null,
  };
}

function diaryPayload(): DiaryEditData {
  const value = diaryData.value;
  return {
    date: value.date,
    access: value.access,
    content: value.content,
    relations: value.relations,
    reminder: value.reminder,
    notes: value.notes,
  };
}

function markSaved() {
  savedSnapshot.value = JSON.stringify(diaryPayload());
}

// The public page is addressed by the day, which only the form knows, so the
// admin bar's "view" button is registered from here rather than guessed there.
// It is the saved day: a day being typed is not this entry's page, and may be
// another entry's.
useRegisterAdminBarContextButton(
  computed(() => {
    if (!isEdit.value) return undefined;
    const { date } = JSON.parse(savedSnapshot.value) as DiaryEditData;
    return date
      ? {
          to: { href: buildDiaryUrl(date), external: true },
          icon: 'visibility' as const,
          title: phrase.value.diary_entry,
        }
      : undefined;
  }),
);
</script>

<template>
  <AdminSaveHeader
    :title="isEdit ? phrase.edit_diary_entry : phrase.new_diary_entry"
    icon="thought"
    :dirty="isDirty"
    :saving
    :creating="!isEdit"
    :deletable="isEdit"
    :needs
    @delete="deleteEntry"
    ><AiEntityButton
  /></AdminSaveHeader>

  <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <AiFormOffers />
    <Box class="flex flex-col gap-md p-sm sm:p-md">
      <div class="flex flex-wrap gap-md">
        <Field need="date" class="min-w-50 flex-1">
          <FieldLabel required>{{ phrase.diary_date }}</FieldLabel>
          <FieldDatePicker
            v-model="diaryData.date"
            :label="phrase.diary_date"
            placement="bottom-start"
            required
          />
          <TheiLink
            v-if="occupiedBy"
            :to="`/admin/diary/${occupiedBy.diaryUuid}/edit/`"
            class="mt-xs flex w-fit items-center gap-xs rounded-normal
              bg-bg-warning px-sm py-xs text-sm text-text-warning transition
              hocus:underline"
          >
            <Icon name="warning" class="shrink-0" />
            <span>{{ phrase.diary_date_taken_open }}</span>
          </TheiLink>
        </Field>
        <Field ai="access" need="access" class="min-w-50">
          <FieldLabel required>{{ phrase.diary_access }}</FieldLabel>
          <FieldOptions
            v-model="diaryData.access"
            direction="row"
            :options="accessOptions(phrase, false)"
          />
        </Field>
      </div>
      <Field need="content">
        <FieldLabel required>{{ phrase.diary_content }}</FieldLabel>
        <FieldContentEditor
          v-model="diaryData.content"
          content-slot="diary-body"
          :title-label="phrase.diary_content"
          @saved="saveAfterContentEdit()"
        />
        <FieldHint>{{ phrase.diary_content_hint }}</FieldHint>
      </Field>
    </Box>

    <AdminRelations
      v-model="relationsModel"
      :owner="diaryUuid ? { type: 'diary-entry', id: diaryUuid } : undefined"
      owner-type="diary-entry"
      :owner-title="ownerTitle"
      :text="diaryData.content?.data"
    />
    <AdminShareLinks
      v-if="diaryUuid"
      entity-type="diary-entry"
      :entity-uuid="diaryUuid"
    />
    <AiMemoryBlock />
    <AdminNotesBlock
      v-model:reminder="reminderModel"
      v-model:notes="notesModel"
      @notes-saved="saveAfterContentEdit()"
    />
  </div>
</template>

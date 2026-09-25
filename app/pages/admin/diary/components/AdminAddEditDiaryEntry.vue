<script lang="ts" setup>
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { isContentEmpty } from '#layers/thei/shared/content';
import type { DiaryEditData } from '#layers/thei/shared/diary';
import type {
  DiaryGetResponse,
  DiarySaveResponse,
} from '#layers/thei/shared/api/diary';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import ProjectShareLinks from '../../projects/components/ProjectShareLinks.vue';
import { diaryDeleteModal } from '../composables';

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
const headerError = ref<string>();
const isDirty = computed(
  () => JSON.stringify(diaryPayload()) !== savedSnapshot.value,
);
const isValid = computed(() =>
  Boolean(
    diaryData.value.date &&
    diaryData.value.access &&
    !isContentEmpty(diaryData.value.content?.data),
  ),
);

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
}

async function save() {
  if (saving.value || !isValid.value || occupiedBy.value) return;
  saving.value = true;
  headerError.value = undefined;
  try {
    const result = await $fetch<DiarySaveResponse>(
      isEdit.value ? `/api/admin/diary/${diaryUuid}` : '/api/admin/diary',
      { method: isEdit.value ? 'PUT' : 'POST', body: diaryPayload() },
    );
    if (result.type === 'error') {
      headerError.value = result.message;
      if (result.code === 'date-taken') await refreshTakenDates();
      return;
    }
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
      await navigateTo(`/admin/diary/${result.diaryUuid}/edit/`, {
        external: true,
      });
  } finally {
    saving.value = false;
  }
}

useSaveShortcut(save, {
  canSave: () =>
    !saving.value &&
    isValid.value &&
    !occupiedBy.value &&
    (!isEdit.value || isDirty.value),
});
await useAdminTabTitle(
  computed(() =>
    isEdit.value ? phrase.value.edit_diary_entry : phrase.value.new_diary_entry,
  ),
);
onBeforeRouteLeave(() => {
  if (interceptModalNavigation()) return false;
  if (isDirty.value)
    return window.confirm(phrase.value.unsaved_changes_confirm);
});

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
  if (saving.value || !isValid.value || !isEdit.value || !isDirty.value) return;
  if (!changedOnlyIn(diaryPayload(), savedSnapshot.value, CONTENT_FIELDS))
    return;
  void save();
}

function emptyData(): DiaryEditData {
  return {
    // A new entry is about today until told otherwise, which is what makes
    // one quick enough to write on the way past.
    date: new Date().toISOString().slice(0, 10),
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
  <StickyGlassHeader width="var(--width-wide)" :error="headerError">
    <div class="flex items-center justify-between gap-xs py-xs">
      <div class="flex min-w-0 items-center gap-xs text-xl font-bold">
        <Icon name="thought" />
        <span class="truncate">{{
          isEdit ? phrase.edit_diary_entry : phrase.new_diary_entry
        }}</span>
      </div>
      <div class="flex items-center gap-xs">
        <Button
          v-if="isEdit"
          variant="delete"
          :data-title-popup="phrase.delete"
          @click="deleteEntry"
        >
          <Icon name="delete" />
        </Button>
        <Button
          class="font-semibold"
          :disabled="saving || !isValid || !!occupiedBy || (isEdit && !isDirty)"
          @click="save"
        >
          <Icon v-if="saving" name="loading" class="mr-xs" />
          {{ isEdit ? (isDirty ? phrase.save : phrase.saved) : phrase.create }}
        </Button>
      </div>
    </div>
  </StickyGlassHeader>

  <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <Box class="flex flex-col gap-md p-sm sm:p-md">
      <div class="flex flex-wrap gap-md">
        <Field class="min-w-50 flex-1">
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
        <Field class="min-w-50">
          <FieldLabel required>{{ phrase.diary_access }}</FieldLabel>
          <FieldOptions
            v-model="diaryData.access"
            direction="row"
            :options="{
              [ProjectEventAccessLevel.Public]: {
                icon: 'lock-open',
                title: phrase.public,
              },
              [ProjectEventAccessLevel.Private]: {
                icon: 'lock-close',
                title: phrase.private,
              },
            }"
          />
        </Field>
      </div>
      <Field>
        <FieldLabel required>{{ phrase.diary_content }}</FieldLabel>
        <FieldContentEditor
          v-model="diaryData.content"
          :title-label="phrase.diary_content"
          @saved="saveAfterContentEdit()"
        />
        <FieldHint>{{ phrase.diary_content_hint }}</FieldHint>
      </Field>
    </Box>

    <AdminRelations
      v-model="relationsModel"
      :owner="diaryUuid ? { type: 'diary-entry', id: diaryUuid } : undefined"
      :owner-title="ownerTitle"
    />
    <ProjectShareLinks
      v-if="diaryUuid"
      entity-type="diary-entry"
      :entity-uuid="diaryUuid"
    />
    <AdminNotesBlock
      v-model:reminder="reminderModel"
      v-model:notes="notesModel"
      @notes-saved="saveAfterContentEdit()"
    />
  </div>
</template>

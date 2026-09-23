<script setup lang="ts">
import {
  type AdminProfileResponse,
  type ProfileEditData,
  type ProfilePageLink,
} from '#layers/thei/shared/profile';
import {
  addStatusUsageDelta,
  type StatusHistoryItem,
} from '#layers/thei/shared/status';
import StatusHistoryField from '#layers/thei/app/components/settings/StatusHistoryField.vue';
import { canonicalizeContentData } from '#layers/thei/shared/content';
import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';
import type { MediaDescriptor } from '#layers/thei/shared/media';
definePageMeta({ layout: 'admin' });
await useAdminTabTitle(computed(() => phrase.value.about_me));
const initial =
  await useRequestFetch()<AdminProfileResponse>('/api/admin/about');
function serialize(value: ProfileEditData) {
  return JSON.stringify({
    ...value,
    avatarChangeId: '',
    aboutContent: canonicalizeContentData(value.aboutContent?.data),
    externalLinks: value.externalLinks.map((l) => ({
      url: l.url,
      name: l.name,
      isPrivate: l.isPrivate,
    })),
  });
}
const {
  value: data,
  isDirty,
  markSaved,
} = useSerializableState(initial.data, { serialize });
const saved = ref(structuredClone(initial.data));
const avatarMedia = ref(
  initial.currentAvatar ? initial.avatarMedia : undefined,
);
const bannerMedia = ref(initial.bannerMedia);
const faviconMedia = ref(initial.faviconMedia);
const currentAvatar = ref(initial.currentAvatar);
const avatars = useProfileHistory('/api/admin/about/avatars', initial.avatars);
const statusField =
  useTemplateRef<InstanceType<typeof StatusHistoryField>>('statusField');
const savedStatuses = computed<StatusHistoryItem[]>(
  () => statusField.value?.items ?? [],
);
const pageDetails = ref<ProfilePageLink[]>(initial.pinnedPages);
const saving = ref(false);
const error = ref<string>();
const canSave = computed(
  () =>
    isDirty.value &&
    !saving.value &&
    Boolean(data.value.displayName.trim()) &&
    data.value.facts.every((f) => f.name.trim() && f.value.trim()),
);
const oldAvatars = computed(() =>
  avatars.items.value.filter(
    (a) =>
      a.id !== currentAvatar.value?.id &&
      !data.value.deletedAvatarIds.includes(a.id),
  ),
);
const pages = computed(() =>
  data.value.pinnedPageUuids
    .map((id) => pageDetails.value.find((p) => p.pageUuid === id))
    .filter((p): p is ProfilePageLink => Boolean(p)),
);
watch(
  () => data.value.avatarAssetUuid,
  (uuid) => {
    data.value.avatarChangeId =
      uuid === saved.value.avatarAssetUuid ? '' : crypto.randomUUID();
  },
);
const usageDelta = computed(() => {
  const delta: Record<string, number> = {};
  const add = (id: string | null | undefined, amount: number) => {
    if (id) delta[id] = (delta[id] ?? 0) + amount;
  };
  for (const key of ['bannerAssetUuid', 'faviconAssetUuid'] as const) {
    add(saved.value[key], -1);
    add(data.value[key], 1);
  }
  if (data.value.avatarAssetUuid !== saved.value.avatarAssetUuid)
    add(data.value.avatarAssetUuid, 1);
  for (const id of data.value.deletedAvatarIds)
    add(avatars.items.value.find((a) => a.id === id)?.assetUuid, -1);
  return addStatusUsageDelta(delta, data.value, savedStatuses.value);
});
async function save() {
  if (!canSave.value) return;
  saving.value = true;
  error.value = undefined;
  try {
    const result = await $fetch<AdminProfileResponse>('/api/admin/about', {
      method: 'PUT',
      body: data.value,
    });
    saved.value = structuredClone(result.data);
    data.value = result.data;
    markSaved();
    avatarMedia.value = result.currentAvatar ? result.avatarMedia : undefined;
    bannerMedia.value = result.bannerMedia;
    faviconMedia.value = result.faviconMedia;
    currentAvatar.value = result.currentAvatar;
    avatars.reset(result.avatars);
    statusField.value?.reset(result.statuses);
    pageDetails.value = result.pinnedPages;
    await refreshNuxtData([
      'admin-profile',
      'public-profile',
      'public-latest-life',
    ]);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}
useSavedForm(isDirty, save, canSave);
const factAnchor = useTemplateRef<HTMLElement>('factAnchor');
const factOpen = ref(false);
const factName = ref('');
const factValue = ref('');
function addFact() {
  data.value.facts.push({
    id: crypto.randomUUID(),
    name: factName.value.trim(),
    value: factValue.value.trim(),
  });
  factOpen.value = false;
}
const pageAnchor = useTemplateRef<HTMLElement>('pageAnchor');
const pageOpen = ref(false);
function addPage(item: ContentEntitySearchItem) {
  if (!data.value.pinnedPageUuids.includes(item.entityId)) {
    data.value.pinnedPageUuids.push(item.entityId);
    if (!pageDetails.value.some((page) => page.pageUuid === item.entityId))
      pageDetails.value.push({
        pageUuid: item.entityId,
        title: item.title,
        href: item.url,
        media: item.previewMedia,
      });
  }
  pageOpen.value = false;
}
const birthDateMax = new Date();
</script>
<template>
  <div>
    <AdminSaveHeader
      :title="phrase.about_me"
      icon="person"
      :dirty="isDirty"
      :saving="saving"
      :can-save="canSave"
      :error="error"
      @save="save"
    />
    <fieldset
      :disabled="saving"
      class="m-auto flex w-(--width-wide) min-w-0 flex-col gap-lg px-window
        py-lg"
    >
      <Box class="flex flex-col gap-md p-sm sm:p-md">
        <div class="grid gap-md sm:grid-cols-2">
          <Field
            ><FieldLabel required>{{ phrase.profile_name }}</FieldLabel
            ><FieldInput v-model="data.displayName" /></Field
          ><Field
            ><FieldLabel>{{ phrase.profile_slogan }}</FieldLabel
            ><FieldInput v-model="data.slogan"
          /></Field>
        </div>
        <Field
          ><FieldLabel>{{ phrase.profile_detailed_description }}</FieldLabel
          ><FieldContentEditor
            v-model="data.aboutContent"
            :title-label="phrase.profile_detailed_description"
        /></Field>
        <div class="flex min-w-0 flex-wrap gap-md">
          <ProfileMediaField
            v-model="data.avatarAssetUuid"
            v-model:media="avatarMedia"
            :title="phrase.profile_avatar"
            :description="phrase.profile_avatar_hint"
            profile="profile-avatar"
            :usage-delta="usageDelta"
            shape="circle"
            details-aside
            class="max-w-full grow basis-24"
          />
          <ProfileMediaField
            v-model="data.bannerAssetUuid"
            v-model:media="bannerMedia"
            :title="phrase.profile_banner"
            :description="phrase.profile_banner_hint"
            profile="profile-banner"
            wide
            :usage-delta="usageDelta"
            details-aside
            class="max-w-full grow basis-72"
          />
        </div>
        <section v-if="oldAvatars.length || avatars.cursor.value">
          <h3 class="mb-sm font-semibold">
            {{ phrase.profile_avatar_history }}
          </h3>
          <ProfileAvatarHistory
            :items="oldAvatars"
            removable
            short-date
            :more="Boolean(avatars.cursor.value)"
            :loading="avatars.loading.value"
            :error="avatars.error.value"
            @remove="data.deletedAvatarIds.push($event)"
            @load="avatars.load"
          />
        </section>
        <div
          class="flex min-w-0 flex-wrap items-center gap-md border-t
            border-border-1 pt-md"
        >
          <ProfileMediaField
            v-model="data.faviconAssetUuid"
            v-model:media="faviconMedia"
            :title="phrase.profile_favicon"
            :description="phrase.profile_favicon_hint"
            profile="profile-favicon"
            image-only
            details-aside
            :usage-delta="usageDelta"
            class="max-w-full grow basis-72 sm:grow-0"
          />
          <ProfileFaviconPreview
            :media="faviconMedia"
            :site-name="data.displayName"
          />
        </div>
      </Box>
      <StatusHistoryField
        ref="statusField"
        v-model:new-statuses="data.newStatuses"
        v-model:updated-statuses="data.updatedStatuses"
        v-model:deleted-status-ids="data.deletedStatusIds"
        history-url="/api/admin/about/statuses"
        :initial="initial.statuses"
        :usage-delta="usageDelta"
        :title="phrase.profile_statuses"
        :description="phrase.profile_status_hint"
        :add-label="phrase.profile_new_status"
        :empty-label="phrase.profile_empty"
      />
      <section>
        <SectionHeader
          icon="list-unordered"
          :title="phrase.profile_facts"
          :description="phrase.profile_facts_hint"
          class="mb-md"
        /><Box>
          <div class="grid gap-md p-sm sm:grid-cols-2 sm:p-md">
            <Field
              ><FieldLabel>{{ phrase.profile_nickname }}</FieldLabel
              ><FieldInput v-model="data.nickname" /></Field
            ><Field
              ><FieldLabel>{{ phrase.profile_birth_date }}</FieldLabel>
              <FieldDatePicker
                v-model="data.birthDate"
                :label="phrase.profile_birth_date"
                :max-date="birthDateMax"
              />
            </Field>
          </div>
          <div
            class="flex items-center justify-between border-y border-border-1
              p-sm sm:px-md"
          >
            <h3 class="font-semibold">{{ phrase.profile_custom_facts }}</h3>
            <button
              ref="factAnchor"
              type="button"
              class="size-9 cursor-pointer rounded-normal bg-bg-3 text-text-2
                hocus:text-accent"
              :aria-label="phrase.profile_add"
              @click="
                factName = '';
                factValue = '';
                factOpen = true;
              "
            >
              <Icon name="plus" />
            </button>
          </div>
          <SortableList
            :items="data.facts"
            :item-key="(item) => item.id"
            @reorder="data.facts = $event"
            @remove="data.facts = data.facts.filter((f) => f.id !== $event.id)"
            ><template #default="{ item }"
              ><div class="flex flex-col gap-xs sm:flex-row sm:items-start">
                <FieldInput
                  v-model="item.name"
                  :aria-label="phrase.profile_field"
                  wrapper-class="min-w-0 sm:w-1/3"
                />
                <div class="min-w-0 flex-1">
                  <FieldTextarea
                    v-model="item.value"
                    :aria-label="phrase.profile_value"
                    class="w-full"
                  />
                </div></div></template
          ></SortableList>
        </Box>
      </section>
      <section>
        <div class="mb-md flex items-center justify-between gap-md">
          <SectionHeader
            icon="page"
            :title="phrase.profile_pinned_pages"
            :description="phrase.profile_pinned_pages_hint"
          /><button
            ref="pageAnchor"
            type="button"
            class="size-12 shrink-0 cursor-pointer rounded-normal bg-bg-3
              text-text-2 transition-colors hocus:bg-bg-accent
              hocus:text-accent"
            :aria-label="phrase.profile_add"
            @click="pageOpen = true"
          >
            <Icon name="plus" />
          </button>
        </div>
        <Box
          ><SortableList
            :items="pages"
            :item-key="(item) => item.pageUuid"
            flush
            @reorder="data.pinnedPageUuids = $event.map((p) => p.pageUuid)"
            @remove="
              data.pinnedPageUuids = data.pinnedPageUuids.filter(
                (id) => id !== $event.pageUuid,
              )
            "
            ><template #default="{ item }"
              ><ProfilePinnedPageItem :page="item" /></template></SortableList
        ></Box>
      </section>
      <ExternalLinksEditor
        v-model="data.externalLinks"
        :title="phrase.profile_links"
        :description="phrase.profile_links_hint"
        :empty-text="phrase.profile_empty"
      />
    </fieldset>
    <FloatingPopup
      v-model:open="factOpen"
      :anchor="factAnchor"
      placement="bottom-end"
      max-width="24rem"
      ><form
        class="flex flex-col gap-sm rounded-normal border border-border-1
          bg-bg-2 p-md"
        @submit.prevent="addFact"
      >
        <Field
          ><FieldLabel>{{ phrase.profile_field }}</FieldLabel
          ><FieldInput v-model="factName" /></Field
        ><Field
          ><FieldLabel>{{ phrase.profile_value }}</FieldLabel
          ><FieldTextarea v-model="factValue" /></Field
        ><Button
          :disabled="!factName.trim() || !factValue.trim()"
          type="submit"
          >{{ phrase.profile_add }}</Button
        >
      </form></FloatingPopup
    >
    <FloatingPopup
      v-model:open="pageOpen"
      :anchor="pageAnchor"
      placement="bottom-end"
      max-width="28rem"
      ><ContentEntitySearchPopup
        :entity-types="['page']"
        public-only
        :exclude="data.pinnedPageUuids.map((id) => `page:${id}`)"
        @select="addPage"
    /></FloatingPopup>
  </div>
</template>

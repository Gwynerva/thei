<script setup lang="ts">
import {
  type AdminProfileResponse,
  type ProfileEditData,
  type ProfilePageLink,
  type ProfileStatusHistoryItem,
} from '#layers/thei/shared/profile';
import { canonicalizeContentData } from '#layers/thei/shared/content';
import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { profileStatusModal } from '#layers/thei/app/modals/profile-status/modal';
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
const statuses = useProfileHistory(
  '/api/admin/about/statuses',
  initial.statuses,
);
const pendingStatusPreviews = reactive(
  new Map<string, { createdAt: number; media?: MediaDescriptor }>(),
);
// Media previews of saved statuses edited since the last save.
const editedStatusMedia = reactive(
  new Map<string, MediaDescriptor | undefined>(),
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
const visibleStatuses = computed<ProfileStatusHistoryItem[]>(() =>
  data.value.newStatuses
    .map((status): ProfileStatusHistoryItem => {
      const preview = pendingStatusPreviews.get(status.id);
      return {
        id: status.id,
        createdAt: preview?.createdAt ?? 0,
        kind: status.kind,
        text: status.kind === 'regular' ? status.text : '',
        ...(status.kind === 'regular' && status.assetUuid
          ? { assetUuid: status.assetUuid }
          : {}),
        ...(preview?.media ? { media: preview.media } : {}),
      };
    })
    .reverse()
    .concat(
      statuses.items.value.map((status) => {
        const update = data.value.updatedStatuses.find(
          (s) => s.id === status.id,
        );
        if (!update) return status;
        const { assetUuid: _assetUuid, media: _media, ...rest } = status;
        const media = editedStatusMedia.get(status.id);
        return {
          ...rest,
          text: update.text,
          ...(update.assetUuid ? { assetUuid: update.assetUuid } : {}),
          ...(media ? { media } : {}),
        };
      }),
    )
    .filter((status) => !data.value.deletedStatusIds.includes(status.id)),
);
const canAddEmptyStatus = computed(
  () => visibleStatuses.value[0]?.kind === 'regular',
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
  for (const status of data.value.newStatuses)
    if (status.kind === 'regular') add(status.assetUuid, 1);
  for (const id of data.value.deletedAvatarIds)
    add(avatars.items.value.find((a) => a.id === id)?.assetUuid, -1);
  for (const id of data.value.deletedStatusIds)
    add(statuses.items.value.find((s) => s.id === id)?.assetUuid, -1);
  for (const status of data.value.updatedStatuses) {
    add(statuses.items.value.find((s) => s.id === status.id)?.assetUuid, -1);
    add(status.assetUuid, 1);
  }
  return delta;
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
    statuses.reset(result.statuses);
    pendingStatusPreviews.clear();
    editedStatusMedia.clear();
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
async function addStatus() {
  const result = await openModal(profileStatusModal, {
    usageDelta: usageDelta.value,
    canAddEmptyStatus: canAddEmptyStatus.value,
  });
  if (result.type !== 'save') return;
  if (result.kind === 'regular')
    data.value.newStatuses.push({
      id: result.id,
      kind: 'regular',
      text: result.text,
      assetUuid: result.assetUuid,
    });
  else data.value.newStatuses.push({ id: result.id, kind: 'empty' });
  pendingStatusPreviews.set(result.id, {
    createdAt: Date.now(),
    media: result.kind === 'regular' ? result.media : undefined,
  });
}
async function editStatus(item: ProfileStatusHistoryItem) {
  if (item.kind !== 'regular') return;
  const result = await openModal(profileStatusModal, {
    usageDelta: usageDelta.value,
    canAddEmptyStatus: false,
    initial: {
      id: item.id,
      text: item.text,
      assetUuid: item.assetUuid,
      media: item.media,
    },
  });
  if (result.type !== 'save' || result.kind !== 'regular') return;
  const pending = data.value.newStatuses.find((s) => s.id === item.id);
  if (pending) {
    Object.assign(pending, { text: result.text, assetUuid: result.assetUuid });
    const preview = pendingStatusPreviews.get(item.id);
    if (preview) preview.media = result.media;
    return;
  }
  const saved = statuses.items.value.find((s) => s.id === item.id);
  const updates = data.value.updatedStatuses.filter((s) => s.id !== item.id);
  // Editing a status back to what is stored leaves nothing to save.
  if (
    saved?.text !== result.text ||
    (saved?.assetUuid ?? undefined) !== result.assetUuid
  )
    updates.push({
      id: item.id,
      text: result.text,
      ...(result.assetUuid ? { assetUuid: result.assetUuid } : {}),
    });
  data.value.updatedStatuses = updates;
  editedStatusMedia.set(item.id, result.media);
}
function removeStatus(id: string) {
  if (data.value.newStatuses.some((s) => s.id === id)) {
    data.value.newStatuses = data.value.newStatuses.filter((s) => s.id !== id);
    pendingStatusPreviews.delete(id);
  } else {
    data.value.updatedStatuses = data.value.updatedStatuses.filter(
      (s) => s.id !== id,
    );
    data.value.deletedStatusIds.push(id);
  }
}
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
// Shown in the search-result preview: the address people would actually see.
const siteHost = computed(() => {
  try {
    return new URL(useSiteUrl().resolve('/')).host;
  } catch {
    return '';
  }
});
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
      </Box>
      <!-- The site icon is its own block: it is not part of how the profile
           looks on the page, but of how the site looks everywhere else. -->
      <section>
        <SectionHeader
          icon="star"
          :title="phrase.profile_favicon_section"
          :description="phrase.profile_favicon_section_hint"
          class="mb-md"
        />
        <Box class="flex min-w-0 flex-wrap items-start gap-md p-sm sm:p-md">
          <ProfileMediaField
            v-model="data.faviconAssetUuid"
            v-model:media="faviconMedia"
            :title="phrase.profile_favicon"
            :description="phrase.profile_favicon_hint"
            profile="profile-favicon"
            image-only
            :usage-delta="usageDelta"
            class="shrink-0"
          />
          <ProfileFaviconPreview
            :media="faviconMedia"
            :site-name="data.displayName"
            :site-host="siteHost"
          />
        </Box>
      </section>
      <section>
        <div class="mb-md flex items-center justify-between gap-md">
          <SectionHeader
            icon="quote"
            :title="phrase.profile_status"
            :description="phrase.profile_status_hint"
          />
          <button
            type="button"
            class="size-12 shrink-0 cursor-pointer rounded-normal bg-bg-3
              text-text-2 transition-colors hocus:bg-bg-accent
              hocus:text-accent"
            :aria-label="phrase.profile_new_status"
            :data-title-popup="phrase.profile_new_status"
            @click="addStatus"
          >
            <Icon name="plus" />
          </button>
        </div>
        <Box class="max-h-120 overflow-y-auto px-sm sm:px-md"
          ><div class="divide-y divide-border-1">
            <ProfileStatusItem
              v-for="status in visibleStatuses"
              :key="status.id"
              :item="status"
              removable
              editable
              short-date
              @remove="removeStatus"
              @edit="editStatus"
            />
          </div>
          <p
            v-if="!visibleStatuses.length"
            class="py-md text-sm text-text-3 italic"
          >
            {{ phrase.profile_empty }}
          </p>
          <ProfileLoadMore
            :more="Boolean(statuses.cursor.value)"
            :loading="statuses.loading.value"
            :error="statuses.error.value"
            @load="statuses.load"
        /></Box>
      </section>
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

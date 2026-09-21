<script setup lang="ts">
import {
  profileAge,
  type PublicProfileResponse,
} from '#layers/thei/shared/profile';
import { buildTagUrl } from '#layers/thei/shared/tag-url';
import PublicProfileHero from './PublicProfileHero.vue';
import PublicProfileStatus from './PublicProfileStatus.vue';
const props = defineProps<{ profile: PublicProfileResponse }>();
const allAbout = ref(false);
const allFacts = ref(false);
const now = useLiveNow();
const about = computed(() =>
  props.profile.aboutContent
    ? {
        ...props.profile.aboutContent,
        blocks: allAbout.value
          ? props.profile.aboutContent.blocks
          : props.profile.aboutContent.blocks.slice(0, 2),
      }
    : undefined,
);
const facts = computed(() => {
  const rows: { id: string; name: string; value: string }[] = [];
  const age = profileAge(props.profile.birthDate, new Date(now.value));
  if (props.profile.nickname)
    rows.push({
      id: 'nickname',
      name: phrase.value.profile_nickname,
      value: props.profile.nickname,
    });
  if (age !== undefined)
    rows.push({
      id: 'birth',
      name: phrase.value.profile_birth_date,
      value: `${formatAbsolutePublicDate(props.profile.birthDate, language.value.code)} · ${phrase.value.profile_age(age)}`,
    });
  return rows.concat(props.profile.facts);
});
</script>
<template>
  <div class="flex flex-col gap-md">
    <PublicProfileHero :profile="profile" />
    <div
      class="columns-1 gap-md sm:columns-2 [&>*]:mb-md
        [&>*]:break-inside-avoid-column [&>*:last-child]:mb-0"
    >
      <ProfileInfoBlock v-if="about?.blocks.length" :title="phrase.about_me"
        ><ContentRenderer :data="about" asset-viewer /><ProfileShowAllButton
          v-if="profile.aboutContent!.blocks.length > 2"
          class="mt-md"
          :expanded="allAbout"
          @click="allAbout = !allAbout"
      /></ProfileInfoBlock>
      <ProfileInfoBlock
        v-if="profile.pinnedPages.length"
        :title="phrase.profile_pinned_pages"
        ><div class="flex flex-col gap-xs">
          <ProfilePinnedPageItem
            v-for="page in profile.pinnedPages"
            :key="page.pageUuid"
            :page="page"
            linked
          /></div
      ></ProfileInfoBlock>
      <ProfileInfoBlock
        v-if="profile.externalLinks.length"
        :title="phrase.profile_links"
        ><div class="flex flex-wrap gap-xs">
          <ExternalLinkChip
            v-for="link in profile.externalLinks"
            :key="link.url"
            :link="link"
            size="compact"
          /></div
      ></ProfileInfoBlock>
      <PublicProfileStatus
        v-if="profile.currentStatus"
        :current="profile.currentStatus"
        :count="profile.statusCount"
      />
      <ProfileInfoBlock v-if="facts.length" :title="phrase.profile_facts"
        ><dl class="divide-y divide-border-1">
          <div
            v-for="fact in allFacts ? facts : facts.slice(0, 6)"
            :key="fact.id"
            class="flex items-start justify-between gap-md py-sm first:pt-0
              last:pb-0"
          >
            <dt class="min-w-0 text-sm text-text-2">{{ fact.name }}</dt>
            <dd
              class="min-w-0 flex-1 text-right text-sm font-semibold
                wrap-anywhere whitespace-pre-wrap"
            >
              {{ fact.value }}
            </dd>
          </div>
        </dl>
        <ProfileShowAllButton
          v-if="facts.length > 6"
          class="mt-md"
          :expanded="allFacts"
          @click="allFacts = !allFacts"
      /></ProfileInfoBlock>
      <ProfileInfoBlock
        v-if="profile.tags.length"
        :title="phrase.profile_popular_tags"
        ><div class="flex flex-wrap gap-xs">
          <TheiLink
            v-for="tag in profile.tags"
            :key="tag.publicId"
            :to="buildTagUrl(tag.slug, tag.publicId)"
            class="inline-flex rounded-sm transition focus-visible:ring-2
              focus-visible:ring-accent focus-visible:outline-none
              hocus:brightness-110"
            ><TagChip :tag="{ ...tag, tagUuid: tag.publicId }"
              ><span class="flex items-center gap-2 text-text-2"
                ><span
                  v-if="tag.projectCount"
                  class="inline-flex items-center gap-1"
                  ><Icon name="project" />{{ tag.projectCount }}</span
                ><span
                  v-if="tag.eventCount"
                  class="inline-flex items-center gap-1"
                  ><Icon name="event" />{{ tag.eventCount }}</span
                ></span
              ></TagChip
            ></TheiLink
          >
        </div></ProfileInfoBlock
      >
    </div>
  </div>
</template>

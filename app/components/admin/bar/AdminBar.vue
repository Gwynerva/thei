<script lang="ts" setup>
import type { AdminBarButtonProps } from './AdminBarButton.vue';
import {
  publicIdFromProjectChildUrlPart,
  publicIdFromProjectUrlPart,
} from '#layers/thei/shared/project-url';
import { publicIdFromTagUrlPart } from '#layers/thei/shared/tag-url';
import { publicIdFromEventUrlPart } from '#layers/thei/shared/event-url';
import { dateFromDiaryUrlPart } from '#layers/thei/shared/diary-url';
import { parsePublicSearchFilters } from '#layers/thei/shared/public-search';

const isAdmin = useIsAdmin();
const adminBarData = isAdmin.value
  ? (await useFetch('/api/admin/dashboard-summary', { key: 'admin-bar' })).data
  : shallowRef();

const publicAdmin = await usePublicAdmin();

const route = useRoute();
const registeredContextButton = useAdminBarContextButton();

async function signOut() {
  await $fetch('/api/admin/session', { method: 'DELETE' });
  await navigateTo(sitePath('/sign-in/'), { external: true });
}

const contextAdminButton = computed<AdminBarButtonProps | undefined>(() => {
  if (registeredContextButton.value?.routePath === route.path)
    return registeredContextButton.value.props;

  // A stage or a section has no editor of its own: the button opens the
  // project's editor with that part's modal already open.
  const child = /^\/projects\/([^/]+)\/(stages|sections)\/([^/]+)\/$/.exec(
    route.path,
  );
  if (child) {
    const projectId = publicIdFromProjectUrlPart(child[1]!);
    const childId = publicIdFromProjectChildUrlPart(child[3]!);
    const isStage = child[2] === 'stages';
    return {
      to: `/admin/projects/${projectId}/edit/?${isStage ? 'stage' : 'section'}=${encodeURIComponent(childId)}`,
      icon: 'edit',
      title: isStage
        ? phrase.value.edit_project_stage
        : phrase.value.edit_content_section,
    };
  }

  // A project page and anything under it; `/projects/` itself is only a short
  // address of a search and names no project to edit.
  const project = /^\/projects\/([^/]+)\//.exec(route.path);
  if (project) {
    const projectUuid = publicIdFromProjectUrlPart(project[1]!);
    return {
      to: `/admin/projects/${projectUuid}/edit/`,
      icon: 'edit',
      title: phrase.value.edit_project,
    };
  }

  if (/^\/admin\/projects\/[^/]+\/edit\/$/.test(route.path)) {
    const id = route.path.split('/')[3];
    return {
      to: { href: `/projects/${id}/`, external: true },
      icon: 'visibility',
      title: phrase.value.view_project,
    };
  }

  // `/projects/` and `/events/` are short addresses of the search narrowed to
  // one kind, so that is where a new one is offered. Showcase and CV hold
  // projects only, whatever the type says.
  if (route.path === '/search/') {
    const filters = parsePublicSearchFilters(route.query);
    if (filters.type === 'project' || filters.showcase || filters.cv)
      return {
        to: '/admin/projects/new/',
        icon: 'plus',
        title: phrase.value.new_project,
      };
    if (filters.type === 'event')
      return {
        to: '/admin/events/new/',
        icon: 'plus',
        title: phrase.value.new_event,
      };
  }

  const event = /^\/events\/([^/]+)\//.exec(route.path);
  if (event) {
    const eventId = publicIdFromEventUrlPart(event[1]!);
    return {
      to: `/admin/events/${eventId}/edit/`,
      icon: 'edit',
      title: phrase.value.edit_event,
    };
  }

  if (/^\/admin\/events\/[^/]+\/edit\/$/.test(route.path)) {
    const id = route.path.split('/')[3];
    return {
      to: { href: `/events/${id}/`, external: true },
      icon: 'visibility',
      title: phrase.value.view_event,
    };
  }

  if (/^\/diary\/[^/]+\/$/.test(route.path)) {
    const date = dateFromDiaryUrlPart(route.path.split('/')[2] ?? '');
    if (date)
      return {
        to: `/admin/diary/by-date/${date}/`,
        icon: 'edit',
        title: phrase.value.edit_diary_entry,
      };
  }

  if (route.path === '/tags/') {
    return {
      to: '/admin/tags/new/',
      icon: 'plus',
      title: phrase.value.new_tag,
    };
  }

  // The admin tag API accepts a public ID as well as a UUID, so the address a
  // visitor sees is enough to reach the editor.
  if (/^\/tags\/[^/]+\/$/.test(route.path)) {
    const publicId = publicIdFromTagUrlPart(route.path.split('/')[2] ?? '');
    return {
      to: `/admin/tags/${encodeURIComponent(publicId)}/edit/`,
      icon: 'edit',
      title: phrase.value.edit_tag,
    };
  }

  if (route.path === '/pages/') {
    return {
      to: '/admin/pages/new/',
      icon: 'plus',
      title: phrase.value.new_page,
    };
  }

  if (/^\/pages\/[^/]+\/$/.test(route.path)) {
    const slug = route.path.split('/')[2];
    return {
      to: `/admin/pages/${encodeURIComponent(slug ?? '')}/edit/`,
      icon: 'edit',
      title: phrase.value.edit_page,
    };
  }
});
</script>

<template>
  <header
    v-if="isAdmin && adminBarData"
    class="sticky top-0 z-10 h-(--height-admin-bar) bg-bg-1/60 backdrop-blur-md"
  >
    <div class="h-full bg-accent/35">
      <div
        class="m-auto flex h-full w-(--width-wide) max-w-full items-stretch
          justify-between sm:px-window"
      >
        <nav class="flex shrink-0 items-stretch" aria-label="Администрирование">
          <AdminBarButton to="/" icon="home" title="Сайт" />

          <AdminBarButton to="/admin/" icon="thei" title="Админ-панель" />

          <AdminBarButton
            to="/admin/projects"
            icon="project"
            :label="adminBarData.projectCount + ''"
            :title="phrase.x_projects(adminBarData.projectCount)"
            compact-label
            class="font-semibold"
          />

          <AdminBarButton
            to="/admin/events"
            icon="event"
            :label="adminBarData.eventCount + ''"
            :title="phrase.x_events(adminBarData.eventCount)"
            compact-label
            class="font-semibold"
          />

          <AdminBarButton
            to="/admin/diary"
            icon="thought"
            :label="adminBarData.diaryCount + ''"
            :title="phrase.x_diary_entries(adminBarData.diaryCount)"
            compact-label
            class="font-semibold"
          />

          <AdminBarButton
            v-if="contextAdminButton"
            :to="contextAdminButton.to"
            :icon="contextAdminButton.icon"
            :title="contextAdminButton.title"
          />
        </nav>

        <div class="flex min-w-0 items-stretch">
          <AdminBarButton
            to="/admin/about/"
            :label="publicAdmin.displayName"
            :title="publicAdmin.displayName"
            shrinkable
          >
            <template #icon>
              <div
                class="size-6 shrink-0 overflow-clip rounded-full border
                  border-border-3 max-xs:size-5"
              >
                <Media v-bind="publicAdmin.avatarMedia" class="size-full" />
              </div>
            </template>
          </AdminBarButton>

          <button
            type="button"
            :data-title-popup="phrase.sign_out"
            :aria-label="phrase.sign_out"
            class="flex h-full shrink-0 cursor-pointer items-center
              bg-transparent px-2 opacity-80 transition max-xs:px-1.5 sm:px-3
              hocus:bg-accent/25 hocus:opacity-100"
            @click="signOut"
          >
            <Icon name="power" class="shrink-0 text-xl max-xs:text-lg" />
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

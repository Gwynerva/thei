<script lang="ts" setup>
import type { AdminBarButtonProps } from './AdminBarButton.vue';
import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';
import { publicIdFromEventUrlPart } from '#layers/thei/shared/event-url';

const isAdmin = useIsAdmin();
const { data: adminBarData } = await useFetch('/api/admin/dashboard-summary', {
  key: 'admin-bar',
});

const publicAdmin = await usePublicAdmin();

const route = useRoute();

async function signOut() {
  await $fetch('/api/admin/session', { method: 'DELETE' });
  await navigateTo('/sign-in/', { external: true });
}

const contextAdminButton = computed<AdminBarButtonProps | undefined>(() => {
  if (route.path === '/projects/') {
    return {
      to: '/admin/projects/new/',
      icon: 'plus',
      title: phrase.value.new_project,
    };
  }

  if (route.path.startsWith('/projects/')) {
    const projectUuid = publicIdFromProjectUrlPart(
      route.path.split('/')[2] ?? '',
    );
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
      icon: 'eye-open',
      title: phrase.value.view_project,
    };
  }

  if (route.path === '/events/') {
    return {
      to: '/admin/events/new/',
      icon: 'plus',
      title: phrase.value.new_event,
    };
  }

  if (route.path.startsWith('/events/')) {
    const eventId = publicIdFromEventUrlPart(route.path.split('/')[2] ?? '');
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
      icon: 'eye-open',
      title: phrase.value.view_event,
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
          justify-between px-window"
      >
        <nav class="flex shrink-0 items-stretch" aria-label="Администрирование">
          <AdminBarButton to="/" icon="home" title="Сайт" />

          <AdminBarButton to="/admin/" icon="thei" title="Админ-панель" />

          <AdminBarButton
            to="/admin/projects"
            icon="project"
            :label="adminBarData.projectCount + ''"
            :title="phrase.x_projects(adminBarData.projectCount)"
            class="font-semibold"
          />

          <AdminBarButton
            to="/admin/events"
            icon="event"
            :label="adminBarData.eventCount + ''"
            :title="phrase.x_events(adminBarData.eventCount)"
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
            to="/admin/"
            :label="publicAdmin.displayName"
            :title="publicAdmin.displayName"
            shrinkable
          >
            <template #icon>
              <div
                class="size-6 shrink-0 overflow-clip rounded-full border
                  border-border-3"
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
              bg-transparent px-2 opacity-80 transition sm:px-3
              hocus:bg-accent/25 hocus:opacity-100"
            @click="signOut"
          >
            <Icon name="power" class="shrink-0 text-xl" />
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

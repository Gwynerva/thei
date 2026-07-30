<script lang="ts" setup>
import type { AdminBarButtonProps } from './AdminBarButton.vue';
import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';

const isAdmin = useIsAdmin();
const { data: adminBarData } = await useFetch('/api/admin/bar', {
  key: 'admin-bar',
});

const publicAdmin = await usePublicAdmin();

const route = useRoute();

const contextAdminButton = computed<AdminBarButtonProps | undefined>(() => {
  if (route.path === '/projects/') {
    return {
      to: '/admin/projects/add',
      icon: 'plus',
      title: phrase.value.new_project,
    };
  }

  if (route.path === '/events/') {
    return {
      to: '/admin/events/add',
      icon: 'plus',
      title: phrase.value.new_event,
    };
  }

  if (route.path.startsWith('/projects/')) {
    const projectUuid = publicIdFromProjectUrlPart(
      route.path.split('/')[2] ?? '',
    );
    return {
      to: `/admin/projects/edit/${projectUuid}/`,
      icon: 'edit',
      title: phrase.value.edit_project,
    };
  }

  if (route.path.startsWith('/events/')) {
    const eventId = route.path.split('/')[2];
    return {
      to: `/admin/events/${eventId}`,
      icon: 'edit',
      title: phrase.value.edit_event,
    };
  }

  if (route.path.startsWith('/admin/projects/edit')) {
    const id = route.path.split('/')[4];
    return {
      to: { href: `/projects/${id}/`, external: true },
      icon: 'eye-open',
      title: phrase.value.view_project,
    };
  }

  if (route.path.startsWith('/admin/events/edit')) {
    const id = route.path.split('/')[4];
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

          <AdminBarButton
            :to="{ href: '/sign-out/', external: true }"
            icon="power"
            :title="phrase.sign_out"
          />
        </div>
      </div>
    </div>
  </header>
</template>

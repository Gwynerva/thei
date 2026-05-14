<script lang="ts" setup>
import type { AdminBarButtonProps } from './AdminBarButton.vue';

const isAdmin = useIsAdmin();
const { data: adminBarData } = await useFetch('/api/admin/bar', {
  key: 'admin-bar',
});

const {
  to_admin_panel,
  to_website,
  sign_out,
  x_projects,
  x_events,
  new_project,
  new_event,
  edit_project,
  edit_event,
} = useLanguagePhrases();

const publicAdmin = await usePublicAdmin();

const route = useRoute();
const isOnAdminPage = computed(() => route.path.startsWith('/admin'));

const contextAdminButton = computed<AdminBarButtonProps | undefined>(() => {
  if (route.path === '/projects/') {
    return {
      to: '/admin/projects/add',
      icon: 'plus',
      label: new_project.value,
    };
  }

  if (route.path === '/events/') {
    return {
      to: '/admin/events/add',
      icon: 'plus',
      label: new_event.value,
    };
  }

  if (route.path.startsWith('/projects/')) {
    const projectId = route.path.split('/')[2];
    return {
      to: `/admin/projects/${projectId}`,
      icon: 'edit',
      label: edit_project.value,
    };
  }

  if (route.path.startsWith('/events/')) {
    const eventId = route.path.split('/')[2];
    return {
      to: `/admin/events/${eventId}`,
      icon: 'edit',
      label: edit_event.value,
    };
  }

  const isEditProject = route.path.startsWith('/admin/projects/edit');
  const isEditEvent = route.path.startsWith('/admin/events/edit');

  if (isEditProject || isEditEvent) {
    const id = route.path.split('/')[4];
    const isProject = isEditProject;

    return {
      to: {
        href: isProject ? `/projects/${id}` : `/events/${id}`,
        external: true,
        target: '_blank',
      },
      icon: 'edit',
      label: isProject ? edit_project.value : edit_event.value,
    };
  }
});
</script>

<template>
  <header
    v-if="isAdmin && adminBarData"
    class="sticky top-0 z-50 flex h-[40px] items-center justify-center
      bg-gray-900/80 shadow-lg shadow-black/20 backdrop-blur dark:bg-white/80
      dark:shadow-black/6"
  >
    <AdminBarButton
      :to="isOnAdminPage ? '/' : '/admin/'"
      :icon="isOnAdminPage ? 'home' : 'thei'"
      :label="isOnAdminPage ? to_website : to_admin_panel"
    />

    <AdminBarButton
      v-if="contextAdminButton"
      :to="contextAdminButton.to"
      :icon="contextAdminButton.icon"
      :label="contextAdminButton.label"
    />

    <AdminBarButton
      to="/admin/projects"
      icon="project"
      :label="adminBarData.projectCount + ''"
      :title="x_projects(adminBarData.projectCount)"
      class="font-semibold"
    />

    <AdminBarButton
      to="/admin/events"
      icon="event"
      :label="adminBarData.eventCount + ''"
      :title="x_events(adminBarData.eventCount)"
      class="font-semibold"
    />

    <AdminBarButton to="/admin/" :label="publicAdmin.displayName">
      <template #icon>
        <Media
          :src="publicAdmin.avatarUrl"
          class="size-6 rounded-full border border-gray-100
            dark:border-gray-600"
        />
      </template>
    </AdminBarButton>

    <AdminBarButton
      :to="{ href: '/api/admin/logout', external: true }"
      icon="power"
      :label="sign_out"
    />
  </header>
</template>

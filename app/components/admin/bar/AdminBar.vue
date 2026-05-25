<script lang="ts" setup>
import type { AdminBarButtonProps } from './AdminBarButton.vue';
import userSvg from '~/assets/fallback/user.svg?raw';

const isAdmin = useIsAdmin();
const { data: adminBarData } = await useFetch('/api/admin/bar', {
  key: 'admin-bar',
});

const publicAdmin = await usePublicAdmin();

const route = useRoute();
const isOnAdminPage = computed(() => route.path.startsWith('/admin/'));

const contextAdminButton = computed<AdminBarButtonProps | undefined>(() => {
  if (route.path === '/projects/') {
    return {
      to: '/admin/projects/add',
      icon: 'plus',
      label: phrase.value.new_project,
    };
  }

  if (route.path === '/events/') {
    return {
      to: '/admin/events/add',
      icon: 'plus',
      label: phrase.value.new_event,
    };
  }

  if (route.path.startsWith('/projects/')) {
    const projectUuid = route.path.split('/')[2];
    return {
      to: `/admin/projects/edit/${projectUuid}/`,
      icon: 'edit',
      label: phrase.value.edit_project,
    };
  }

  if (route.path.startsWith('/events/')) {
    const eventId = route.path.split('/')[2];
    return {
      to: `/admin/events/${eventId}`,
      icon: 'edit',
      label: phrase.value.edit_event,
    };
  }

  if (route.path.startsWith('/admin/projects/edit')) {
    const id = route.path.split('/')[4];
    return {
      to: { href: `/projects/${id}/`, external: true },
      icon: 'eye-open',
      label: phrase.value.view_project,
    };
  }

  if (route.path.startsWith('/admin/events/edit')) {
    const id = route.path.split('/')[4];
    return {
      to: { href: `/events/${id}/`, external: true },
      icon: 'eye-open',
      label: phrase.value.view_event,
    };
  }
});
</script>

<template>
  <header
    v-if="isAdmin && adminBarData"
    class="sticky top-0 z-10 h-(--height-admin-bar) bg-bg-1/60 backdrop-blur-md"
  >
    <div class="flex h-full items-stretch justify-center bg-accent/35">
      <AdminBarButton
        :to="isOnAdminPage ? '/' : '/admin/'"
        :icon="isOnAdminPage ? 'home' : 'thei'"
        :label="isOnAdminPage ? phrase.to_website : phrase.to_admin_panel"
      />

      <AdminBarButton
        v-if="contextAdminButton"
        :to="contextAdminButton.to"
        :icon="contextAdminButton.icon"
        :label="contextAdminButton.label"
      />

      <AdminBarButton
        v-if="isOnAdminPage && route.path !== '/admin/'"
        to="/admin/"
        icon="thei"
        :title="phrase.to_admin_panel"
      />

      <AdminBarButton
        to="/admin/projects"
        icon="project"
        :label="adminBarData.projectCount + ''"
        :title="phrase.x_projects(adminBarData.projectCount)"
        label-visibility="always"
        class="font-semibold"
      />

      <AdminBarButton
        to="/admin/events"
        icon="event"
        :label="adminBarData.eventCount + ''"
        :title="phrase.x_events(adminBarData.eventCount)"
        label-visibility="always"
        class="font-semibold"
      />

      <AdminBarButton
        to="/admin/"
        :label="publicAdmin.displayName"
        class="shrink-0 sm:shrink-1"
      >
        <template #icon>
          <div class="size-6 overflow-clip rounded-full border border-border-3">
            <Media
              v-if="publicAdmin.avatarUrl"
              :src="publicAdmin.avatarUrl"
              class="size-full"
            />
            <TintedIcon
              v-else
              :svg="userSvg"
              :seed="publicAdmin.displayName"
              class="size-full"
            />
          </div>
        </template>
      </AdminBarButton>

      <AdminBarButton
        :to="{ href: '/sign-out/', external: true }"
        icon="power"
        :label="phrase.sign_out"
      />
    </div>
  </header>
</template>

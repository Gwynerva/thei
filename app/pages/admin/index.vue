<script lang="ts" setup>
definePageMeta({
  layout: 'admin',
});

await useAdminTabTitle(computed(() => phrase.value.admin_panel));
const { data: tagCount } = await useFetch<{ count: number }>('/api/admin/tags/count', {
  key: 'admin-tag-count',
});
</script>

<template>
  <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <TheiLink to="/admin/tags/" class="group">
      <Box>
        <div class="flex items-center justify-between gap-md p-md">
          <div class="flex items-center gap-sm">
            <div class="flex size-12 items-center justify-center rounded-normal bg-accent/20 text-xl text-accent transition group-hocus:bg-accent/30">
              <Icon name="tag" />
            </div>
            <div>
              <p class="font-semibold transition group-hocus:text-accent">{{ phrase.admin_tags }}</p>
              <p class="text-sm text-text-3">{{ phrase.tags_description }}</p>
            </div>
          </div>
          <span class="text-2xl font-bold text-text-2">{{ tagCount?.count ?? 0 }}</span>
        </div>
      </Box>
    </TheiLink>
    <AdminSessions />
  </div>
</template>

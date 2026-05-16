<template>
  <AdminGridWrapper>
    <AdminBar />
    <SiteLoadingIndicator />
    <div class="flex justify-between">
      <aside>
        <!-- Left Aside -->
      </aside>
      <main class="w-full max-w-[1080px]">
        <slot></slot>
      </main>
      <aside>
        <!-- Right Aside -->
      </aside>
    </div>
  </AdminGridWrapper>
</template>

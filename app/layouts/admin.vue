<template>
  <AdminGridWrapper>
    <AdminBar />
    <TheiLoadingIndicator />
    <slot></slot>
    <!-- Opened only by a hand on the page: nothing of it is drawn on the
         server. -->
    <ClientOnly><SearchPopup /></ClientOnly>
    <AppToast />
  </AdminGridWrapper>
</template>

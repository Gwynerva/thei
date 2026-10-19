<template>
  <AdminGridWrapper>
    <AdminBar />
    <TheiLoadingIndicator />
    <slot></slot>
    <SearchPopup />
    <AppToast />
  </AdminGridWrapper>
</template>

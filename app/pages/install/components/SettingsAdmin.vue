<script lang="ts" setup>
import { useInstallPhrases } from '../install-language';

const { admin_data, admin_data_description } = useInstallPhrases();
</script>

<template>
  <Box
    icon="person-key"
    :title="admin_data"
    :description="admin_data_description"
  >
    <p>Lol</p>
  </Box>
</template>

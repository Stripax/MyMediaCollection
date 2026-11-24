<script setup lang="ts">
import CatalogImportDialog from './CatalogImportDialog.vue'
const emit = defineEmits<{ saved: [] }>()
</script>
<template>
  <CatalogImportDialog category="videoGames" source="igdb" @saved="emit('saved')" />
</template>

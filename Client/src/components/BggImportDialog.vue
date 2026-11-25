<script setup lang="ts">
import CatalogImportDialog from './CatalogImportDialog.vue'
const emit = defineEmits<{ saved: [] }>()
</script>
<template>
  <CatalogImportDialog category="boardGames" source="bgg" @saved="emit('saved')" />
</template>

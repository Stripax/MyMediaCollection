<script setup lang="ts">
import CatalogImportDialog from './CatalogImportDialog.vue'
import type { CollectionCategory } from '../models/collection'
defineProps<{ category: CollectionCategory }>()
const emit = defineEmits<{ saved: [] }>()
</script>
<template>
  <CatalogImportDialog :category="category" source="tmdb" @saved="emit('saved')" />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSnackbar } from '../composables/useSnackbar'
import CollectionTable from '../components/CollectionTable.vue'
import type { CollectionCategory, CollectionItem } from '../models/collection'
import { useCollectionRefresh } from '../composables/useCollectionRefresh'

const { t } = useI18n({ useScope: 'global' })
const { show, dismissMessage } = useSnackbar()
defineProps<{ category: CollectionCategory }>()
const items = ref<CollectionItem[]>([])
const loading = ref(true)
const loadError = ref(false)
let activeRequest: AbortController | undefined

async function loadCollection() {
  activeRequest?.abort()
  const request = new AbortController()
  activeRequest = request
  loading.value = true
  loadError.value = false
  dismissMessage('collection.loadError')
  try {
    const response = await fetch('/api/collection', { signal: request.signal })
    if (!response.ok) throw new Error('Collection request failed')
    const result: CollectionItem[] = await response.json()
    if (!request.signal.aborted) items.value = result
  } catch {
    if (!request.signal.aborted) {
      loadError.value = true
      show('collection.loadError', 'error')
    }
  } finally {
    if (!request.signal.aborted) loading.value = false
  }
}

onMounted(loadCollection)
watch(useCollectionRefresh().revision, loadCollection)
onBeforeUnmount(() => activeRequest?.abort())
</script>

<template>
  <h1>{{ t(category === 'all' ? 'collection.allTitle' : `sidebar.${category}`) }}</h1>
  <CollectionTable
    :items="items"
    :category="category"
    :loading="loading"
    :error="loadError"
    @retry="loadCollection"
    @changed="loadCollection"
  />
</template>

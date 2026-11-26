<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import CollectionItemDialog from './CollectionItemDialog.vue'
import type { CollectionItem } from '../models/collection'
import { useSnackbar } from '../composables/useSnackbar'

const props = defineProps<{
  request: { id: number; trigger: HTMLElement; noticeId: number } | null
}>()
const emit = defineEmits<{ closed: []; saved: [] }>()
const item = ref<CollectionItem | null>(null)
const items = ref<CollectionItem[]>([])
const editor = ref<InstanceType<typeof CollectionItemDialog> | null>(null)
const { show, disableItemLinks, dismiss } = useSnackbar()
let controller: AbortController | undefined

watch(
  () => props.request,
  async (request) => {
    controller?.abort()
    item.value = null
    if (!request) return
    const current = new AbortController()
    controller = current
    try {
      const response = await fetch('/api/collection', { signal: current.signal })
      if (!response.ok) throw new Error('Collection request failed')
      const result: CollectionItem[] = await response.json()
      if (current.signal.aborted) return
      const found = result.find((entry) => entry.id === request.id)
      if (!found) {
        disableItemLinks(request.id)
        show('itemForm.notFound', 'error')
        emit('closed')
        return
      }
      items.value = result
      item.value = found
      await nextTick()
      if (!current.signal.aborted && editor.value) {
        editor.value.openEditor(request.trigger)
        dismiss(request.noticeId)
      }
    } catch {
      if (!current.signal.aborted) {
        show('collection.loadError', 'error')
        emit('closed')
      }
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <CollectionItemDialog
    v-if="item"
    ref="editor"
    :item="item"
    :items="items"
    hide-trigger
    @saved="emit('saved')"
    @closed="emit('closed')"
  />
</template>

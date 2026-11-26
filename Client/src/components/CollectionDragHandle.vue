<script setup lang="ts">
import { useI18n } from 'vue-i18n'
defineProps<{ index: number; count: number }>()
const emit = defineEmits<{ start: [event: DragEvent]; end: []; move: [to: number] }>()
const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <button
    type="button"
    class="collection-drag-handle"
    :draggable="count > 1"
    :disabled="count < 2"
    :aria-label="t('mediaCollection.reorder', { number: index + 1 })"
    :title="t('mediaCollection.reorder', { number: index + 1 })"
    @dragstart="emit('start', $event)"
    @dragend="emit('end')"
    @keydown.up.prevent="emit('move', index - 1)"
    @keydown.down.prevent="emit('move', index + 1)"
  >
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  </button>
</template>

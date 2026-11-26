<script setup lang="ts">
import '../style/collection-actions.css'
import '../style/info-button.css'
import { useI18n } from 'vue-i18n'
import { toRaw } from 'vue'
import type { CollectionContent } from '../models/collection'
import CollectionDragHandle from './CollectionDragHandle.vue'
import ToolbarTooltip from './ToolbarTooltip.vue'
import ToolbarIcon from './ToolbarIcon.vue'
import { useCollectionReorder } from '../composables/useCollectionReorder'
const contents = defineModel<CollectionContent[]>({ default: () => [] })
defineProps<{ inspectedTmdbId?: number | null }>()
const emit = defineEmits<{ inspect: [entry: CollectionContent] }>()
const { t } = useI18n({ useScope: 'global' })
const { list, draggedIndex, dropIndex, start, over, drop, end, move } =
  useCollectionReorder(contents)
const entryKeys = new WeakMap<CollectionContent, number>()
let nextKey = 0
function entryKey(entry: CollectionContent) {
  const raw = toRaw(entry)
  if (!entryKeys.has(raw)) entryKeys.set(raw, ++nextKey)
  return entryKeys.get(raw)!
}
function renameEntry(index: number, name: string) {
  contents.value = contents.value.map((entry, current) => {
    if (current !== index) return entry
    const renamed = { ...entry, name }
    entryKeys.set(renamed, entryKey(entry))
    return renamed
  })
}
</script>
<template>
  <div ref="list" class="media-collection-contents">
    <p>{{ t('mediaCollection.sharedFormat') }}</p>
    <p v-if="contents.length > 1">{{ t('mediaCollection.reorderHint') }}</p>
    <TransitionGroup name="collection-content" tag="div" class="media-collection-items">
      <div
        v-for="(entry, index) in contents"
        :key="entryKey(entry)"
        class="media-collection-entry"
        :data-collection-index="index"
        :class="{
          'collection-entry-dragging': draggedIndex === index,
          'collection-entry-drop-target': dropIndex === index && draggedIndex !== index,
          'collection-entry-inspected': !!entry.tmdbId && entry.tmdbId === inspectedTmdbId,
        }"
        @dragover="over(index, $event)"
        @drop="drop(index, $event)"
      >
        <CollectionDragHandle
          :index="index"
          :count="contents.length"
          @click="entry.tmdbId && emit('inspect', entry)"
          @start="start(index, $event)"
          @end="end"
          @move="move(index, $event)"
        />
        <label class="item-form-field">
          <input
            :value="entry.name"
            :name="`CollectionContent-${index}`"
            :aria-label="t('mediaCollection.entryName', { number: index + 1 })"
            required
            maxlength="300"
            autocomplete="off"
            @input="renameEntry(index, ($event.target as HTMLInputElement).value)"
            @focus="entry.tmdbId && emit('inspect', entry)"
          />
        </label>
        <ToolbarTooltip
          v-if="entry.tmdbId"
          v-slot="{ describedby }"
          :text="t('mediaCollection.info')"
          class="collection-action-tooltip collection-member-info-tooltip"
        >
          <button
            type="button"
            class="collection-member-details info-btn-glass"
            :aria-pressed="entry.tmdbId === inspectedTmdbId"
            :aria-label="t('mediaCollection.inspectItem', { name: entry.name })"
            :aria-describedby="describedby"
            @click="emit('inspect', entry)"
          >
            <span aria-hidden="true">i</span>
          </button>
        </ToolbarTooltip>
        <ToolbarTooltip
          v-slot="{ describedby }"
          :text="t('mediaCollection.remove')"
          class="collection-action-tooltip collection-member-remove-tooltip"
        >
          <button
            type="button"
            class="collection-member-remove collection-icon-button collection-delete-button"
            :aria-label="t('mediaCollection.remove')"
            :aria-describedby="describedby"
            @click="contents = contents.filter((_, current) => current !== index)"
          >
            <ToolbarIcon name="trash" />
          </button>
        </ToolbarTooltip>
      </div>
    </TransitionGroup>
    <slot name="add">
      <button
        type="button"
        :disabled="contents.length >= 100"
        @click="contents = [...contents, { name: '' }]"
      >
        {{ t('mediaCollection.addEntry') }}
      </button>
    </slot>
  </div>
</template>
<style src="../style/media-collection.css"></style>

<script setup lang="ts">
import { computed, ref, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import CollectionItemDialog from './CollectionItemDialog.vue'
import DeleteCollectionItemDialog from './DeleteCollectionItemDialog.vue'
import TmdbImportDialog from './TmdbImportDialog.vue'
import TmdbAttribution from './TmdbAttribution.vue'
import { posterUrl } from '../models/tmdb'
import {
  mediaCategories,
  mediaFormats,
  boardGameFormats,
  gamePlatforms,
  gameStores,
  pcPlatform,
  otherOption,
  type CollectionCategory,
  type CollectionItem,
} from '../models/collection'

const props = defineProps<{
  items: CollectionItem[]
  category: CollectionCategory
  loading: boolean
  error: boolean
}>()
const emit = defineEmits<{ retry: []; changed: [] }>()
const searchQuery = ref('')
const editors = new Map<number, InstanceType<typeof CollectionItemDialog>>()

function setEditor(id: number, editor: Element | ComponentPublicInstance | null) {
  if (editor) editors.set(id, editor as InstanceType<typeof CollectionItemDialog>)
  else editors.delete(id)
}

function editItem(id: number, event: MouseEvent) {
  editors.get(id)?.openEditor(event.currentTarget as HTMLButtonElement)
}
const normalizedQuery = computed(() => searchQuery.value.trim().normalize('NFC').toLowerCase())

function itemChanged() {
  emit('changed')
}
const { t } = useI18n({ useScope: 'global' })
const visibleItems = computed(() => {
  const mediaType = mediaCategories.find((category) => category.id === props.category)?.value
  return props.items.filter(
    (item) =>
      (props.category === 'all' || item.mediaType === mediaType) &&
      item.name.normalize('NFC').toLowerCase().includes(normalizedQuery.value),
  )
})

function optionLabel(option: { value: number; label: string } | undefined) {
  if (!option) return '—'
  return option.value === otherOption ? t('common.other') : option.label
}

function formatLabel(item: CollectionItem) {
  if (item.mediaType === 4) {
    const format = boardGameFormats.find((format) => format.value === item.mediaFormat)
    return format ? t(format.label) : '—'
  }
  if (item.mediaType === 3) {
    if (item.platform === pcPlatform) {
      const store = gameStores.find((store) => store.value === item.store)
      return store ? `PC · ${optionLabel(store)}` : 'PC'
    }
    return optionLabel(gamePlatforms.find((platform) => platform.value === item.platform))
  }
  return optionLabel(mediaFormats.find((format) => format.value === item.mediaFormat))
}

function prepareRowLeave(element: Element) {
  const row = element as HTMLTableRowElement
  const bounds = row.getBoundingClientRect()
  const parentBounds = row.parentElement!.getBoundingClientRect()
  const widths = Array.from(row.cells, (cell) => cell.getBoundingClientRect().width)

  // Preserve table column widths while Vue moves the remaining rows into place.
  Object.assign(row.style, {
    position: 'absolute',
    top: `${bounds.top - parentBounds.top}px`,
    left: `${bounds.left - parentBounds.left}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    display: 'table',
    tableLayout: 'fixed',
  })
  Array.from(row.cells).forEach((cell, index) => {
    cell.style.width = `${widths[index]}px`
  })
  row.inert = true
  row.setAttribute('aria-hidden', 'true')
}

function finishRowLeave(element: Element) {
  const row = element as HTMLTableRowElement
  Object.assign(row.style, {
    position: '',
    top: '',
    left: '',
    width: '',
    height: '',
    display: '',
    tableLayout: '',
  })
  Array.from(row.cells).forEach((cell) => {
    cell.style.width = ''
  })
  row.inert = false
  row.removeAttribute('aria-hidden')
}
</script>

<template>
  <section class="collection-section" :aria-label="t('collection.title')" :aria-busy="loading">
    <p class="collection-instructions">
      {{ t('collection.instructions', { action: t(`collection.add.${category}`) }) }}
    </p>
    <div class="collection-toolbar">
      <div class="collection-search">
        <label class="collection-search-field">
          <span>{{ t('collection.searchLabel') }}</span>
          <input
            v-model="searchQuery"
            type="search"
            :placeholder="t('collection.searchPlaceholder')"
          />
        </label>
        <button type="button" :disabled="!searchQuery" @click="searchQuery = ''">
          {{ t('collection.clearSearch') }}
        </button>
      </div>
      <CollectionItemDialog :category="category" @saved="itemChanged" />
      <TmdbImportDialog
        v-if="category === 'all' || category === 'movies' || category === 'tvSeries'"
        :category="category"
        @saved="itemChanged"
      />
    </div>
    <p v-if="normalizedQuery && !loading && !error" aria-live="polite">
      {{ t('collection.searchResults', { count: visibleItems.length }) }}
    </p>
    <p v-if="loading" role="status">{{ t('collection.loading') }}</p>
    <div v-if="error" class="collection-error">
      <p role="alert">{{ t('collection.loadError') }}</p>
      <button type="button" :disabled="loading" @click="$emit('retry')">
        {{ t('collection.retry') }}
      </button>
    </div>
    <div
      class="collection-table-scroll"
      role="region"
      :aria-label="t('collection.title')"
      tabindex="0"
    >
      <table class="collection-table" :aria-label="t('collection.title')">
        <thead>
          <tr>
            <th scope="col">{{ t('itemForm.name') }}</th>
            <th scope="col">
              {{
                t(
                  category === 'videoGames'
                    ? 'itemForm.platform'
                    : category === 'all'
                      ? 'collection.formatOrPlatform'
                      : 'itemForm.mediaFormat',
                )
              }}
            </th>
            <th scope="col">{{ t('itemForm.info') }}</th>
            <th scope="col">{{ t('collection.actions') }}</th>
          </tr>
        </thead>
        <TransitionGroup
          tag="tbody"
          name="collection-row"
          @before-leave="prepareRowLeave"
          @after-leave="finishRowLeave"
          @leave-cancelled="finishRowLeave"
        >
          <tr v-for="item in visibleItems" :key="item.id" class="collection-item-row">
            <td>
              <img
                v-if="posterUrl(item.posterPath)"
                :src="posterUrl(item.posterPath)!"
                alt=""
                class="collection-poster"
                width="48"
                height="72"
                loading="lazy"
              />
              <button
                type="button"
                class="collection-name-button"
                :aria-label="t('collection.editItem', { name: item.name })"
                aria-haspopup="dialog"
                @click="editItem(item.id, $event)"
              >
                {{ item.name }}
              </button>
            </td>
            <td>{{ formatLabel(item) }}</td>
            <td class="collection-info">{{ item.info || '—' }}</td>
            <td>
              <div class="collection-row-actions">
                <CollectionItemDialog
                  :ref="(editor) => setEditor(item.id, editor)"
                  :item="item"
                  @saved="itemChanged"
                />
                <DeleteCollectionItemDialog :item="item" @deleted="itemChanged" />
              </div>
            </td>
          </tr>
          <tr v-if="!visibleItems.length && !loading && !error" key="empty">
            <td colspan="4" class="collection-empty">
              {{
                t(
                  normalizedQuery
                    ? 'collection.noMatches'
                    : category === 'all'
                      ? 'collection.empty'
                      : 'collection.emptyCategory',
                )
              }}
            </td>
          </tr>
        </TransitionGroup>
      </table>
    </div>
    <TmdbAttribution v-if="visibleItems.some((item) => item.tmdbId)" />
  </section>
</template>

<style src="../style/collection-table.css"></style>

<script setup lang="ts">
import { computed, ref, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import CollectionItemDialog from './CollectionItemDialog.vue'
import DeleteCollectionItemDialog from './DeleteCollectionItemDialog.vue'
import TmdbImportDialog from './TmdbImportDialog.vue'
import TmdbAttribution from './TmdbAttribution.vue'
import { posterUrl } from '../models/tmdb'
import { igdbCoverUrl } from '../models/igdb'
import { displayItemName, searchableItemNames } from '../models/itemNames'
import IgdbImportDialog from './IgdbImportDialog.vue'
import IgdbAttribution from './IgdbAttribution.vue'
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
const { t, locale } = useI18n({ useScope: 'global' })
const visibleItems = computed(() => {
  const mediaType = mediaCategories.find((category) => category.id === props.category)?.value
  return props.items.filter(
    (item) =>
      (props.category === 'all' || item.mediaType === mediaType) &&
      searchableItemNames(item).some((name) =>
        name.normalize('NFC').toLowerCase().includes(normalizedQuery.value),
      ),
  )
})

function optionLabel(option: { value: number; label: string } | undefined) {
  if (!option) return '—'
  return option.value === otherOption ? t('common.other') : option.label
}

function categoryLabel(mediaType: number) {
  const category = mediaCategories.find((category) => category.value === mediaType)
  return t(category?.label ?? 'collection.unknown')
}

function formatLabel(item: CollectionItem) {
  if (item.mediaType === 2 && (item.isCompleteBox || item.ownedSeasons?.length)) {
    const formats = item.ownedSeasons?.length
      ? [...new Set(item.ownedSeasons.map((season) => season.mediaFormat))]
      : [item.mediaFormat]
    const label = formats
      .map((value) => optionLabel(mediaFormats.find((format) => format.value === value)))
      .join(' / ')
    return item.isCompleteBox ? `${t('tvOwnership.completeBoxShort')} · ${label}` : label
  }
  if (item.mediaType === 4) {
    const format = boardGameFormats.find((format) => format.value === item.mediaFormat)
    return format ? t(format.label) : '—'
  }
  if (item.mediaType === 3) {
    const platform =
      item.platform === pcPlatform
        ? 'PC'
        : optionLabel(gamePlatforms.find((platform) => platform.value === item.platform))
    const store = gameStores.find((store) => store.value === item.store)
    return store ? `${platform} · ${optionLabel(store)}` : platform
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
            autocomplete="off"
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
      <IgdbImportDialog
        v-if="category === 'all' || category === 'videoGames'"
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
            <th v-if="category === 'all'" scope="col">{{ t('collection.category') }}</th>
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
            <th v-if="category === 'videoGames'" scope="col">{{ t('collection.copyType') }}</th>
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
              <div class="collection-name-content">
                <img
                  v-if="posterUrl(item.posterPath) || igdbCoverUrl(item.coverImageId)"
                  :src="(posterUrl(item.posterPath) || igdbCoverUrl(item.coverImageId))!"
                  alt=""
                  class="collection-poster"
                  width="48"
                  height="72"
                  loading="lazy"
                />
                <button
                  type="button"
                  class="collection-name-button"
                  :title="displayItemName(item, locale)"
                  :aria-label="t('collection.editItem', { name: displayItemName(item, locale) })"
                  aria-haspopup="dialog"
                  @click="editItem(item.id, $event)"
                >
                  {{ displayItemName(item, locale) }}
                </button>
              </div>
            </td>
            <td v-if="category === 'all'" class="collection-category">
              {{ categoryLabel(item.mediaType) }}
            </td>
            <td class="collection-format">{{ formatLabel(item) }}</td>
            <td v-if="category === 'videoGames'" class="collection-copy-type">
              {{
                t(
                  item.isPhysical === true
                    ? 'collection.physicalCopy'
                    : item.isPhysical === false
                      ? 'collection.digitalCopy'
                      : 'collection.unknownCopy',
                )
              }}
            </td>
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
            <td
              :colspan="category === 'all' || category === 'videoGames' ? 5 : 4"
              class="collection-empty"
            >
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
    <IgdbAttribution v-if="visibleItems.some((item) => item.igdbId)" />
  </section>
</template>

<style src="../style/collection-table.css"></style>

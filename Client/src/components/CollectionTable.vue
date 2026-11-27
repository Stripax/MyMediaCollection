<script setup lang="ts">
import '../style/collection-actions.css'
import CollectionInfoDialog from './CollectionInfoDialog.vue'
import CollectionFilters from './CollectionFilters.vue'
import { useCollectionFilters } from '../composables/useCollectionFilters'
import { computed, nextTick, onBeforeUnmount, ref, watch, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import CollectionItemDialog from './CollectionItemDialog.vue'
import DeleteCollectionItemDialog from './DeleteCollectionItemDialog.vue'
import TmdbImportDialog from './TmdbImportDialog.vue'
import TmdbAttribution from './TmdbAttribution.vue'
import { displayItemName, searchableItemNames } from '../models/itemNames'
import {
  itemSourceUrl,
  itemCoverUrl,
  itemSourceName,
  itemSourceTooltip,
} from '../models/itemSources'
import BggImportDialog from './BggImportDialog.vue'
import BggAttribution from './BggAttribution.vue'
import ToolbarTooltip from './ToolbarTooltip.vue'
import GamePlatformBadge from './GamePlatformBadge.vue'
import MediaFormatBadges from './MediaFormatBadges.vue'
import IgdbImportDialog from './IgdbImportDialog.vue'
import IgdbAttribution from './IgdbAttribution.vue'
import {
  itemVersions,
  mediaCategories,
  boardGameFormats,
  type CollectionCategory,
  type CollectionItem,
  type BoardGameReference,
  boardGameKind,
  boardGameParents,
} from '../models/collection'

const props = defineProps<{
  items: CollectionItem[]
  category: CollectionCategory
  loading: boolean
  error: boolean
}>()
const emit = defineEmits<{
  retry: []
  changed: []
  'category-selected': [category: CollectionCategory]
}>()
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
function clearSearch() {
  searchQuery.value = ''
  searchInput.value?.focus({ preventScroll: true })
}
const tableCategory = ref(props.category)
const categoryChanging = ref(false)
const leavingRows = new Set<Element>()
let disposed = false
function finishCategoryChange() {
  if (disposed || !categoryChanging.value || leavingRows.size) return
  tableCategory.value = props.category
  categoryChanging.value = false
}
watch(
  () => props.category,
  () => {
    categoryChanging.value = true
    void nextTick(finishCategoryChange)
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  disposed = true
  leavingRows.clear()
})
const {
  filters,
  mediaType: filterMediaType,
  active: filtersActive,
  reset: resetFilters,
  matches: matchesFilters,
} = useCollectionFilters(() => props.category)
const tableElement = ref<HTMLTableElement | null>(null)
const highlights = new Map<number, { row: HTMLElement; timer: ReturnType<typeof setTimeout> }>()
const editedFields: (keyof CollectionItem)[] = [
  'name',
  'versions',
  'mediaFormat',
  'platform',
  'store',
  'isPhysical',
  'info',
  'updatedAt',
  'isCompleteBox',
  'ownedSeasons',
  'boardGameKind',
  'baseGames',
  'isCollection',
  'collectionContents',
]

function clearHighlight(id: number) {
  const highlight = highlights.get(id)
  if (!highlight) return
  clearTimeout(highlight.timer)
  highlight.row.classList.remove('collection-row-updated')
  highlights.delete(id)
}

function clearHighlights() {
  for (const id of highlights.keys()) clearHighlight(id)
}

watch(
  () => props.items,
  (items, previous) => {
    const previousItems = new Map(previous.map((item) => [item.id, item]))
    for (const id of highlights.keys())
      if (!items.some((item) => item.id === id)) clearHighlight(id)
    for (const item of items) {
      const before = previousItems.get(item.id)
      if (
        !before ||
        JSON.stringify(editedFields.map((field) => before[field])) ===
          JSON.stringify(editedFields.map((field) => item[field]))
      )
        continue
      const row = tableElement.value?.querySelector<HTMLElement>(
        `tbody tr[data-item-id="${item.id}"]`,
      )
      if (!row || row.hasAttribute('aria-hidden')) continue
      clearHighlight(item.id)
      // Restart the pulse even when the same item is saved again during its highlight.
      void row.offsetWidth
      row.classList.add('collection-row-updated')
      highlights.set(item.id, { row, timer: setTimeout(() => clearHighlight(item.id), 1800) })
    }
  },
  { flush: 'post' },
)
watch(() => props.category, clearHighlights, { flush: 'sync' })
onBeforeUnmount(clearHighlights)
const editors = new Map<number, InstanceType<typeof CollectionItemDialog>>()
const linkedEditor = ref<InstanceType<typeof CollectionItemDialog> | null>(null)
const linkedItemId = ref<number | null>(null)
const linkedItem = computed(() => props.items.find((item) => item.id === linkedItemId.value))
const ownedBggGames = computed(() => {
  const games = new Map<number, CollectionItem>()
  for (const item of props.items) {
    if (item.mediaType === 4 && item.bggId && !games.has(item.bggId)) games.set(item.bggId, item)
  }
  return games
})

function ownedRequiredGame(game: BoardGameReference) {
  return game.collectionItemId
    ? props.items.find((item) => item.id === game.collectionItemId && item.mediaType === 4)
    : game.bggId
      ? ownedBggGames.value.get(game.bggId)
      : undefined
}

async function editRequiredGame(game: BoardGameReference, event: MouseEvent) {
  const item = ownedRequiredGame(game)
  if (!item) return
  const target = event.currentTarget as HTMLElement
  linkedItemId.value = item.id
  await nextTick()
  linkedEditor.value?.openEditor(target)
}

function setEditor(id: number, editor: Element | ComponentPublicInstance | null) {
  if (editor) editors.set(id, editor as InstanceType<typeof CollectionItemDialog>)
  else editors.delete(id)
}

function editItem(id: number, event: MouseEvent) {
  editors.get(id)?.openEditor(event.currentTarget as HTMLButtonElement)
}
const normalizedQuery = computed(() => searchQuery.value.trim().normalize('NFC').toLowerCase())

function requiredGameTags(item: CollectionItem) {
  return boardGameParents(item).filter((game) => game.name?.trim())
}

function itemChanged() {
  emit('changed')
}
const { t, locale } = useI18n({ useScope: 'global' })
const nameSort = ref<'ascending' | 'descending' | null>(null)
const categorySort = ref<'ascending' | 'descending' | null>(null)
const nextCategorySortAction = computed(() =>
  categorySort.value === 'ascending'
    ? 'collection.sortCategoryDescending'
    : categorySort.value === 'descending'
      ? 'collection.sortCategoryDefault'
      : 'collection.sortCategoryAscending',
)
watch(
  () => props.category,
  (category) => {
    if (category !== 'all') categorySort.value = null
  },
)
const nextNameSortAction = computed(() =>
  nameSort.value === 'ascending'
    ? 'collection.sortNameDescending'
    : nameSort.value === 'descending'
      ? 'collection.sortNameDefault'
      : 'collection.sortNameAscending',
)
const sortCollator = computed(
  () =>
    new Intl.Collator(locale.value.startsWith('fi') ? 'fi-FI' : 'en-US', {
      sensitivity: 'base',
      numeric: true,
    }),
)
function toggleNameSort() {
  categorySort.value = null
  nameSort.value =
    nameSort.value === 'ascending'
      ? 'descending'
      : nameSort.value === 'descending'
        ? null
        : 'ascending'
}
function toggleCategorySort() {
  nameSort.value = null
  categorySort.value =
    categorySort.value === 'ascending'
      ? 'descending'
      : categorySort.value === 'descending'
        ? null
        : 'ascending'
}
const visibleItems = computed(() => {
  if (categoryChanging.value) return []
  const filtered = props.items.filter(
    (item) =>
      matchesFilters(item) &&
      searchableItemNames(item).some((name) =>
        name.normalize('NFC').toLowerCase().includes(normalizedQuery.value),
      ),
  )
  const sort = nameSort.value ?? categorySort.value
  if (!sort) return filtered
  const direction = sort === 'ascending' ? 1 : -1
  return filtered.sort(
    (first, second) =>
      direction *
      sortCollator.value.compare(
        categorySort.value ? categoryLabel(first.mediaType) : displayItemName(first, locale.value),
        categorySort.value
          ? categoryLabel(second.mediaType)
          : displayItemName(second, locale.value),
      ),
  )
})

function categoryLabel(mediaType: number) {
  const category = mediaCategories.find((category) => category.value === mediaType)
  return t(category?.label ?? 'collection.unknown')
}

function openCategory(mediaType: number) {
  const category = mediaCategories.find((category) => category.value === mediaType)
  if (category) emit('category-selected', category.id)
}

function categoryTooltip(mediaType: number) {
  const category = mediaCategories.find((category) => category.value === mediaType)
  return category ? t(`collection.showCategory.${category.id}`) : ''
}

function formatLabel(item: CollectionItem) {
  const format = boardGameFormats.find((format) => format.value === item.mediaFormat)
  return item.mediaType === 4 && format ? t(format.label) : null
}

// Keep leaving rows in normal table flow until their slide finishes.
const leavePositions = new WeakMap<Element, Map<HTMLElement, DOMRect>>()
const leaveListeners = new WeakMap<Element, (event: Event) => void>()
const rowMoves = new Map<HTMLElement, Animation>()

function cancelRowMoves() {
  for (const animation of rowMoves.values()) animation.cancel()
  rowMoves.clear()
}
watch(() => props.category, cancelRowMoves, { flush: 'sync' })
onBeforeUnmount(cancelRowMoves)

function prepareRowLeave(element: Element) {
  leavingRows.add(element)
  const row = element as HTMLTableRowElement
  const siblings = Array.from(row.parentElement?.children ?? []) as HTMLElement[]
  const capturePositions = () =>
    leavePositions.set(
      row,
      new Map(
        siblings
          .filter(
            (sibling) =>
              sibling !== row && sibling.isConnected && !sibling.hasAttribute('aria-hidden'),
          )
          .map((sibling) => [sibling, sibling.getBoundingClientRect()]),
      ),
    )
  capturePositions()
  // Refresh positions before Vue removes the row, including any concurrent moves.
  const listener = (event: Event) => {
    if (event.target === row) capturePositions()
  }
  leaveListeners.set(row, listener)
  row.addEventListener('transitionend', listener, true)
  row.inert = true
  row.setAttribute('aria-hidden', 'true')
}

function finishRowLeave(element: Element) {
  leavingRows.delete(element)
  void nextTick(finishCategoryChange)
  const row = element as HTMLTableRowElement
  const positions = leavePositions.get(row)
  const listener = leaveListeners.get(row)
  if (listener) row.removeEventListener('transitionend', listener, true)
  leaveListeners.delete(row)
  leavePositions.delete(row)
  row.inert = false
  row.removeAttribute('aria-hidden')
  // A cancelled filter transition leaves the row in place.
  if (
    categoryChanging.value ||
    row.isConnected ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
    return
  for (const [sibling, previous] of positions ?? []) {
    if (!sibling.isConnected || typeof sibling.animate !== 'function') continue
    rowMoves.get(sibling)?.cancel()
    const difference = previous.top - sibling.getBoundingClientRect().top
    if (Math.abs(difference) < 1) continue
    const animation = sibling.animate(
      [{ transform: `translateY(${difference}px)` }, { transform: 'translateY(0)' }],
      { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
    rowMoves.set(sibling, animation)
    animation.onfinish = () => {
      if (rowMoves.get(sibling) === animation) rowMoves.delete(sibling)
    }
  }
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
            ref="searchInput"
            v-model="searchQuery"
            type="search"
            autocomplete="off"
            :placeholder="t('collection.searchPlaceholder')"
          />
        </label>
        <ToolbarTooltip
          v-if="searchQuery"
          v-slot="{ describedby }"
          :text="t('collection.clearSearch')"
          class="collection-action-tooltip collection-search-clear-tooltip"
        >
          <button
            type="button"
            class="collection-search-clear"
            :aria-label="t('collection.clearSearch')"
            :aria-describedby="describedby"
            @click="clearSearch"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M6 18 18 6" />
            </svg>
          </button>
        </ToolbarTooltip>
      </div>
      <CollectionItemDialog :category="category" :items="items" @saved="itemChanged" />
      <TmdbImportDialog
        v-if="category === 'all' || category === 'movies' || category === 'tvSeries'"
        :category="category"
        @saved="itemChanged"
      />
      <IgdbImportDialog
        v-if="category === 'all' || category === 'videoGames'"
        @saved="itemChanged"
      />
      <BggImportDialog
        v-if="category === 'all' || category === 'boardGames'"
        @saved="itemChanged"
      />
    </div>
    <CollectionFilters
      :model-value="filters"
      :all-categories="category === 'all'"
      :media-type="filterMediaType"
      :active="filtersActive"
      @update:model-value="Object.assign(filters, $event)"
      @reset="resetFilters"
    />
    <p
      v-if="(normalizedQuery || filtersActive) && !categoryChanging && !loading && !error"
      aria-live="polite"
    >
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
      <table
        ref="tableElement"
        class="collection-table"
        :data-category="tableCategory"
        :aria-label="t('collection.title')"
      >
        <thead>
          <tr>
            <th scope="col" :aria-sort="nameSort ?? 'none'">
              <ToolbarTooltip
                v-slot="{ describedby }"
                :text="t(nextNameSortAction)"
                class="collection-sort-tooltip"
              >
                <button
                  type="button"
                  class="collection-sort-button"
                  :aria-label="t(nextNameSortAction)"
                  :aria-describedby="describedby"
                  @click="toggleNameSort"
                >
                  {{ t('itemForm.name') }}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path v-if="nameSort === 'ascending'" d="m6 15 6-6 6 6" />
                    <path v-else-if="nameSort === 'descending'" d="m6 9 6 6 6-6" />
                    <path v-else d="m8 9 4-4 4 4m-8 6 4 4 4-4" />
                  </svg>
                </button>
              </ToolbarTooltip>
            </th>
            <th
              v-if="tableCategory === 'all'"
              class="collection-category"
              scope="col"
              :aria-sort="categorySort ?? 'none'"
            >
              <ToolbarTooltip
                v-slot="{ describedby }"
                :text="t(nextCategorySortAction)"
                class="collection-sort-tooltip"
              >
                <button
                  type="button"
                  class="collection-sort-button collection-category-sort-button"
                  :aria-label="t(nextCategorySortAction)"
                  :aria-describedby="describedby"
                  @click="toggleCategorySort"
                >
                  {{ t('collection.category') }}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path v-if="categorySort === 'ascending'" d="m6 15 6-6 6 6" />
                    <path v-else-if="categorySort === 'descending'" d="m6 9 6 6 6-6" />
                    <path v-else d="m8 9 4-4 4 4m-8 6 4 4 4-4" />
                  </svg>
                </button>
              </ToolbarTooltip>
            </th>
            <th v-if="tableCategory === 'videoGames'" class="collection-copy-type" scope="col">
              {{ t('collection.copyType') }}
            </th>
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
          <tr
            v-for="item in visibleItems"
            :key="item.id"
            :data-item-id="item.id"
            class="collection-item-row"
          >
            <td>
              <div class="collection-name-content">
                <ToolbarTooltip
                  v-if="itemCoverUrl(item)"
                  v-slot="{ describedby }"
                  :text="t(itemSourceTooltip(item))"
                  :disabled="!itemSourceUrl(item)"
                  class="cover-tooltip collection-cover-tooltip"
                >
                  <component
                    :is="itemSourceUrl(item) ? 'a' : 'span'"
                    :aria-describedby="describedby"
                    :href="itemSourceUrl(item)"
                    :target="itemSourceUrl(item) ? '_blank' : undefined"
                    :rel="itemSourceUrl(item) ? 'noopener noreferrer' : undefined"
                    :aria-label="
                      itemSourceUrl(item)
                        ? t('sourceMetadata.openSource', {
                            name: displayItemName(item, locale),
                            source: itemSourceName(item),
                          })
                        : undefined
                    "
                    class="collection-cover-link"
                  >
                    <img
                      :src="itemCoverUrl(item)!"
                      alt=""
                      class="collection-poster"
                      width="48"
                      height="72"
                      loading="lazy"
                    />
                  </component>
                </ToolbarTooltip>
                <span v-else class="collection-cover-placeholder" aria-hidden="true" />
                <div class="collection-name-label">
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
                  <MediaFormatBadges
                    v-if="item.mediaType === 1 || item.mediaType === 2"
                    :item="item"
                  />
                  <div v-if="item.mediaType === 3" class="collection-platform-badges">
                    <GamePlatformBadge
                      v-for="version in itemVersions(item)"
                      :key="version.id"
                      :platform="version.platform"
                      :store="version.store"
                    />
                  </div>
                  <div v-if="item.mediaType === 4" class="bgg-item-badges">
                    <span
                      v-if="formatLabel(item)"
                      class="bgg-format-badge"
                      :data-game-format="item.mediaFormat"
                      :aria-label="`${t('itemForm.gameType')}: ${formatLabel(item)}`"
                      >{{ formatLabel(item) }}</span
                    >
                    <span
                      v-if="boardGameKind(item) !== undefined"
                      :class="
                        boardGameKind(item) === 2
                          ? 'bgg-expansion-badge'
                          : boardGameKind(item) === 1
                            ? 'bgg-base-game-badge'
                            : 'bgg-other-game-badge'
                      "
                      >{{
                        t(
                          boardGameKind(item) === 2
                            ? 'bgg.expansion'
                            : boardGameKind(item) === 1
                              ? 'bgg.baseGame'
                              : 'common.other',
                        )
                      }}</span
                    >
                    <template v-if="boardGameKind(item) === 2 || boardGameKind(item) === 99">
                      <component
                        :is="ownedRequiredGame(game) ? 'button' : game.bggId ? 'a' : 'span'"
                        v-for="game in requiredGameTags(item)"
                        :key="game.collectionItemId ?? game.bggId ?? game.name"
                        class="bgg-required-game-badge"
                        :type="ownedRequiredGame(game) ? 'button' : undefined"
                        :href="
                          ownedRequiredGame(game) || !game.bggId
                            ? undefined
                            : `https://boardgamegeek.com/boardgame/${game.bggId}`
                        "
                        :target="ownedRequiredGame(game) || !game.bggId ? undefined : '_blank'"
                        :rel="
                          ownedRequiredGame(game) || !game.bggId ? undefined : 'noopener noreferrer'
                        "
                        :aria-haspopup="ownedRequiredGame(game) ? 'dialog' : undefined"
                        :aria-label="
                          ownedRequiredGame(game)
                            ? t('collection.editItem', { name: game.name })
                            : game.bggId
                              ? t('sourceMetadata.openSource', { name: game.name, source: 'BGG' })
                              : undefined
                        "
                        @click="editRequiredGame(game, $event)"
                        >{{ game.name }}</component
                      >
                    </template>
                  </div>
                </div>
              </div>
            </td>
            <td v-if="tableCategory === 'all'" class="collection-category">
              <ToolbarTooltip
                v-if="mediaCategories.some((category) => category.value === item.mediaType)"
                v-slot="{ describedby }"
                :text="categoryTooltip(item.mediaType)"
                class="collection-action-tooltip collection-category-tooltip"
              >
                <button
                  type="button"
                  class="collection-category-button"
                  :aria-describedby="describedby"
                  @click="openCategory(item.mediaType)"
                >
                  {{ categoryLabel(item.mediaType) }}
                </button>
              </ToolbarTooltip>
              <span v-else>{{ categoryLabel(item.mediaType) }}</span>
            </td>
            <td v-if="tableCategory === 'videoGames'" class="collection-copy-type">
              {{
                [
                  ...new Set(
                    itemVersions(item).map((version) =>
                      t(
                        version.isPhysical === true
                          ? 'collection.physicalCopy'
                          : version.isPhysical === false
                            ? 'collection.digitalCopy'
                            : 'collection.unknownCopy',
                      ),
                    ),
                  ),
                ].join(' / ')
              }}
            </td>
            <td class="collection-actions-cell">
              <div class="collection-row-actions">
                <CollectionInfoDialog :item="item" />
                <CollectionItemDialog
                  :ref="(editor) => setEditor(item.id, editor)"
                  :item="item"
                  :items="items"
                  @saved="itemChanged"
                />
                <DeleteCollectionItemDialog :item="item" @deleted="itemChanged" />
              </div>
            </td>
          </tr>
          <tr v-if="!visibleItems.length && !categoryChanging && !loading && !error" key="empty">
            <td
              :colspan="tableCategory === 'all' || tableCategory === 'videoGames' ? 3 : 2"
              class="collection-empty"
            >
              {{
                t(
                  normalizedQuery || filtersActive
                    ? 'collection.noMatches'
                    : tableCategory === 'all'
                      ? 'collection.empty'
                      : 'collection.emptyCategory',
                )
              }}
            </td>
          </tr>
        </TransitionGroup>
      </table>
    </div>
    <CollectionItemDialog
      v-if="linkedItem"
      :key="linkedItem.id"
      ref="linkedEditor"
      :item="linkedItem"
      :items="items"
      hide-trigger
      @saved="itemChanged"
    />
    <TmdbAttribution v-if="visibleItems.some((item) => item.tmdbId)" />
    <IgdbAttribution v-if="visibleItems.some((item) => item.igdbId)" />
    <BggAttribution v-if="visibleItems.some((item) => item.bggId)" />
  </section>
</template>

<style src="../style/collection-table.css"></style>

<script setup lang="ts">
import { computed, nextTick, ref, type ComponentPublicInstance } from 'vue'
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
const emit = defineEmits<{ retry: []; changed: [] }>()
const searchQuery = ref('')
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

function categoryLabel(mediaType: number) {
  const category = mediaCategories.find((category) => category.value === mediaType)
  return t(category?.label ?? 'collection.unknown')
}

function formatLabel(item: CollectionItem) {
  const format = boardGameFormats.find((format) => format.value === item.mediaFormat)
  return item.mediaType === 4 && format ? t(format.label) : '—'
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
      <table class="collection-table" :data-category="category" :aria-label="t('collection.title')">
        <thead>
          <tr>
            <th scope="col">{{ t('itemForm.name') }}</th>
            <th v-if="category === 'all'" class="collection-category" scope="col">
              {{ t('collection.category') }}
            </th>
            <th
              v-if="category === 'all' || category === 'boardGames'"
              class="collection-format"
              scope="col"
            >
              {{ t('itemForm.mediaFormat') }}
            </th>
            <th v-if="category === 'videoGames'" class="collection-copy-type" scope="col">
              {{ t('collection.copyType') }}
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
                  <GamePlatformBadge
                    v-if="item.mediaType === 3"
                    :platform="item.platform"
                    :store="item.store"
                  />
                  <div v-if="boardGameKind(item) !== undefined" class="bgg-item-badges">
                    <span
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
            <td v-if="category === 'all'" class="collection-category">
              {{ categoryLabel(item.mediaType) }}
            </td>
            <td v-if="category === 'all' || category === 'boardGames'" class="collection-format">
              {{ formatLabel(item) }}
            </td>
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
                  :items="items"
                  @saved="itemChanged"
                />
                <DeleteCollectionItemDialog :item="item" @deleted="itemChanged" />
              </div>
            </td>
          </tr>
          <tr v-if="!visibleItems.length && !loading && !error" key="empty">
            <td
              :colspan="
                category === 'all' ? 5 : category === 'movies' || category === 'tvSeries' ? 3 : 4
              "
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

<script setup lang="ts">
import SelectControl from './SelectControl.vue'
import { Dialog } from '@ark-ui/vue/dialog'
import '../style/collection-item-dialog.css'
import '../style/media-collection.css'
import '../style/details-fade.css'
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  type CollectionCategory,
  mediaFormats,
  boardGameFormats,
  otherOption,
  gameStoreOptions,
  pcPlatform,
} from '../models/collection'
import { posterUrl, type TmdbResult } from '../models/tmdb'
import { snackbarElements, useSnackbar } from '../composables/useSnackbar'
import TmdbAttribution from './TmdbAttribution.vue'
import IgdbAttribution from './IgdbAttribution.vue'
import TvSeasonOwnership from './TvSeasonOwnership.vue'
import type { OwnedSeason } from '../models/collection'
import { igdbCoverUrl, igdbPlatformOptions, type IgdbResult } from '../models/igdb'
import { bggImageUrl, type BggResult } from '../models/bgg'
import BggAttribution from './BggAttribution.vue'
import { displayItemName } from '../models/itemNames'
import { itemNoticeKey } from '../models/itemNotices'
import BggExpansionDetails from './BggExpansionDetails.vue'
import CollectionDragHandle from './CollectionDragHandle.vue'
import FadingCover from './FadingCover.vue'
import { useCollectionReorder } from '../composables/useCollectionReorder'
type CatalogResult = TmdbResult | IgdbResult | BggResult
type CatalogSearchPage = {
  page: number
  totalPages?: number
  hasNextPage?: boolean
  results: CatalogResult[]
}

const props = withDefaults(
  defineProps<{
    category: CollectionCategory
    source?: 'tmdb' | 'igdb' | 'bgg'
    memberPicker?: boolean
    existingTmdbIds?: number[]
    disabled?: boolean
  }>(),
  { source: 'tmdb' },
)
const isIgdb = computed(() => props.source === 'igdb')
const isBgg = computed(() => props.source === 'bgg')
const emit = defineEmits<{ saved: []; 'member-selected': [member: TmdbResult] }>()
const importFormId = useId()
const { t, locale } = useI18n({ useScope: 'global' })
function ct(key: string, params: Record<string, string | number> = {}) {
  return t(`${props.source}.${key}`, params)
}
function resultId(result: CatalogResult) {
  return 'bggId' in result ? result.bggId : 'igdbId' in result ? result.igdbId : result.tmdbId
}
function coverUrl(result: CatalogResult) {
  return 'bggId' in result
    ? bggImageUrl(result.imageUrl)
    : 'igdbId' in result
      ? igdbCoverUrl(result.coverImageId)
      : posterUrl(result.posterPath)
}
function sourceUrl(result: CatalogResult) {
  if ('bggId' in result) return `https://boardgamegeek.com/boardgame/${result.bggId}`
  return 'igdbId' in result
    ? result.sourceUrl?.startsWith('https://www.igdb.com/games/')
      ? result.sourceUrl
      : null
    : `https://www.themoviedb.org/${mediaType.value === 1 ? 'movie' : 'tv'}/${result.tmdbId}`
}
const { show, dismissMessage } = useSnackbar()
const open = ref(false)
const mediaType = ref(1)
const language = computed(() => (locale.value === 'fi' ? 'fi-FI' : 'en-US'))
const query = ref('')
const results = ref<CatalogResult[]>([])
const selected = ref<CatalogResult | null>(null)
const isCollection = ref(false)
const collectionSelections = ref<TmdbResult[]>([])
const inspectedTmdbId = ref<number | null>(null)
const loadedMembers = new Set<number>()
const pendingMemberId = ref<number | null>(null)
const viewedResult = computed(() =>
  isCollection.value
    ? (collectionSelections.value.find((entry) => entry.tmdbId === inspectedTmdbId.value) ??
      selected.value)
    : selected.value,
)
const viewedMemberId = computed(() =>
  viewedResult.value && 'tmdbId' in viewedResult.value ? viewedResult.value.tmdbId : null,
)
const {
  list: collectionList,
  draggedIndex,
  dropIndex,
  start: startDrag,
  over: dragOver,
  drop: dropEntry,
  end: endDrag,
  move: moveEntry,
} = useCollectionReorder(collectionSelections, updateCollectionPreview)
const selectedTmdbIds = computed(
  () => new Set(collectionSelections.value.map((entry) => entry.tmdbId)),
)
function collectionContains(result: CatalogResult) {
  return (
    'tmdbId' in result &&
    (props.memberPicker
      ? props.existingTmdbIds?.includes(result.tmdbId) === true
      : isCollection.value && selectedTmdbIds.value.has(result.tmdbId))
  )
}
const searched = ref(false)
const searching = ref(false)
const saving = ref(false)
const transitioning = ref(false)
const pendingSave = ref(false)
let savedName = ''
let versionAdded = false
let savedMediaType = 1
let savedId: number | undefined
const page = ref(1)
const totalPages = ref(0)
const hasNextPage = ref(false)
const platform = ref<number | ''>('')
const availablePlatforms = computed(() =>
  igdbPlatformOptions(
    selected.value && 'igdbId' in selected.value ? selected.value.platforms : null,
  ),
)
watch(availablePlatforms, (options) => {
  if (platform.value !== '' && !options.some((option) => option.value === platform.value))
    platform.value = ''
})
const store = ref<number | ''>('')
const availableStores = computed(() => gameStoreOptions(platform.value))
watch(availableStores, (stores) => {
  if (store.value !== '' && !stores.some((option) => option.value === store.value)) store.value = ''
})
const isPhysical = ref(false)
watch(isPhysical, (physical) => {
  if (physical) store.value = ''
})
const isCompleteBox = ref(false)
const ownedSeasons = ref<OwnedSeason[]>([])
const loadingDetails = ref(false)
const name = ref('')
const suggestedName = ref('')
const format = ref(1)
const info = ref('')
const error = ref('')
const errorParams = ref<Record<string, string>>({})
let request: AbortController | undefined
let searchVersion = 0

function clearSearch() {
  loadingDetails.value = false
  pendingMemberId.value = null
  searchVersion++
  request?.abort()
  searching.value = false
  searched.value = false
  results.value = []
  selected.value = isCollection.value ? (collectionSelections.value[0] ?? null) : null
  page.value = 1
  totalPages.value = 0
  hasNextPage.value = false
  dismissMessage(error.value)
  error.value = ''
}

function prepare() {
  inspectedTmdbId.value = null
  loadedMembers.clear()
  isCollection.value = false
  collectionSelections.value = []
  name.value = ''
  clearSearch()
  mediaType.value = isBgg.value ? 4 : isIgdb.value ? 3 : props.category === 'tvSeries' ? 2 : 1
  platform.value = ''
  store.value = ''
  isPhysical.value = false
  query.value = ''
  format.value = isBgg.value ? 4 : 1
  info.value = ''
}

watch([mediaType, language, query], clearSearch)
watch(mediaType, () => {
  if (mediaType.value !== 1) isCollection.value = false
  inspectedTmdbId.value = null
  loadedMembers.clear()
  collectionSelections.value = []
  selected.value = null
  name.value = ''
})
watch(isCollection, () => {
  inspectedTmdbId.value = null
  loadedMembers.clear()
  collectionSelections.value = []
  selected.value = null
  name.value = ''
})
watch(open, (value) => {
  if (!value) {
    request?.abort()
    searchVersion++
    searching.value = false
  }
})
onBeforeUnmount(() => request?.abort())

function reportError(key: string, params: Record<string, string> = {}) {
  error.value = key
  errorParams.value = params
  show(key, 'error', params)
}

async function responseError(response: Response) {
  const problem = await response.json().catch(() => ({}))
  if (problem.code === 'collection_duplicate') {
    reportError('itemForm.duplicate', {
      name: typeof problem.name === 'string' ? problem.name : name.value.trim(),
    })
    return
  }
  const errors: Record<string, string> = {
    bgg_not_configured: 'bgg.notConfigured',
    bgg_credentials: 'bgg.credentialsError',
    bgg_rate_limited: 'bgg.rateLimited',
    bgg_not_found: 'bgg.notFound',
    bgg_pending: 'bgg.pending',
    igdb_not_configured: 'igdb.notConfigured',
    igdb_credentials: 'igdb.credentialsError',
    igdb_rate_limited: 'igdb.rateLimited',
    igdb_not_found: 'igdb.notFound',
    tmdb_not_configured: 'tmdb.notConfigured',
    tmdb_credentials: 'tmdb.credentialsError',
    tmdb_rate_limited: 'tmdb.rateLimited',
    tmdb_not_found: 'tmdb.notFound',
  }
  reportError(
    errors[problem.code] ??
      (response.status === 400 ? 'itemForm.validationError' : `${props.source}.requestError`),
  )
}

async function search(targetPage = 1) {
  if (!query.value.trim() || saving.value) return
  request?.abort()
  const version = ++searchVersion
  const controller = new AbortController()
  request = controller
  searching.value = true
  selected.value = isCollection.value ? (collectionSelections.value[0] ?? null) : null
  results.value = []
  searched.value = false
  dismissMessage(error.value)
  error.value = ''
  try {
    const parameters = new URLSearchParams({
      query: query.value.trim(),
      ...(props.source === 'tmdb'
        ? { mediaType: String(mediaType.value), language: language.value }
        : {}),
      page: String(targetPage),
    })
    const response = await fetch(`/api/${props.source}/search?${parameters}`, {
      signal: controller.signal,
    })
    if (version !== searchVersion) return
    if (!response.ok) {
      await responseError(response)
      return
    }
    const data: CatalogSearchPage = await response.json()
    if (version !== searchVersion) return
    results.value = data.results
    page.value = data.page
    totalPages.value = data.totalPages ?? 0
    hasNextPage.value = data.hasNextPage ?? false
    searched.value = true
  } catch {
    if (!controller.signal.aborted) reportError(`${props.source}.requestError`)
  } finally {
    if (version === searchVersion) searching.value = false
  }
}

async function select(result: CatalogResult) {
  if (props.memberPicker && collectionContains(result)) return
  if (isCollection.value && 'tmdbId' in result) {
    const selectedIndex = collectionSelections.value.findIndex(
      (entry) => entry.tmdbId === result.tmdbId,
    )
    if (selectedIndex !== -1) {
      removeCollectionEntry(selectedIndex)
      return
    }
    if (collectionSelections.value.length >= 100) {
      reportError('mediaCollection.tooMany')
      return
    }
    collectionSelections.value = [...collectionSelections.value, result]
    selected.value = collectionSelections.value[0] ?? null
    await inspectCollectionEntry(result)
    return
  }
  selected.value = result
  name.value = result.title
  suggestedName.value = result.title
  info.value = ''
  isCompleteBox.value = false
  ownedSeasons.value = []
  await loadDetails(result)
}

async function inspectCollectionEntry(entry: TmdbResult) {
  inspectedTmdbId.value = entry.tmdbId
  if (pendingMemberId.value !== entry.tmdbId) await loadDetails(entry, true)
}

async function loadDetails(result: CatalogResult, asMember = false) {
  if (asMember && 'tmdbId' in result && loadedMembers.has(result.tmdbId)) return
  if (
    !('bggId' in result) &&
    (!('tmdbId' in result) ||
      (!props.memberPicker && mediaType.value !== 2 && result.overview.trim()))
  )
    return
  request?.abort()
  const controller = new AbortController()
  request = controller
  const version = ++searchVersion
  loadingDetails.value = true
  pendingMemberId.value = asMember && 'tmdbId' in result ? result.tmdbId : null
  try {
    const parameters = new URLSearchParams(
      'bggId' in result
        ? { bggId: String(result.bggId) }
        : {
            tmdbId: String(result.tmdbId),
            mediaType: String(mediaType.value),
            language: language.value,
          },
    )
    const response = await fetch(`/api/${props.source}/details?${parameters}`, {
      signal: controller.signal,
    })
    if (version !== searchVersion || !selected.value) return
    if (!response.ok) {
      await responseError(response)
      return
    }
    let details: TmdbResult | BggResult = await response.json()
    if ('tmdbId' in details && !details.overview.trim() && language.value !== 'en-US') {
      try {
        const englishParameters = new URLSearchParams({
          tmdbId: String(details.tmdbId),
          mediaType: String(mediaType.value),
          language: 'en-US',
        })
        const englishResponse = await fetch(`/api/tmdb/details?${englishParameters}`, {
          signal: controller.signal,
        })
        if (englishResponse.ok) {
          const english: TmdbResult = await englishResponse.json()
          details = { ...details, overview: english.overview.trim() }
        }
      } catch {
        // Missing secondary-language details must not prevent adding the item.
      }
    }
    if (version === searchVersion && selected.value) {
      if (asMember && isCollection.value && 'tmdbId' in details) {
        const member = details
        loadedMembers.add(member.tmdbId)
        collectionSelections.value = collectionSelections.value.map((entry) =>
          entry.tmdbId === member.tmdbId ? member : entry,
        )
        selected.value = collectionSelections.value[0] ?? null
      } else selected.value = details
    }
  } catch {
    if (!controller.signal.aborted) reportError(`${props.source}.requestError`)
  } finally {
    if (version === searchVersion) {
      loadingDetails.value = false
      pendingMemberId.value = null
    }
  }
}

function removeCollectionEntry(index: number) {
  collectionSelections.value = collectionSelections.value.filter((_, current) => current !== index)
  updateCollectionPreview()
}

function updateCollectionPreview() {
  if (
    loadingDetails.value &&
    !collectionSelections.value.some((entry) => entry.tmdbId === pendingMemberId.value)
  ) {
    request?.abort()
    searchVersion++
    loadingDetails.value = false
    pendingMemberId.value = null
  }
  selected.value = collectionSelections.value[0] ?? null
  if (!collectionSelections.value.some((entry) => entry.tmdbId === inspectedTmdbId.value))
    inspectedTmdbId.value = collectionSelections.value[0]?.tmdbId ?? null
  const inspected = collectionSelections.value.find(
    (entry) => entry.tmdbId === inspectedTmdbId.value,
  )
  if (inspected && pendingMemberId.value !== inspected.tmdbId) void loadDetails(inspected, true)
}

async function save() {
  if (!selected.value || saving.value || loadingDetails.value) return
  if (props.memberPicker && 'tmdbId' in selected.value) {
    emit('member-selected', selected.value)
    open.value = false
    return
  }
  if (!name.value.trim()) {
    reportError('itemForm.nameRequired')
    return
  }
  if (isIgdb.value && platform.value === '') {
    reportError('itemForm.platformRequired')
    return
  }
  if (isIgdb.value && platform.value === pcPlatform && !isPhysical.value && store.value === '') {
    reportError('itemForm.storeRequired')
    return
  }
  saving.value = true
  const requestedName = name.value.trim()
  const requestedMediaType = mediaType.value
  dismissMessage(error.value)
  error.value = ''
  try {
    const response = await fetch(`/api/${props.source}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...('bggId' in selected.value
          ? { bggId: selected.value.bggId }
          : 'igdbId' in selected.value
            ? { igdbId: selected.value.igdbId }
            : {
                tmdbId: selected.value.tmdbId,
                language: selected.value.language,
                useLocalizedName:
                  !isCollection.value && name.value.trim() === suggestedName.value.trim(),
                ...(isCollection.value
                  ? { tmdbIds: collectionSelections.value.map((entry) => entry.tmdbId) }
                  : {}),
              }),
        item: {
          name: requestedName,
          mediaType: mediaType.value,
          mediaFormat: isIgdb.value ? null : format.value,
          ...(isIgdb.value
            ? {
                platform: platform.value,
                ...(!isPhysical.value && store.value !== '' ? { store: store.value } : {}),
              }
            : {}),
          info: info.value,
          ...(isCollection.value && props.source === 'tmdb' ? { isCollection: true } : {}),
          ...(isIgdb.value ? { isPhysical: isPhysical.value } : {}),
          ...(mediaType.value === 2 && !isCollection.value
            ? { isCompleteBox: isCompleteBox.value, ownedSeasons: ownedSeasons.value }
            : {}),
        },
      }),
    })
    if (!response.ok) {
      await responseError(response)
      return
    }
    const saved = await response.json().catch(() => null)
    savedId = Number.isSafeInteger(saved?.id) && saved.id > 0 ? saved.id : undefined
    versionAdded = saved?.versionAdded === true
    savedName = versionAdded && saved?.name ? displayItemName(saved, locale.value) : requestedName
    savedMediaType = requestedMediaType
    pendingSave.value = true
    open.value = false
  } catch {
    reportError('itemForm.saveError')
  } finally {
    saving.value = false
  }
}

function finishClose() {
  transitioning.value = false
  if (!pendingSave.value) return
  pendingSave.value = false
  show(
    versionAdded ? 'itemForm.versionAdded' : itemNoticeKey('saved', savedMediaType),
    'success',
    { name: savedName },
    savedId,
  )
  emit('saved')
}
</script>

<template>
  <Dialog.Root
    v-model:open="open"
    :persistent-elements="snackbarElements()"
    :close-on-escape="!saving"
    :close-on-interact-outside="!saving"
    lazy-mount
  >
    <Dialog.Trigger
      class="positive-button"
      :class="`${source}-add-button`"
      :disabled="
        disabled ||
        pendingSave ||
        transitioning ||
        (memberPicker && (existingTmdbIds?.length ?? 0) >= 100)
      "
      @click="prepare"
      >{{ memberPicker ? t('mediaCollection.addEntry') : ct('add') }}</Dialog.Trigger
    >
    <Teleport to="body">
      <Transition
        name="item-modal"
        @before-enter="transitioning = true"
        @after-enter="transitioning = false"
        @enter-cancelled="transitioning = false"
        @before-leave="transitioning = true"
        @after-leave="finishClose"
        @leave-cancelled="transitioning = false"
      >
        <div v-show="open" class="item-dialog-layer" :inert="!open" :aria-hidden="!open">
          <Dialog.Backdrop class="item-dialog-backdrop" :hidden="false" />
          <Dialog.Positioner class="item-dialog-positioner">
            <Dialog.Content class="item-dialog tmdb-dialog" :hidden="false">
              <Dialog.Title class="item-dialog-title">{{ ct('title') }}</Dialog.Title>
              <Dialog.Description class="item-dialog-description">{{
                ct('description')
              }}</Dialog.Description>
              <form
                class="item-form tmdb-search-form"
                autocomplete="off"
                @submit.prevent="search()"
              >
                <fieldset class="item-form-fields" :disabled="saving || loadingDetails">
                  <label v-if="source === 'tmdb' && category === 'all'" class="item-form-field">
                    <span>{{ t('itemForm.category') }}</span>
                    <SelectControl>
                      <select v-model.number="mediaType" name="TmdbMediaType">
                        <option :value="1">{{ t('sidebar.movies') }}</option>
                        <option :value="2">{{ t('sidebar.tvSeries') }}</option>
                      </select>
                    </SelectControl>
                  </label>
                  <p v-else class="tmdb-category">{{ t(`sidebar.${category}`) }}</p>
                  <label
                    v-if="source === 'tmdb' && mediaType === 1 && !memberPicker"
                    class="item-form-checkbox"
                  >
                    <input v-model="isCollection" name="IsCollection" type="checkbox" />
                    <span>{{ t('mediaCollection.label') }}</span>
                  </label>
                  <p v-if="isCollection">{{ t('mediaCollection.searchHint') }}</p>
                  <label class="item-form-field"
                    ><span>{{ ct('searchLabel') }}</span
                    ><input
                      v-model="query"
                      :name="isBgg ? 'BggQuery' : isIgdb ? 'IgdbQuery' : 'TmdbQuery'"
                      type="search"
                      required
                      maxlength="200"
                      :placeholder="ct('searchPlaceholder')"
                  /></label>
                  <button
                    type="submit"
                    class="tmdb-search-button"
                    :disabled="searching || !query.trim()"
                  >
                    {{ ct(searching ? 'searching' : 'search') }}
                  </button>
                </fieldset>
              </form>
              <p v-if="searched && !results.length" role="status">{{ ct('noResults') }}</p>
              <ul
                v-if="results.length && (!selected || isCollection)"
                class="tmdb-results"
                :aria-label="ct('results')"
              >
                <li v-for="result in results" :key="resultId(result)">
                  <button
                    type="button"
                    class="tmdb-result"
                    :disabled="memberPicker && collectionContains(result)"
                    :data-selected="collectionContains(result) || undefined"
                    :aria-pressed="isCollection ? collectionContains(result) : undefined"
                    @click="select(result)"
                  >
                    <img
                      v-if="coverUrl(result)"
                      :src="coverUrl(result)!"
                      alt=""
                      class="tmdb-result-poster"
                      loading="lazy"
                      width="56"
                      height="84"
                    />
                    <span v-else class="tmdb-result-poster tmdb-no-poster">{{
                      ct('noPoster')
                    }}</span>
                    <span
                      ><strong>{{ result.title }}</strong
                      ><span v-if="result.releaseDate" class="tmdb-result-year">{{
                        result.releaseDate.slice(0, 4)
                      }}</span
                      ><span
                        v-if="'yearPublished' in result && result.yearPublished"
                        class="tmdb-result-year"
                        >{{ result.yearPublished }}</span
                      ><span
                        v-if="'originalTitle' in result && result.originalTitle !== result.title"
                        class="tmdb-original-title"
                        >{{ result.originalTitle }}</span
                      ></span
                    >
                    <span class="tmdb-select-label">
                      <svg
                        v-if="collectionContains(result)"
                        class="tmdb-selection-check"
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="m5 12 4 4L19 6" />
                      </svg>
                      {{
                        collectionContains(result) ? t('mediaCollection.selected') : ct('select')
                      }}
                    </span>
                  </button>
                </li>
              </ul>
              <nav
                v-if="
                  (totalPages > 1 || hasNextPage || page > 1) &&
                  (!selected || isCollection) &&
                  !searching
                "
                class="tmdb-pagination"
                :aria-label="ct('pages')"
              >
                <button type="button" :disabled="page <= 1 || saving" @click="search(page - 1)">
                  {{ ct('previous') }}
                </button>
                <span>{{
                  isIgdb || isBgg ? ct('page', { page }) : ct('page', { page, total: totalPages })
                }}</span>
                <button
                  type="button"
                  :disabled="(isIgdb || isBgg ? !hasNextPage : page >= totalPages) || saving"
                  @click="search(page + 1)"
                >
                  {{ ct('next') }}
                </button>
              </nav>
              <form
                v-if="selected"
                :id="importFormId"
                class="item-form tmdb-import-form"
                autocomplete="off"
                :aria-busy="saving"
                @submit.prevent="save"
              >
                <fieldset class="item-form-fields" :disabled="saving || loadingDetails">
                  <div class="tmdb-selected">
                    <FadingCover
                      v-if="coverUrl(selected)"
                      :src="coverUrl(selected)!"
                      alt=""
                      :width="92"
                      :height="138"
                    />
                    <Transition name="details-fade" mode="out-in">
                      <div
                        v-if="viewedResult"
                        :key="isCollection ? (viewedMemberId ?? 'single') : 'single'"
                      >
                        <strong>{{ viewedResult.title }}</strong>
                        <p v-if="viewedResult.releaseDate">{{ viewedResult.releaseDate }}</p>
                        <p v-if="'yearPublished' in viewedResult && viewedResult.yearPublished">
                          {{ viewedResult.yearPublished }}
                        </p>
                        <p>{{ viewedResult.overview.trim() || ct('noOverview') }}</p>
                        <template
                          v-if="isCollection && 'tmdbId' in viewedResult && mediaType === 2"
                        >
                          <p v-if="viewedResult.numberOfSeasons != null">
                            {{
                              t('tvOwnership.totalSeasons', { count: viewedResult.numberOfSeasons })
                            }}
                          </p>
                          <p v-if="viewedResult.numberOfEpisodes != null">
                            {{
                              t('tvOwnership.totalEpisodes', {
                                count: viewedResult.numberOfEpisodes,
                              })
                            }}
                          </p>
                        </template>
                        <template v-if="'bggId' in viewedResult && !loadingDetails">
                          <BggExpansionDetails
                            :is-expansion="viewedResult.isExpansion"
                            :required-games="viewedResult.requiredGames"
                          />
                          <p v-if="viewedResult.minPlayers || viewedResult.maxPlayers">
                            {{ ct('players') }}: {{ viewedResult.minPlayers ?? '–' }}–{{
                              viewedResult.maxPlayers ?? '–'
                            }}
                          </p>
                          <p v-if="viewedResult.playingTime">
                            {{ ct('playingTime') }}:
                            {{ ct('minutes', { count: viewedResult.playingTime }) }}
                          </p>
                          <p v-if="viewedResult.minAge">
                            {{ ct('minAge') }}: {{ viewedResult.minAge }}+
                          </p>
                        </template>
                        <a
                          v-if="sourceUrl(viewedResult)"
                          :href="sourceUrl(viewedResult)!"
                          target="_blank"
                          rel="noopener noreferrer"
                          >{{ ct('viewSource') }}</a
                        >
                      </div>
                    </Transition>
                  </div>
                  <button v-if="memberPicker" type="button" @click="selected = null">
                    {{ ct('changeSelection') }}
                  </button>
                  <template v-if="!memberPicker">
                    <p v-if="isCollection && collectionSelections.length > 1">
                      {{ t('mediaCollection.reorderHint') }}
                    </p>
                    <ol v-if="isCollection" ref="collectionList" class="media-collection-selection">
                      <TransitionGroup name="collection-content">
                        <li
                          v-for="(entry, index) in collectionSelections"
                          :key="entry.tmdbId"
                          :data-collection-index="index"
                          :class="{
                            'collection-entry-dragging': draggedIndex === index,
                            'collection-entry-inspected': entry.tmdbId === viewedMemberId,
                            'collection-entry-drop-target':
                              dropIndex === index && draggedIndex !== index,
                          }"
                          @dragover="dragOver(index, $event)"
                          @drop="dropEntry(index, $event)"
                        >
                          <CollectionDragHandle
                            :index="index"
                            :count="collectionSelections.length"
                            @start="startDrag(index, $event)"
                            @end="endDrag"
                            @move="moveEntry(index, $event)"
                          />
                          <button
                            type="button"
                            class="media-collection-entry-title collection-member-title"
                            :aria-pressed="entry.tmdbId === viewedMemberId"
                            :aria-label="t('mediaCollection.inspectItem', { name: entry.title })"
                            @click="inspectCollectionEntry(entry)"
                          >
                            {{ entry.title }}
                          </button>
                          <button
                            type="button"
                            class="media-collection-remove"
                            @click="removeCollectionEntry(index)"
                          >
                            {{ t('mediaCollection.remove') }}
                          </button>
                        </li>
                      </TransitionGroup>
                    </ol>
                    <p v-if="isCollection">{{ t('mediaCollection.sharedFormat') }}</p>
                    <button v-if="!isCollection" type="button" @click="selected = null">
                      {{ ct('changeSelection') }}
                    </button>
                    <label class="item-form-field"
                      ><span>{{ t('itemForm.name') }}</span
                      ><input v-model="name" name="Name" required maxlength="300"
                    /></label>
                    <label v-if="!isIgdb" class="item-form-field"
                      ><span>{{ t('itemForm.mediaFormat') }}</span
                      ><SelectControl>
                        <select v-model.number="format" name="MediaFormat">
                          <option
                            v-for="option in isBgg ? boardGameFormats : mediaFormats"
                            :key="option.value"
                            :value="option.value"
                          >
                            {{
                              isBgg
                                ? t(option.label)
                                : option.value === otherOption
                                  ? t('common.other')
                                  : option.label
                            }}
                          </option>
                        </select>
                      </SelectControl></label
                    >
                    <template v-if="isIgdb">
                      <p v-if="'platforms' in selected && selected.platforms.length">
                        {{ ct('availablePlatforms') }}: {{ selected.platforms.join(', ') }}
                      </p>
                      <label class="item-form-field"
                        ><span>{{ t('itemForm.platform') }}</span
                        ><SelectControl>
                          <select v-model.number="platform" name="Platform" required>
                            <option value="" disabled>{{ t('itemForm.choosePlatform') }}</option>
                            <option
                              v-for="option in availablePlatforms"
                              :key="option.value"
                              :value="option.value"
                            >
                              {{ option.value === otherOption ? t('common.other') : option.label }}
                            </option>
                          </select>
                        </SelectControl></label
                      >
                      <label class="item-form-field"
                        ><span>{{ t('itemForm.store') }}</span
                        ><SelectControl>
                          <select
                            v-model.number="store"
                            name="Store"
                            :disabled="isPhysical || platform === ''"
                            :required="platform === pcPlatform && !isPhysical"
                          >
                            <option value="">
                              {{
                                t(
                                  platform === pcPlatform && !isPhysical
                                    ? 'itemForm.chooseStore'
                                    : 'itemForm.chooseStoreOptional',
                                )
                              }}
                            </option>
                            <option
                              v-for="option in availableStores"
                              :key="option.value"
                              :value="option.value"
                            >
                              {{ option.value === otherOption ? t('common.other') : option.label }}
                            </option>
                          </select>
                        </SelectControl></label
                      >
                      <label class="item-form-checkbox">
                        <input v-model="isPhysical" type="checkbox" name="IsPhysical" />
                        <span>{{ t('itemForm.isPhysical') }}</span>
                      </label>
                    </template>
                    <p v-if="loadingDetails" role="status">
                      {{ isBgg ? ct('loadingDetails') : t('tvOwnership.loading') }}
                    </p>
                    <TvSeasonOwnership
                      v-if="
                        !isIgdb &&
                        !isCollection &&
                        mediaType === 2 &&
                        'tmdbId' in selected &&
                        !loadingDetails
                      "
                      :key="selected.tmdbId"
                      v-model:complete-box="isCompleteBox"
                      v-model:owned-seasons="ownedSeasons"
                      :default-format="format"
                      :season-count="selected.numberOfSeasons"
                      :episode-count="selected.numberOfEpisodes"
                      :seasons="selected.seasons"
                    />
                    <label class="item-form-field"
                      ><span>{{ t('itemForm.info') }}</span
                      ><textarea v-model="info" name="Info" rows="3" maxlength="10000" />
                    </label>
                  </template>
                </fieldset>
              </form>
              <p v-if="error" role="alert" class="item-form-error">{{ t(error, errorParams) }}</p>
              <div class="item-dialog-actions">
                <Dialog.CloseTrigger
                  class="item-dialog-cancel"
                  :disabled="saving || loadingDetails"
                  >{{ t('itemForm.close') }}</Dialog.CloseTrigger
                >
                <button
                  v-if="selected"
                  class="tmdb-save-button item-dialog-primary"
                  type="submit"
                  :form="importFormId"
                  :disabled="saving || loadingDetails"
                >
                  {{ t(saving ? 'itemForm.saving' : 'itemForm.add') }}
                </button>
              </div>
              <BggAttribution v-if="isBgg" /><IgdbAttribution v-else-if="isIgdb" /><TmdbAttribution
                v-else
              />
            </Dialog.Content>
          </Dialog.Positioner>
        </div>
      </Transition>
    </Teleport>
  </Dialog.Root>
</template>

<style src="../style/tmdb.css"></style>

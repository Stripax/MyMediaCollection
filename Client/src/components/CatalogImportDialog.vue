<script setup lang="ts">
import { Dialog } from '@ark-ui/vue/dialog'
import '../style/collection-item-dialog.css'
import '../style/media-collection.css'
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  type CollectionCategory,
  mediaFormats,
  boardGameFormats,
  otherOption,
  gamePlatforms,
  gameStores,
  pcPlatform,
} from '../models/collection'
import { posterUrl, type TmdbResult } from '../models/tmdb'
import { snackbarElements, useSnackbar } from '../composables/useSnackbar'
import TmdbAttribution from './TmdbAttribution.vue'
import IgdbAttribution from './IgdbAttribution.vue'
import TvSeasonOwnership from './TvSeasonOwnership.vue'
import type { OwnedSeason } from '../models/collection'
import { igdbCoverUrl, type IgdbResult } from '../models/igdb'
import { bggImageUrl, type BggResult } from '../models/bgg'
import BggAttribution from './BggAttribution.vue'
import { itemNoticeKey } from '../models/itemNotices'
import BggExpansionDetails from './BggExpansionDetails.vue'
type CatalogResult = TmdbResult | IgdbResult | BggResult
type CatalogSearchPage = {
  page: number
  totalPages?: number
  hasNextPage?: boolean
  results: CatalogResult[]
}

const props = withDefaults(
  defineProps<{ category: CollectionCategory; source?: 'tmdb' | 'igdb' | 'bgg' }>(),
  { source: 'tmdb' },
)
const isIgdb = computed(() => props.source === 'igdb')
const isBgg = computed(() => props.source === 'bgg')
const emit = defineEmits<{ saved: [] }>()
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
const searched = ref(false)
const searching = ref(false)
const saving = ref(false)
const transitioning = ref(false)
const pendingSave = ref(false)
let savedName = ''
let savedMediaType = 1
const page = ref(1)
const totalPages = ref(0)
const hasNextPage = ref(false)
const platform = ref<number | ''>('')
const store = ref<number | ''>('')
const isPhysical = ref(false)
const isCompleteBox = ref(false)
const ownedSeasons = ref<OwnedSeason[]>([])
const loadingDetails = ref(false)
const name = ref('')
const suggestedName = ref('')
const format = ref(1)
const info = ref('')
const error = ref('')
let request: AbortController | undefined
let searchVersion = 0

function clearSearch() {
  loadingDetails.value = false
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
  collectionSelections.value = []
  selected.value = null
  name.value = ''
})
watch(isCollection, () => {
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

function reportError(key: string) {
  error.value = key
  show(key, 'error')
}

async function responseError(response: Response) {
  const problem = await response.json().catch(() => ({}))
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
  if (isCollection.value && 'tmdbId' in result) {
    if (collectionSelections.value.some((entry) => entry.tmdbId === result.tmdbId)) return
    if (collectionSelections.value.length >= 100) {
      reportError('mediaCollection.tooMany')
      return
    }
    collectionSelections.value = [...collectionSelections.value, result]
    selected.value = collectionSelections.value[0] ?? null
    return
  }
  selected.value = result
  name.value = result.title
  suggestedName.value = result.title
  info.value = ''
  isCompleteBox.value = false
  ownedSeasons.value = []
  if (!('bggId' in result) && (mediaType.value !== 2 || !('tmdbId' in result))) return
  request?.abort()
  const controller = new AbortController()
  request = controller
  const version = ++searchVersion
  loadingDetails.value = true
  try {
    const parameters = new URLSearchParams(
      'bggId' in result
        ? { bggId: String(result.bggId) }
        : {
            tmdbId: String(result.tmdbId),
            mediaType: '2',
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
    const details: TmdbResult | BggResult = await response.json()
    if (version === searchVersion && selected.value) selected.value = details
  } catch {
    if (!controller.signal.aborted) reportError(`${props.source}.requestError`)
  } finally {
    if (version === searchVersion) loadingDetails.value = false
  }
}

function removeCollectionEntry(index: number) {
  collectionSelections.value = collectionSelections.value.filter((_, current) => current !== index)
  selected.value = collectionSelections.value[0] ?? null
}

async function save() {
  if (!selected.value || saving.value || loadingDetails.value) return
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
                ...(store.value !== '' ? { store: store.value } : {}),
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
    savedName = requestedName
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
  show(itemNoticeKey('saved', savedMediaType), 'success', { name: savedName })
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
      :disabled="pendingSave || transitioning"
      @click="prepare"
      >{{ ct('add') }}</Dialog.Trigger
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
                    <select v-model.number="mediaType" name="TmdbMediaType">
                      <option :value="1">{{ t('sidebar.movies') }}</option>
                      <option :value="2">{{ t('sidebar.tvSeries') }}</option>
                    </select>
                  </label>
                  <p v-else class="tmdb-category">{{ t(`sidebar.${category}`) }}</p>
                  <label v-if="source === 'tmdb'" class="item-form-checkbox">
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
                  <button type="button" class="tmdb-result" @click="select(result)">
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
                    <span class="tmdb-select-label">{{ ct('select') }}</span>
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
                    <img
                      v-if="coverUrl(selected)"
                      :src="coverUrl(selected)!"
                      alt=""
                      width="92"
                      height="138"
                    />
                    <div>
                      <strong>{{ selected.title }}</strong>
                      <p v-if="selected.releaseDate">{{ selected.releaseDate }}</p>
                      <p v-if="'yearPublished' in selected && selected.yearPublished">
                        {{ selected.yearPublished }}
                      </p>
                      <p>{{ selected.overview || ct('noOverview') }}</p>
                      <template v-if="'bggId' in selected && !loadingDetails">
                        <BggExpansionDetails
                          :is-expansion="selected.isExpansion"
                          :required-games="selected.requiredGames"
                        />
                        <p v-if="selected.minPlayers || selected.maxPlayers">
                          {{ ct('players') }}: {{ selected.minPlayers ?? '–' }}–{{
                            selected.maxPlayers ?? '–'
                          }}
                        </p>
                        <p v-if="selected.playingTime">
                          {{ ct('playingTime') }}:
                          {{ ct('minutes', { count: selected.playingTime }) }}
                        </p>
                        <p v-if="selected.minAge">{{ ct('minAge') }}: {{ selected.minAge }}+</p>
                      </template>
                      <a
                        v-if="sourceUrl(selected)"
                        :href="sourceUrl(selected)!"
                        target="_blank"
                        rel="noopener noreferrer"
                        >{{ ct('viewSource') }}</a
                      >
                    </div>
                  </div>
                  <ol v-if="isCollection" class="media-collection-selection">
                    <li v-for="(entry, index) in collectionSelections" :key="entry.tmdbId">
                      {{ entry.title }}
                      <button type="button" @click="removeCollectionEntry(index)">
                        {{ t('mediaCollection.remove') }}
                      </button>
                    </li>
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
                    ><select v-model.number="format" name="MediaFormat">
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
                    </select></label
                  >
                  <template v-if="isIgdb">
                    <p v-if="'platforms' in selected && selected.platforms.length">
                      {{ ct('availablePlatforms') }}: {{ selected.platforms.join(', ') }}
                    </p>
                    <label class="item-form-field"
                      ><span>{{ t('itemForm.platform') }}</span
                      ><select v-model.number="platform" name="Platform" required>
                        <option value="" disabled>{{ t('itemForm.choosePlatform') }}</option>
                        <option
                          v-for="option in gamePlatforms"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.value === otherOption ? t('common.other') : option.label }}
                        </option>
                      </select></label
                    >
                    <label class="item-form-field"
                      ><span>{{ t('itemForm.store') }}</span
                      ><select
                        v-model.number="store"
                        name="Store"
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
                          v-for="option in gameStores"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.value === otherOption ? t('common.other') : option.label }}
                        </option>
                      </select></label
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
                </fieldset>
              </form>
              <p v-if="error" role="alert" class="item-form-error">{{ t(error) }}</p>
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

<script setup lang="ts">
import { Dialog } from '@ark-ui/vue/dialog'
import '../style/collection-item-dialog.css'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { type CollectionCategory, mediaFormats, otherOption } from '../models/collection'
import { posterUrl, type TmdbResult, type TmdbSearchPage } from '../models/tmdb'
import { snackbarElements, useSnackbar } from '../composables/useSnackbar'
import TmdbAttribution from './TmdbAttribution.vue'

const props = defineProps<{ category: CollectionCategory }>()
const emit = defineEmits<{ saved: [] }>()
const { t, locale } = useI18n({ useScope: 'global' })
const { show, dismissMessage } = useSnackbar()
const open = ref(false)
const mediaType = ref(1)
const language = computed(() => (locale.value === 'fi' ? 'fi-FI' : 'en-US'))
const query = ref('')
const results = ref<TmdbResult[]>([])
const selected = ref<TmdbResult | null>(null)
const searched = ref(false)
const searching = ref(false)
const saving = ref(false)
const transitioning = ref(false)
const pendingSave = ref(false)
const page = ref(1)
const totalPages = ref(0)
const name = ref('')
const format = ref(1)
const info = ref('')
const error = ref('')
let request: AbortController | undefined
let searchVersion = 0

function clearSearch() {
  searchVersion++
  request?.abort()
  searching.value = false
  searched.value = false
  results.value = []
  selected.value = null
  page.value = 1
  totalPages.value = 0
  dismissMessage(error.value)
  error.value = ''
}

function prepare() {
  clearSearch()
  mediaType.value = props.category === 'tvSeries' ? 2 : 1
  query.value = ''
  format.value = 1
  info.value = ''
}

watch([mediaType, language, query], clearSearch)
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
    tmdb_not_configured: 'tmdb.notConfigured',
    tmdb_credentials: 'tmdb.credentialsError',
    tmdb_rate_limited: 'tmdb.rateLimited',
    tmdb_not_found: 'tmdb.notFound',
  }
  reportError(
    errors[problem.code] ??
      (response.status === 400 ? 'itemForm.validationError' : 'tmdb.requestError'),
  )
}

async function search(targetPage = 1) {
  if (!query.value.trim() || saving.value) return
  request?.abort()
  const version = ++searchVersion
  const controller = new AbortController()
  request = controller
  searching.value = true
  selected.value = null
  results.value = []
  searched.value = false
  dismissMessage(error.value)
  error.value = ''
  try {
    const parameters = new URLSearchParams({
      query: query.value.trim(),
      mediaType: String(mediaType.value),
      language: language.value,
      page: String(targetPage),
    })
    const response = await fetch(`/api/tmdb/search?${parameters}`, { signal: controller.signal })
    if (version !== searchVersion) return
    if (!response.ok) {
      await responseError(response)
      return
    }
    const data: TmdbSearchPage = await response.json()
    if (version !== searchVersion) return
    results.value = data.results
    page.value = data.page
    totalPages.value = data.totalPages
    searched.value = true
  } catch {
    if (!controller.signal.aborted) reportError('tmdb.requestError')
  } finally {
    if (version === searchVersion) searching.value = false
  }
}

function select(result: TmdbResult) {
  selected.value = result
  name.value = result.title
  info.value = ''
}

async function save() {
  if (!selected.value || saving.value) return
  if (!name.value.trim()) {
    reportError('itemForm.nameRequired')
    return
  }
  saving.value = true
  dismissMessage(error.value)
  error.value = ''
  try {
    const response = await fetch('/api/tmdb/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tmdbId: selected.value.tmdbId,
        language: selected.value.language,
        item: {
          name: name.value.trim(),
          mediaType: mediaType.value,
          mediaFormat: format.value,
          info: info.value,
        },
      }),
    })
    if (!response.ok) {
      await responseError(response)
      return
    }
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
  show('itemForm.saved', 'success')
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
      class="tmdb-add-button"
      :disabled="pendingSave || transitioning"
      @click="prepare"
      >{{ t('tmdb.add') }}</Dialog.Trigger
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
              <Dialog.Title class="item-dialog-title">{{ t('tmdb.title') }}</Dialog.Title>
              <Dialog.Description class="item-dialog-description">{{
                t('tmdb.description')
              }}</Dialog.Description>
              <form class="item-form tmdb-search-form" @submit.prevent="search()">
                <fieldset class="item-form-fields" :disabled="saving">
                  <label v-if="category === 'all'" class="item-form-field">
                    <span>{{ t('itemForm.category') }}</span>
                    <select v-model.number="mediaType" name="TmdbMediaType">
                      <option :value="1">{{ t('sidebar.movies') }}</option>
                      <option :value="2">{{ t('sidebar.tvSeries') }}</option>
                    </select>
                  </label>
                  <p v-else class="tmdb-category">{{ t(`sidebar.${category}`) }}</p>
                  <label class="item-form-field"
                    ><span>{{ t('tmdb.searchLabel') }}</span
                    ><input
                      v-model="query"
                      name="TmdbQuery"
                      type="search"
                      required
                      maxlength="200"
                      :placeholder="t('tmdb.searchPlaceholder')"
                  /></label>
                  <button
                    type="submit"
                    class="tmdb-search-button"
                    :disabled="searching || !query.trim()"
                  >
                    {{ t(searching ? 'tmdb.searching' : 'tmdb.search') }}
                  </button>
                </fieldset>
              </form>
              <p v-if="searched && !results.length" role="status">{{ t('tmdb.noResults') }}</p>
              <ul
                v-if="results.length && !selected"
                class="tmdb-results"
                :aria-label="t('tmdb.results')"
              >
                <li v-for="result in results" :key="result.tmdbId">
                  <button type="button" class="tmdb-result" @click="select(result)">
                    <img
                      v-if="posterUrl(result.posterPath)"
                      :src="posterUrl(result.posterPath)!"
                      alt=""
                      class="tmdb-result-poster"
                      loading="lazy"
                      width="56"
                      height="84"
                    />
                    <span v-else class="tmdb-result-poster tmdb-no-poster">{{
                      t('tmdb.noPoster')
                    }}</span>
                    <span
                      ><strong>{{ result.title }}</strong
                      ><span v-if="result.releaseDate" class="tmdb-result-year">{{
                        result.releaseDate.slice(0, 4)
                      }}</span
                      ><span
                        v-if="result.originalTitle !== result.title"
                        class="tmdb-original-title"
                        >{{ result.originalTitle }}</span
                      ></span
                    >
                    <span class="tmdb-select-label">{{ t('tmdb.select') }}</span>
                  </button>
                </li>
              </ul>
              <nav
                v-if="totalPages > 1 && !selected && !searching"
                class="tmdb-pagination"
                :aria-label="t('tmdb.pages')"
              >
                <button type="button" :disabled="page <= 1 || saving" @click="search(page - 1)">
                  {{ t('tmdb.previous') }}
                </button>
                <span>{{ t('tmdb.page', { page, total: totalPages }) }}</span>
                <button
                  type="button"
                  :disabled="page >= totalPages || saving"
                  @click="search(page + 1)"
                >
                  {{ t('tmdb.next') }}
                </button>
              </nav>
              <form
                v-if="selected"
                class="item-form tmdb-import-form"
                :aria-busy="saving"
                @submit.prevent="save"
              >
                <fieldset class="item-form-fields" :disabled="saving">
                  <div class="tmdb-selected">
                    <img
                      v-if="posterUrl(selected.posterPath)"
                      :src="posterUrl(selected.posterPath)!"
                      alt=""
                      width="92"
                      height="138"
                    />
                    <div>
                      <strong>{{ selected.title }}</strong>
                      <p v-if="selected.releaseDate">{{ selected.releaseDate }}</p>
                      <p>{{ selected.overview || t('tmdb.noOverview') }}</p>
                      <a
                        :href="`https://www.themoviedb.org/${mediaType === 1 ? 'movie' : 'tv'}/${selected.tmdbId}`"
                        target="_blank"
                        rel="noopener noreferrer"
                        >{{ t('tmdb.viewSource') }}</a
                      >
                    </div>
                  </div>
                  <button type="button" @click="selected = null">
                    {{ t('tmdb.changeSelection') }}
                  </button>
                  <label class="item-form-field"
                    ><span>{{ t('itemForm.name') }}</span
                    ><input v-model="name" name="Name" required maxlength="300"
                  /></label>
                  <label class="item-form-field"
                    ><span>{{ t('itemForm.mediaFormat') }}</span
                    ><select v-model.number="format" name="MediaFormat">
                      <option
                        v-for="option in mediaFormats"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.value === otherOption ? t('common.other') : option.label }}
                      </option>
                    </select></label
                  >
                  <label class="item-form-field"
                    ><span>{{ t('itemForm.info') }}</span
                    ><textarea v-model="info" name="Info" rows="3" maxlength="10000" />
                  </label>
                </fieldset>
                <button class="tmdb-save-button" type="submit" :disabled="saving">
                  {{ t(saving ? 'itemForm.saving' : 'itemForm.add') }}
                </button>
              </form>
              <p v-if="error" role="alert" class="item-form-error">{{ t(error) }}</p>
              <div class="item-dialog-actions">
                <Dialog.CloseTrigger :disabled="saving">{{
                  t('itemForm.close')
                }}</Dialog.CloseTrigger>
              </div>
              <TmdbAttribution />
            </Dialog.Content>
          </Dialog.Positioner>
        </div>
      </Transition>
    </Teleport>
  </Dialog.Root>
</template>

<style src="../style/tmdb.css"></style>

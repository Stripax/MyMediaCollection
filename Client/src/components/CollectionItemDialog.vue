<script setup lang="ts">
import { Dialog } from '@ark-ui/vue/dialog'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ToolbarTooltip from './ToolbarTooltip.vue'
import ToolbarIcon from './ToolbarIcon.vue'
import CollectionSourceDetails from './CollectionSourceDetails.vue'
import '../style/details-fade.css'
import TvSeasonOwnership from './TvSeasonOwnership.vue'
import BoardGameFields from './BoardGameFields.vue'
import MediaCollectionContents from './MediaCollectionContents.vue'
import FadingCover from './FadingCover.vue'
import { snackbarElements, useSnackbar } from '../composables/useSnackbar'
import {
  itemSourceUrl,
  itemCoverUrl,
  itemSourceName,
  itemSourceTooltip,
} from '../models/itemSources'
import { displayItemName } from '../models/itemNames'
import { itemNoticeKey } from '../models/itemNotices'
import { igdbPlatformOptions } from '../models/igdb'
import {
  mediaCategories as mediaTypes,
  mediaFormats,
  boardGameFormats,
  gamePlatforms,
  gameStoreOptions,
  pcPlatform,
  otherOption,
  type CollectionItem,
  type CollectionCategory,
  type OwnedSeason,
  type BoardGameReference,
  type CollectionContent,
  boardGameKind,
  boardGameParents,
} from '../models/collection'

const { t, locale } = useI18n({ useScope: 'global' })
const props = withDefaults(
  defineProps<{
    item?: CollectionItem
    category?: CollectionCategory
    hideTrigger?: boolean
    items?: CollectionItem[]
  }>(),
  { category: 'all', items: () => [] },
)
const emit = defineEmits<{ saved: []; closed: [] }>()
const form = reactive({ MediaType: 1, Name: '', MediaFormat: 1, Info: '' })
const selectedPlatform = ref<number | ''>('')
const selectedStore = ref<number | ''>('')
const availableStores = computed(() => gameStoreOptions(selectedPlatform.value))
watch(availableStores, (stores) => {
  if (selectedStore.value !== '' && !stores.some((store) => store.value === selectedStore.value))
    selectedStore.value = ''
})
const isPhysical = ref(false)
watch(isPhysical, (physical) => {
  if (physical) selectedStore.value = ''
})
const initialName = ref('')
const isCompleteBox = ref(false)
const isCollection = ref(false)
const collectionContents = ref<CollectionContent[]>([])
const inspectedTmdbId = ref<number | null>(null)
const inspectedContent = computed(
  () =>
    collectionContents.value.find((entry) => entry.tmdbId === inspectedTmdbId.value) ??
    collectionContents.value[0],
)
watch(isCollection, (value) => {
  if (value && !collectionContents.value.length) collectionContents.value = [{ name: '' }]
})
watch(
  () => form.MediaType,
  (value, previous) => {
    if (value !== previous && !props.item) {
      isCollection.value = false
      collectionContents.value = []
    }
  },
)
const ownedSeasons = ref<OwnedSeason[]>([])
const ownershipVersion = ref(0)
const selectedBoardFormat = ref<number | ''>('')
const selectedBoardKind = ref(1)
const baseGames = ref<BoardGameReference[]>([])
const isTabletopGame = computed(() => form.MediaType === 4)
const isVideoGame = computed(() => form.MediaType === 3)
const availablePlatforms = computed(() =>
  igdbPlatformOptions(
    props.item?.sourceMetadata?.source === 'IGDB' ? props.item.sourceMetadata.platforms : null,
  ),
)
const savedPlatform = computed(() =>
  gamePlatforms.find(
    (platform) =>
      platform.value === props.item?.platform &&
      !availablePlatforms.value.some((option) => option.value === platform.value),
  ),
)
const isPcGame = computed(() => isVideoGame.value && selectedPlatform.value === pcPlatform)
const hasMediaFormat = computed(() => form.MediaType === 1 || form.MediaType === 2)
const formCategory = computed(
  () => mediaTypes.find((type) => type.value === form.MediaType)?.id ?? 'all',
)
const open = ref(false)
const saving = ref(false)
const error = ref('')
const { show, dismissMessage } = useSnackbar()
const pendingSave = ref(false)
let savedName = ''
let savedMediaType = 1
let savedId: number | undefined
const transitioning = ref(false)
const trigger = ref<{ $el: HTMLButtonElement } | null>(null)
const returnFocusTarget = ref<HTMLElement | null>(null)
const posterFailed = ref(false)
const previewItem = computed(() => {
  if (!props.item || !isCollection.value) return props.item
  const cover = inspectedContent.value
  return { ...props.item, tmdbId: cover?.tmdbId ?? null, posterPath: cover?.posterPath ?? null }
})
const editPosterUrl = computed(() => (previewItem.value ? itemCoverUrl(previewItem.value) : null))
const editSourceUrl = computed(() =>
  previewItem.value ? itemSourceUrl(previewItem.value) : undefined,
)
const editMetadata = computed(() =>
  isCollection.value
    ? (inspectedContent.value?.sourceMetadata ??
      (inspectedContent.value?.tmdbId === props.item?.tmdbId ? props.item?.sourceMetadata : null))
    : props.item?.sourceMetadata,
)
watch(editPosterUrl, () => {
  posterFailed.value = false
})

function finishClose() {
  transitioning.value = false
  nextTick(() => {
    const target = [
      returnFocusTarget.value,
      trigger.value?.$el,
      document.querySelector<HTMLElement>('.brand'),
    ].find((element) => element?.isConnected)
    target?.focus()
  })
  if (!pendingSave.value) {
    emit('closed')
    return
  }
  pendingSave.value = false
  Object.assign(form, { MediaType: 1, Name: '', MediaFormat: 1, Info: '' })
  show(
    itemNoticeKey(props.item ? 'updated' : 'saved', savedMediaType),
    'success',
    {
      name: savedName,
    },
    savedId,
  )
  emit('closed')
}

function optionLabel(option: { value: number; label: string }) {
  return option.value === otherOption ? t('common.other') : option.label
}

function prepareForm() {
  inspectedTmdbId.value =
    props.item?.tmdbId !== props.item?.collectionContents?.[0]?.tmdbId
      ? (props.item?.tmdbId ?? null)
      : null
  isCollection.value = props.item?.isCollection ?? false
  collectionContents.value = props.item?.collectionContents?.map((entry) => ({ ...entry })) ?? []
  selectedBoardKind.value = props.item ? (boardGameKind(props.item) ?? 99) : 1
  baseGames.value = props.item
    ? boardGameParents(props.item).map((game) => {
        const owned = props.items.find(
          (item) =>
            item.mediaType === 4 &&
            item.id !== props.item?.id &&
            (game.collectionItemId
              ? item.id === game.collectionItemId
              : game.bggId && item.bggId === game.bggId),
        )
        return owned
          ? { collectionItemId: owned.id, name: owned.name, bggId: owned.bggId }
          : { ...game }
      })
    : []
  ownershipVersion.value++
  isCompleteBox.value = props.item?.isCompleteBox ?? false
  ownedSeasons.value = props.item?.ownedSeasons?.map((season) => ({ ...season })) ?? []
  posterFailed.value = false
  returnFocusTarget.value = null
  dismissMessage(error.value)
  error.value = ''
  selectedPlatform.value = props.item?.platform ?? ''
  selectedStore.value = props.item?.isPhysical ? '' : (props.item?.store ?? '')
  isPhysical.value = props.item?.isPhysical ?? false
  selectedBoardFormat.value =
    props.item?.mediaType === 4 &&
    boardGameFormats.some((format) => format.value === props.item?.mediaFormat)
      ? props.item.mediaFormat!
      : ''
  if (props.item) {
    Object.assign(form, {
      Name: displayItemName(props.item, locale.value),
      MediaType: props.item.mediaType,
      MediaFormat: props.item.mediaFormat ?? '',
      Info: props.item.info ?? '',
    })
  } else {
    form.MediaType = mediaTypes.find((type) => type.id === props.category)?.value ?? 1
  }
  initialName.value = form.Name
}

async function save() {
  if (saving.value) return
  dismissMessage(error.value)
  error.value = ''
  if (!form.Name.trim()) {
    reportError('itemForm.nameRequired')
    return
  }
  if (isVideoGame.value && selectedPlatform.value === '') {
    reportError('itemForm.platformRequired')
    return
  }
  if (isPcGame.value && !isPhysical.value && selectedStore.value === '') {
    reportError('itemForm.storeRequired')
    return
  }
  if (isTabletopGame.value && selectedBoardFormat.value === '') {
    reportError('itemForm.gameTypeRequired')
    return
  }
  if (
    hasMediaFormat.value &&
    isCollection.value &&
    (!collectionContents.value.length ||
      collectionContents.value.some((entry) => !entry.name.trim()))
  ) {
    reportError('mediaCollection.contentsRequired')
    return
  }
  saving.value = true
  const requestedName = form.Name.trim()
  const requestedMediaType = form.MediaType
  try {
    const response = await fetch(
      props.item ? `/api/collection/${props.item.id}` : '/api/collection',
      {
        method: props.item ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          Name: requestedName,
          MediaFormat: isTabletopGame.value
            ? selectedBoardFormat.value
            : hasMediaFormat.value
              ? form.MediaFormat
              : null,
          ...(isVideoGame.value ? { Platform: selectedPlatform.value } : {}),
          ...(isVideoGame.value && !isPhysical.value && selectedStore.value !== ''
            ? { Store: selectedStore.value }
            : {}),
          ...(isVideoGame.value ? { IsPhysical: isPhysical.value } : {}),
          ...(hasMediaFormat.value && (isCollection.value || props.item?.isCollection)
            ? {
                IsCollection: isCollection.value,
                ...(isCollection.value && inspectedContent.value?.tmdbId
                  ? { CoverTmdbId: inspectedContent.value.tmdbId }
                  : {}),
                CollectionContents: isCollection.value
                  ? collectionContents.value.map((entry) => ({
                      Name: entry.name.trim(),
                      ...(entry.tmdbId ? { TmdbId: entry.tmdbId } : {}),
                    }))
                  : [],
              }
            : {}),
          ...(isTabletopGame.value
            ? {
                BoardGameKind: selectedBoardKind.value,
                BaseGames:
                  selectedBoardKind.value === 2 || selectedBoardKind.value === 99
                    ? baseGames.value.filter((game) => game.collectionItemId || game.name.trim())
                    : [],
              }
            : {}),
          ...(props.item?.tmdbId
            ? { NameWasEdited: form.Name.trim() !== initialName.value.trim() }
            : {}),
          ...(form.MediaType === 2 && !isCollection.value
            ? { IsCompleteBox: isCompleteBox.value, OwnedSeasons: ownedSeasons.value }
            : {}),
        }),
      },
    )
    if (!response.ok) {
      reportError(
        response.status === 400
          ? 'itemForm.validationError'
          : response.status === 404
            ? 'itemForm.notFound'
            : 'itemForm.saveError',
      )
      return
    }
    const saved = await response.json().catch(() => null)
    savedId =
      props.item?.id ?? (Number.isSafeInteger(saved?.id) && saved.id > 0 ? saved.id : undefined)
    savedName = requestedName
    savedMediaType = requestedMediaType
    pendingSave.value = true
    open.value = false
    emit('saved')
  } catch {
    reportError('itemForm.saveError')
  } finally {
    saving.value = false
  }
}

function openEditor(target: HTMLElement) {
  if (!props.item || open.value || pendingSave.value || transitioning.value) return
  prepareForm()
  returnFocusTarget.value = target
  open.value = true
}

defineExpose({ openEditor })

function reportError(message: string) {
  error.value = message
  show(message, 'error')
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
    <ToolbarTooltip
      v-if="item && !hideTrigger"
      v-slot="{ describedby }"
      :text="t('collection.edit')"
      class="collection-action-tooltip"
    >
      <Dialog.Trigger
        ref="trigger"
        :disabled="pendingSave || transitioning"
        class="collection-edit-button collection-icon-button"
        :aria-label="t('collection.editItem', { name: displayItemName(item, locale) })"
        :aria-describedby="describedby"
        @click="prepareForm"
      >
        <ToolbarIcon name="wrench" />
      </Dialog.Trigger>
    </ToolbarTooltip>
    <Dialog.Trigger
      v-else-if="!item && !hideTrigger"
      ref="trigger"
      :disabled="pendingSave || transitioning"
      class="collection-add-button positive-button"
      @click="prepareForm"
      >{{ t(`collection.add.${category}`) }}</Dialog.Trigger
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
            <Dialog.Content
              class="item-dialog"
              :class="{
                'item-dialog-edit': !!item,
                'item-dialog-with-details': !!item?.sourceMetadata,
              }"
              :hidden="false"
            >
              <Dialog.Title class="item-dialog-title">{{
                t(item ? `collection.editTitles.${formCategory}` : `collection.add.${formCategory}`)
              }}</Dialog.Title>
              <Dialog.Description class="item-dialog-description">
                {{ t(item ? 'itemForm.editDescription' : 'itemForm.description') }}
              </Dialog.Description>
              <div
                class="item-dialog-body"
                :class="{ 'item-dialog-body-with-details': !!item?.sourceMetadata }"
              >
                <div
                  v-if="editPosterUrl || editMetadata"
                  class="item-dialog-source"
                  :class="{ 'item-dialog-source-with-poster': editPosterUrl && !posterFailed }"
                >
                  <ToolbarTooltip
                    v-if="editPosterUrl && !posterFailed"
                    v-slot="{ describedby }"
                    :text="item ? t(itemSourceTooltip(item)) : ''"
                    :disabled="!editSourceUrl"
                    class="cover-tooltip item-dialog-cover-tooltip"
                  >
                    <component
                      :is="editSourceUrl ? 'a' : 'span'"
                      :aria-describedby="describedby"
                      :href="editSourceUrl"
                      :target="editSourceUrl ? '_blank' : undefined"
                      :rel="editSourceUrl ? 'noopener noreferrer' : undefined"
                      :aria-label="
                        item && editSourceUrl
                          ? t('sourceMetadata.openSource', {
                              name: displayItemName(item, locale),
                              source: itemSourceName(item),
                            })
                          : undefined
                      "
                      class="item-dialog-cover-link"
                    >
                      <FadingCover
                        mode="out-in"
                        image-class="item-dialog-poster"
                        :src="editPosterUrl"
                        :alt="item ? displayItemName(item, locale) : ''"
                        :width="120"
                        :height="180"
                        @error="
                          (source) => {
                            if (source === editPosterUrl) posterFailed = true
                          }
                        "
                      />
                    </component>
                  </ToolbarTooltip>
                  <Transition name="details-fade" mode="out-in">
                    <CollectionSourceDetails
                      v-if="editMetadata"
                      :key="isCollection ? (inspectedContent?.tmdbId ?? 'single') : 'single'"
                      :metadata="editMetadata"
                      :media-type="form.MediaType"
                    />
                  </Transition>
                </div>
                <form
                  class="item-form"
                  autocomplete="off"
                  :aria-busy="saving"
                  @submit.prevent="save"
                >
                  <fieldset class="item-form-fields" :disabled="saving">
                    <dl v-if="item" class="item-form-category">
                      <dt>{{ t('itemForm.category') }}</dt>
                      <dd>{{ t(`sidebar.${formCategory}`) }}</dd>
                    </dl>
                    <label v-else-if="category === 'all'" class="item-form-field">
                      <span>{{ t('itemForm.category') }}</span>
                      <select v-model.number="form.MediaType" name="MediaType">
                        <option v-for="type in mediaTypes" :key="type.value" :value="type.value">
                          {{ t(type.label) }}
                        </option>
                      </select>
                    </label>
                    <label v-if="hasMediaFormat" class="item-form-checkbox">
                      <input v-model="isCollection" name="IsCollection" type="checkbox" />
                      <span>{{ t('mediaCollection.label') }}</span>
                    </label>
                    <label class="item-form-field">
                      <span>{{ t('itemForm.name') }}</span>
                      <input v-model="form.Name" name="Name" type="text" required maxlength="300" />
                    </label>
                    <MediaCollectionContents
                      v-if="hasMediaFormat && isCollection"
                      v-model="collectionContents"
                      :inspected-tmdb-id="inspectedContent?.tmdbId"
                      @inspect="inspectedTmdbId = $event.tmdbId ?? null"
                    />
                    <BoardGameFields
                      v-if="isTabletopGame"
                      v-model:kind="selectedBoardKind"
                      v-model:base-games="baseGames"
                      :items="items"
                      :item-id="item?.id"
                    />

                    <label v-if="isVideoGame" class="item-form-field">
                      <span>{{ t('itemForm.platform') }}</span>
                      <select v-model.number="selectedPlatform" name="Platform" required>
                        <option value="" disabled>{{ t('itemForm.choosePlatform') }}</option>
                        <option v-if="savedPlatform" :value="savedPlatform.value" disabled>
                          {{
                            t('itemForm.currentPlatform', { platform: optionLabel(savedPlatform) })
                          }}
                        </option>
                        <option
                          v-for="platform in availablePlatforms"
                          :key="platform.value"
                          :value="platform.value"
                        >
                          {{ optionLabel(platform) }}
                        </option>
                      </select>
                    </label>
                    <label v-else-if="isTabletopGame" class="item-form-field">
                      <span>{{ t('itemForm.gameType') }}</span>
                      <select v-model.number="selectedBoardFormat" name="MediaFormat" required>
                        <option value="" disabled>{{ t('itemForm.chooseGameType') }}</option>
                        <option
                          v-for="format in boardGameFormats"
                          :key="format.value"
                          :value="format.value"
                        >
                          {{ t(format.label) }}
                        </option>
                      </select>
                    </label>
                    <label v-else-if="hasMediaFormat" class="item-form-field">
                      <span>{{
                        t(
                          form.MediaType === 2 && !isCollection
                            ? 'tvOwnership.defaultFormat'
                            : 'itemForm.mediaFormat',
                        )
                      }}</span>
                      <select v-model.number="form.MediaFormat" name="MediaFormat" required>
                        <option v-if="item?.mediaFormat === null" value="" disabled>
                          {{ t('itemForm.chooseFormat') }}
                        </option>
                        <option
                          v-for="format in mediaFormats"
                          :key="format.value"
                          :value="format.value"
                        >
                          {{ optionLabel(format) }}
                        </option>
                      </select>
                    </label>
                    <TvSeasonOwnership
                      v-if="form.MediaType === 2 && !isCollection"
                      :key="ownershipVersion"
                      v-model:complete-box="isCompleteBox"
                      v-model:owned-seasons="ownedSeasons"
                      :default-format="Number(form.MediaFormat) || 1"
                      :season-count="item?.sourceMetadata?.numberOfSeasons"
                      :episode-count="item?.sourceMetadata?.numberOfEpisodes"
                      :seasons="item?.sourceMetadata?.seasons"
                    />
                    <label v-if="isVideoGame" class="item-form-field">
                      <span>{{ t('itemForm.store') }}</span>
                      <select
                        v-model.number="selectedStore"
                        name="Store"
                        :disabled="isPhysical || selectedPlatform === ''"
                        :required="isPcGame && !isPhysical"
                      >
                        <option value="">
                          {{
                            t(
                              isPcGame && !isPhysical
                                ? 'itemForm.chooseStore'
                                : 'itemForm.chooseStoreOptional',
                            )
                          }}
                        </option>
                        <option
                          v-for="store in availableStores"
                          :key="store.value"
                          :value="store.value"
                        >
                          {{ optionLabel(store) }}
                        </option>
                      </select>
                    </label>
                    <label v-if="isVideoGame" class="item-form-checkbox">
                      <input v-model="isPhysical" type="checkbox" name="IsPhysical" />
                      <span>{{ t('itemForm.isPhysical') }}</span>
                    </label>
                    <label class="item-form-field">
                      <span>{{ t('itemForm.info') }}</span>
                      <textarea
                        v-model="form.Info"
                        name="Info"
                        rows="4"
                        maxlength="10000"
                      ></textarea>
                    </label>
                  </fieldset>
                  <p v-if="error" class="item-form-error" role="alert">{{ t(error) }}</p>
                  <div class="item-dialog-actions">
                    <Dialog.CloseTrigger
                      class="item-dialog-cancel"
                      type="button"
                      :disabled="saving"
                      >{{ t('itemForm.close') }}</Dialog.CloseTrigger
                    >
                    <button class="item-dialog-primary" type="submit" :disabled="saving">
                      {{
                        t(
                          saving
                            ? 'itemForm.saving'
                            : item
                              ? 'itemForm.saveChanges'
                              : 'itemForm.add',
                        )
                      }}
                    </button>
                  </div>
                </form>
              </div>
            </Dialog.Content>
          </Dialog.Positioner>
        </div>
      </Transition>
    </Teleport>
  </Dialog.Root>
</template>

<style src="../style/collection-item-dialog.css"></style>

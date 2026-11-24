<script setup lang="ts">
import { Dialog } from '@ark-ui/vue/dialog'
import { computed, nextTick, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ToolbarTooltip from './ToolbarTooltip.vue'
import ToolbarIcon from './ToolbarIcon.vue'
import CollectionSourceDetails from './CollectionSourceDetails.vue'
import TvSeasonOwnership from './TvSeasonOwnership.vue'
import { snackbarElements, useSnackbar } from '../composables/useSnackbar'
import { posterUrl } from '../models/tmdb'
import { igdbCoverUrl } from '../models/igdb'
import { displayItemName } from '../models/itemNames'
import {
  mediaCategories as mediaTypes,
  mediaFormats,
  boardGameFormats,
  gamePlatforms,
  gameStores,
  pcPlatform,
  otherOption,
  type CollectionItem,
  type CollectionCategory,
  type OwnedSeason,
} from '../models/collection'

const { t, locale } = useI18n({ useScope: 'global' })
const props = withDefaults(
  defineProps<{
    item?: CollectionItem
    category?: CollectionCategory
  }>(),
  { category: 'all' },
)
const emit = defineEmits<{ saved: [] }>()
const form = reactive({ MediaType: 1, Name: '', MediaFormat: 1, Info: '' })
const selectedPlatform = ref<number | ''>('')
const selectedStore = ref<number | ''>('')
const isPhysical = ref(false)
const initialName = ref('')
const isCompleteBox = ref(false)
const ownedSeasons = ref<OwnedSeason[]>([])
const ownershipVersion = ref(0)
const selectedBoardFormat = ref<number | ''>('')
const isTabletopGame = computed(() => form.MediaType === 4)
const isVideoGame = computed(() => form.MediaType === 3)
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
const transitioning = ref(false)
const trigger = ref<{ $el: HTMLButtonElement } | null>(null)
const returnFocusTarget = ref<HTMLElement | null>(null)
const posterFailed = ref(false)
const editPosterUrl = computed(() =>
  props.item && (props.item.mediaType === 1 || props.item.mediaType === 2)
    ? posterUrl(props.item.posterPath)
    : props.item?.mediaType === 3
      ? igdbCoverUrl(props.item.coverImageId)
      : null,
)

function finishClose() {
  transitioning.value = false
  nextTick(() => (returnFocusTarget.value ?? trigger.value?.$el)?.focus())
  if (!pendingSave.value) return
  pendingSave.value = false
  Object.assign(form, { MediaType: 1, Name: '', MediaFormat: 1, Info: '' })
  show(props.item ? 'itemForm.updated' : 'itemForm.saved', 'success')
  emit('saved')
}

function optionLabel(option: { value: number; label: string }) {
  return option.value === otherOption ? t('common.other') : option.label
}

function prepareForm() {
  ownershipVersion.value++
  isCompleteBox.value = props.item?.isCompleteBox ?? false
  ownedSeasons.value = props.item?.ownedSeasons?.map((season) => ({ ...season })) ?? []
  posterFailed.value = false
  returnFocusTarget.value = null
  dismissMessage(error.value)
  error.value = ''
  selectedPlatform.value = props.item?.platform ?? ''
  selectedStore.value = props.item?.store ?? ''
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
  saving.value = true
  try {
    const response = await fetch(
      props.item ? `/api/collection/${props.item.id}` : '/api/collection',
      {
        method: props.item ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          Name: form.Name.trim(),
          MediaFormat: isTabletopGame.value
            ? selectedBoardFormat.value
            : hasMediaFormat.value
              ? form.MediaFormat
              : null,
          ...(isVideoGame.value ? { Platform: selectedPlatform.value } : {}),
          ...(isVideoGame.value && selectedStore.value !== ''
            ? { Store: selectedStore.value }
            : {}),
          ...(isVideoGame.value ? { IsPhysical: isPhysical.value } : {}),
          ...(props.item?.tmdbId
            ? { NameWasEdited: form.Name.trim() !== initialName.value.trim() }
            : {}),
          ...(form.MediaType === 2
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
    pendingSave.value = true
    open.value = false
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
      v-if="item"
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
      v-else
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
                  v-if="editPosterUrl || item?.sourceMetadata"
                  class="item-dialog-source"
                  :class="{ 'item-dialog-source-with-poster': editPosterUrl && !posterFailed }"
                >
                  <img
                    v-if="editPosterUrl && !posterFailed"
                    class="item-dialog-poster"
                    :src="editPosterUrl"
                    :alt="item ? displayItemName(item, locale) : ''"
                    width="120"
                    height="180"
                    @error="posterFailed = true"
                  />
                  <CollectionSourceDetails
                    v-if="item?.sourceMetadata"
                    :metadata="item.sourceMetadata"
                    :media-type="item.mediaType"
                  />
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
                    <label class="item-form-field">
                      <span>{{ t('itemForm.name') }}</span>
                      <input v-model="form.Name" name="Name" type="text" required maxlength="300" />
                    </label>

                    <label v-if="isVideoGame" class="item-form-field">
                      <span>{{ t('itemForm.platform') }}</span>
                      <select v-model.number="selectedPlatform" name="Platform" required>
                        <option value="" disabled>{{ t('itemForm.choosePlatform') }}</option>
                        <option
                          v-for="platform in gamePlatforms"
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
                          form.MediaType === 2
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
                      v-if="form.MediaType === 2"
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
                        <option v-for="store in gameStores" :key="store.value" :value="store.value">
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

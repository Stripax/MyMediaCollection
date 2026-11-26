<script setup lang="ts">
import { Dialog } from '@ark-ui/vue/dialog'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { displayItemName } from '../models/itemNames'
import { itemNoticeKey } from '../models/itemNotices'
import ToolbarTooltip from './ToolbarTooltip.vue'
import ToolbarIcon from './ToolbarIcon.vue'
import { snackbarElements, useSnackbar } from '../composables/useSnackbar'
import { mediaCategories, type CollectionItem } from '../models/collection'

const props = defineProps<{ item: CollectionItem }>()
const emit = defineEmits<{ deleted: [] }>()
const { t, locale } = useI18n({ useScope: 'global' })
const category = computed(
  () => mediaCategories.find((category) => category.value === props.item.mediaType)?.id ?? 'all',
)
const open = ref(false)
const deleting = ref(false)
const error = ref('')
const { show, dismissMessage, disableItemLinks } = useSnackbar()
const pendingDelete = ref(false)
let deletedName = ''
let deletedMediaType = 1
const transitioning = ref(false)
const trigger = ref<{ $el: HTMLButtonElement } | null>(null)

function finishClose() {
  transitioning.value = false
  nextTick(() => trigger.value?.$el.focus({ preventScroll: true }))
  if (!pendingDelete.value) return
  pendingDelete.value = false
  show(itemNoticeKey('deleted', deletedMediaType), 'success', { name: deletedName })
  emit('deleted')
}

async function remove() {
  if (deleting.value) return
  deleting.value = true
  const requestedName = displayItemName(props.item, locale.value)
  const requestedMediaType = props.item.mediaType
  dismissMessage(error.value)
  error.value = ''
  try {
    const response = await fetch(`/api/collection/${props.item.id}`, { method: 'DELETE' })
    if (!response.ok) {
      error.value = response.status === 404 ? 'itemForm.notFound' : 'collection.deleteError'
      show(error.value, 'error')
      return
    }
    disableItemLinks(props.item.id)
    deletedName = requestedName
    deletedMediaType = requestedMediaType
    pendingDelete.value = true
    open.value = false
  } catch {
    error.value = 'collection.deleteError'
    show(error.value, 'error')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <Dialog.Root
    v-model:open="open"
    :persistent-elements="snackbarElements()"
    :close-on-escape="!deleting"
    :close-on-interact-outside="!deleting"
    role="alertdialog"
    lazy-mount
  >
    <ToolbarTooltip
      v-slot="{ describedby }"
      :text="t('collection.delete')"
      class="collection-action-tooltip"
    >
      <Dialog.Trigger
        ref="trigger"
        :disabled="pendingDelete || transitioning"
        class="collection-delete-button collection-icon-button"
        :aria-label="t('collection.deleteItem', { name: displayItemName(item, locale) })"
        :aria-describedby="describedby"
        @click="error = ''"
      >
        <ToolbarIcon name="trash" />
      </Dialog.Trigger>
    </ToolbarTooltip>
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
            <Dialog.Content class="item-dialog" :hidden="false" :aria-busy="deleting">
              <Dialog.Title class="item-dialog-title">{{
                t(`collection.deleteTitles.${category}`)
              }}</Dialog.Title>
              <Dialog.Description class="item-dialog-description">{{
                t(`collection.deleteConfirmations.${category}`, {
                  name: displayItemName(item, locale),
                })
              }}</Dialog.Description>
              <p v-if="error" role="alert" class="item-form-error">{{ t(error) }}</p>
              <div class="item-dialog-actions">
                <Dialog.CloseTrigger
                  class="item-dialog-cancel"
                  type="button"
                  :disabled="deleting"
                  >{{ t('collection.cancel') }}</Dialog.CloseTrigger
                >
                <button
                  type="button"
                  class="collection-delete-confirm"
                  :disabled="deleting"
                  @click="remove"
                >
                  {{ t(deleting ? 'collection.deleting' : 'collection.delete') }}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Positioner>
        </div>
      </Transition>
    </Teleport>
  </Dialog.Root>
</template>

<style src="../style/collection-item-dialog.css"></style>

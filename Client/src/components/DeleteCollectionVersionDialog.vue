<script setup lang="ts">
import ToolbarTooltip from './ToolbarTooltip.vue'
import ToolbarIcon from './ToolbarIcon.vue'
import '../style/collection-actions.css'
import { Dialog } from '@ark-ui/vue/dialog'
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { displayItemName } from '../models/itemNames'
import type { CollectionItem, CollectionVersion } from '../models/collection'
import { snackbarElements, useSnackbar } from '../composables/useSnackbar'

const props = defineProps<{ item: CollectionItem; version: CollectionVersion; label: string }>()
const emit = defineEmits<{ deleted: []; busy: [value: boolean] }>()
const { t, locale } = useI18n({ useScope: 'global' })
const { show, dismissMessage } = useSnackbar()
const open = ref(false)
const deleting = ref(false)
const transitioning = ref(false)
const error = ref('')
const trigger = ref<{ $el: HTMLButtonElement } | null>(null)
let deleted: { name: string; version: string; id: number } | undefined
watch(open, (value) => {
  if (value) emit('busy', true)
})

function finishClose() {
  transitioning.value = false
  emit('busy', false)
  nextTick(() => trigger.value?.$el.focus({ preventScroll: true }))
  if (!deleted) return
  show(
    'versionDelete.success',
    'success',
    { name: deleted.name, version: deleted.version },
    deleted.id,
  )
  deleted = undefined
  emit('deleted')
}

async function remove() {
  if (deleting.value || deleted) return
  deleting.value = true
  dismissMessage(error.value)
  error.value = ''
  const target = {
    name: displayItemName(props.item, locale.value),
    version: props.label,
    id: props.item.id,
  }
  try {
    const response = await fetch(`/api/collection/${props.item.id}/versions/${props.version.id}`, {
      method: 'DELETE',
      headers: { 'If-Match': `"${props.version.deletionToken}"` },
    })
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}))
      error.value =
        problem.code === 'collection_last_version'
          ? 'versionDelete.lastVersion'
          : response.status === 412 || response.status === 404
            ? 'versionDelete.changed'
            : 'versionDelete.error'
      show(error.value, 'error')
      return
    }
    deleted = target
    open.value = false
  } catch {
    error.value = 'versionDelete.error'
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
      :text="t(item.mediaType === 3 ? 'versionDelete.platform' : 'versionDelete.format')"
      class="collection-action-tooltip collection-version-delete-tooltip"
    >
      <Dialog.Trigger
        ref="trigger"
        type="button"
        class="collection-icon-button collection-delete-button collection-version-delete"
        :aria-label="t(item.mediaType === 3 ? 'versionDelete.platform' : 'versionDelete.format')"
        :aria-describedby="describedby"
        :disabled="deleting || transitioning || !version.deletionToken"
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
        @leave-cancelled="finishClose"
      >
        <div v-show="open" class="item-dialog-layer" :inert="!open" :aria-hidden="!open">
          <Dialog.Backdrop class="item-dialog-backdrop" :hidden="false" />
          <Dialog.Positioner class="item-dialog-positioner">
            <Dialog.Content class="item-dialog" :hidden="false" :aria-busy="deleting">
              <Dialog.Title class="item-dialog-title">{{
                t(
                  item.mediaType === 3
                    ? 'versionDelete.platformTitle'
                    : 'versionDelete.formatTitle',
                )
              }}</Dialog.Title>
              <Dialog.Description class="item-dialog-description">{{
                t('versionDelete.confirm', { name: displayItemName(item, locale), version: label })
              }}</Dialog.Description>
              <p v-if="error" role="alert" class="item-form-error">{{ t(error) }}</p>
              <div class="item-dialog-actions">
                <Dialog.CloseTrigger
                  type="button"
                  class="item-dialog-cancel"
                  :disabled="deleting"
                  >{{ t('collection.cancel') }}</Dialog.CloseTrigger
                >
                <button
                  type="button"
                  class="collection-delete-confirm collection-version-delete-confirm"
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

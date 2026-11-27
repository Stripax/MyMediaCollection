<script setup lang="ts">
import { Dialog } from '@ark-ui/vue/dialog'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { itemVersions, type CollectionItem } from '../models/collection'
import { displayItemName } from '../models/itemNames'
import ToolbarTooltip from './ToolbarTooltip.vue'
import '../style/info-button.css'
import '../style/collection-item-dialog.css'
import '../style/collection-info-dialog.css'

const props = defineProps<{ item: CollectionItem }>()
const info = computed(() =>
  [
    ...new Set(
      itemVersions(props.item)
        .map((version) => version.info?.trim())
        .filter(Boolean),
    ),
  ].join('\n\n'),
)
const { t, locale } = useI18n({ useScope: 'global' })
const open = ref(false)
const transitioning = ref(false)
const trigger = ref<{ $el: HTMLButtonElement } | null>(null)
function finishClose() {
  transitioning.value = false
  nextTick(() => trigger.value?.$el.focus({ preventScroll: true }))
}
</script>

<template>
  <Dialog.Root v-model:open="open" lazy-mount>
    <ToolbarTooltip
      v-slot="{ describedby }"
      :text="t(info ? 'itemForm.info' : 'collection.noInfoTooltip')"
      class="collection-action-tooltip collection-info-tooltip"
    >
      <Dialog.Trigger
        ref="trigger"
        class="info-btn-glass collection-info-button"
        :disabled="transitioning || !info"
        :aria-label="t('collection.showInfo', { name: displayItemName(item, locale) })"
        :aria-describedby="describedby"
        ><span aria-hidden="true">i</span></Dialog.Trigger
      >
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
        <div v-if="open" class="item-dialog-layer">
          <Dialog.Backdrop class="item-dialog-backdrop" :hidden="false" />
          <Dialog.Positioner class="item-dialog-positioner">
            <Dialog.Content class="item-dialog collection-info-dialog" :hidden="false">
              <Dialog.Title class="item-dialog-title collection-info-dialog-title">{{
                t('itemForm.info')
              }}</Dialog.Title>
              <Dialog.Description class="collection-info-text">{{
                info ? info : t('collection.noInfo')
              }}</Dialog.Description>
              <div class="item-dialog-actions">
                <Dialog.CloseTrigger type="button" class="item-dialog-cancel">{{
                  t('collection.cancel')
                }}</Dialog.CloseTrigger>
              </div>
            </Dialog.Content>
          </Dialog.Positioner>
        </div>
      </Transition>
    </Teleport>
  </Dialog.Root>
</template>

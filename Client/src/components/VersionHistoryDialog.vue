<script setup lang="ts">
import { Dialog } from '@ark-ui/vue/dialog'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ToolbarTooltip from './ToolbarTooltip.vue'
import { snackbarElements, useSnackbar } from '../composables/useSnackbar'
import '../style/collection-item-dialog.css'
import '../style/positive-button.css'
import '../style/version-history.css'

interface VersionEntry {
  id: number
  versionNumber: string
  description: string
  createdAt: string
  userId: string | null
}
const { t, locale } = useI18n({ useScope: 'global' })
const { show, dismissMessage } = useSnackbar()
const entries = ref<VersionEntry[]>([])
const open = ref(false)
const loading = ref(false)
const loadError = ref(false)
const saving = ref(false)
const error = ref('')
const versionNumber = ref('')
const description = ref('')
const transitioning = ref(false)
const trigger = ref<{ $el: HTMLButtonElement } | null>(null)
const canSave = computed(
  () => !!versionNumber.value.trim() && !!description.value.trim() && !saving.value,
)
let activeLoad: AbortController | undefined
let disposed = false
let savedVersion: string | undefined

async function load() {
  activeLoad?.abort()
  const request = new AbortController()
  activeLoad = request
  loading.value = true
  loadError.value = false
  try {
    const response = await fetch('/api/version-history', { signal: request.signal })
    if (!response.ok) throw new Error('Could not load version history')
    const result: VersionEntry[] = await response.json()
    if (
      !Array.isArray(result) ||
      result.some(
        (entry) => typeof entry.versionNumber !== 'string' || typeof entry.description !== 'string',
      )
    )
      throw new Error('Invalid version history')
    if (!request.signal.aborted) entries.value = result
  } catch {
    if (!request.signal.aborted) loadError.value = true
  } finally {
    if (!request.signal.aborted) loading.value = false
  }
}
onMounted(load)
onBeforeUnmount(() => {
  disposed = true
  activeLoad?.abort()
})

function prepare() {
  versionNumber.value = ''
  description.value = ''
  dismissMessage(error.value)
  error.value = ''
  void load()
}
function finishClose() {
  transitioning.value = false
  nextTick(() => trigger.value?.$el.focus({ preventScroll: true }))
  if (!savedVersion) return
  show('versionHistory.saved', 'success', { version: savedVersion })
  savedVersion = undefined
}
function dateLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(locale.value === 'fi' ? 'fi-FI' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}
async function save() {
  if (!canSave.value) return
  saving.value = true
  dismissMessage(error.value)
  error.value = ''
  try {
    const response = await fetch('/api/version-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        versionNumber: versionNumber.value.trim(),
        description: description.value.trim(),
      }),
    })
    if (disposed) return
    if (!response.ok) {
      error.value =
        response.status === 409
          ? 'versionHistory.duplicate'
          : response.status === 400
            ? 'versionHistory.validationError'
            : 'versionHistory.saveError'
      show(error.value, 'error')
      return
    }
    const entry: VersionEntry = await response.json()
    if (disposed) return
    activeLoad?.abort()
    loading.value = false
    entries.value = [entry, ...entries.value.filter((previous) => previous.id !== entry.id)]
    savedVersion = entry.versionNumber
    open.value = false
  } catch {
    if (!disposed) {
      error.value = 'versionHistory.saveError'
      show(error.value, 'error')
    }
  } finally {
    saving.value = false
  }
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
      v-slot="{ describedby }"
      :text="t('versionHistory.title')"
      class="version-history-tooltip"
    >
      <Dialog.Trigger
        ref="trigger"
        class="version-history-link"
        :aria-label="t('versionHistory.title')"
        :aria-describedby="describedby"
        :disabled="transitioning || saving"
        @click="prepare"
      >
        {{ entries[0]?.versionNumber ?? t('versionHistory.title') }}
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
            <Dialog.Content
              class="item-dialog version-history-dialog"
              :hidden="false"
              :aria-busy="saving"
            >
              <Dialog.Title class="item-dialog-title">{{ t('versionHistory.title') }}</Dialog.Title>
              <Dialog.Description class="item-dialog-description">{{
                t('versionHistory.introduction')
              }}</Dialog.Description>
              <form autocomplete="off" class="item-form" @submit.prevent="save">
                <fieldset class="item-form-fields" :disabled="saving">
                  <label class="item-form-field">
                    <span>{{ t('versionHistory.number') }}</span>
                    <input
                      v-model="versionNumber"
                      type="text"
                      name="VersionNumber"
                      required
                      maxlength="64"
                      autocomplete="off"
                    />
                  </label>
                  <label class="item-form-field">
                    <span>{{ t('versionHistory.changes') }}</span>
                    <textarea
                      v-model="description"
                      name="VersionDescription"
                      rows="4"
                      required
                      maxlength="20000"
                      autocomplete="off"
                    ></textarea>
                  </label>
                </fieldset>
                <p v-if="error" class="item-form-error" role="alert">{{ t(error) }}</p>
                <section
                  class="version-history-section"
                  :aria-label="t('versionHistory.history')"
                  :aria-busy="loading"
                >
                  <h3>{{ t('versionHistory.history') }}</h3>
                  <p v-if="loading" role="status">{{ t('versionHistory.loading') }}</p>
                  <div v-if="loadError">
                    <p class="item-form-error" role="alert">{{ t('versionHistory.loadError') }}</p>
                    <button type="button" :disabled="loading || saving" @click="load">
                      {{ t('collection.retry') }}
                    </button>
                  </div>
                  <p v-if="!loading && !loadError && !entries.length">
                    {{ t('versionHistory.empty') }}
                  </p>
                  <ol v-if="entries.length" class="version-history-list">
                    <li v-for="(entry, index) in entries" :key="entry.id">
                      <article>
                        <header class="version-history-entry-heading">
                          <h4>{{ entry.versionNumber }}</h4>
                          <time :datetime="entry.createdAt">{{ dateLabel(entry.createdAt) }}</time>
                        </header>
                        <p class="version-history-description">{{ entry.description }}</p>
                      </article>
                      <hr v-if="index < entries.length - 1" />
                    </li>
                  </ol>
                </section>
                <div class="item-dialog-actions">
                  <Dialog.CloseTrigger
                    type="button"
                    class="item-dialog-cancel"
                    :disabled="saving"
                    >{{ t('collection.cancel') }}</Dialog.CloseTrigger
                  >
                  <button
                    type="submit"
                    class="item-dialog-primary version-history-save"
                    :disabled="!canSave"
                  >
                    {{ t(saving ? 'itemForm.saving' : 'versionHistory.save') }}
                  </button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Positioner>
        </div>
      </Transition>
    </Teleport>
  </Dialog.Root>
</template>

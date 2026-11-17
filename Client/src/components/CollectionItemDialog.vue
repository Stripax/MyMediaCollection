<script setup lang="ts">
import { Dialog } from '@ark-ui/vue/dialog'
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })
const form = reactive({ MediaType: 1, Name: '', MediaFormat: 1, Info: '' })
const open = ref(false)
const saving = ref(false)
const error = ref('')
const saved = ref(false)

function clearMessages() {
  saved.value = false
  error.value = ''
}

async function save() {
  if (saving.value) return
  error.value = ''
  saved.value = false
  if (!form.Name.trim()) {
    error.value = 'itemForm.nameRequired'
    return
  }
  saving.value = true
  try {
    const response = await fetch('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, Name: form.Name.trim() }),
    })
    if (!response.ok) {
      error.value = response.status === 400 ? 'itemForm.validationError' : 'itemForm.saveError'
      return
    }
    Object.assign(form, { MediaType: 1, Name: '', MediaFormat: 1, Info: '' })
    open.value = false
    saved.value = true
  } catch {
    error.value = 'itemForm.saveError'
  } finally {
    saving.value = false
  }
}
const mediaTypes = [
  { value: 1, label: 'sidebar.movies' },
  { value: 2, label: 'sidebar.tvSeries' },
  { value: 3, label: 'sidebar.videoGames' },
  { value: 4, label: 'sidebar.boardGames' },
]
const mediaFormats = [
  { value: 1, label: 'DVD' },
  { value: 2, label: 'Blu-ray' },
  { value: 3, label: '4K UHD Blu-ray' },
]
</script>

<template>
  <Dialog.Root
    v-model:open="open"
    :close-on-escape="!saving"
    :close-on-interact-outside="!saving"
    lazy-mount
  >
    <Dialog.Trigger class="collection-test-button" @click="clearMessages">{{
      t('itemForm.testButton')
    }}</Dialog.Trigger>
    <Teleport to="body">
      <Dialog.Backdrop class="item-dialog-backdrop" />
      <Dialog.Positioner class="item-dialog-positioner">
        <Dialog.Content class="item-dialog">
          <Dialog.Title class="item-dialog-title">{{ t('itemForm.title') }}</Dialog.Title>
          <Dialog.Description class="item-dialog-description">
            {{ t('itemForm.description') }}
          </Dialog.Description>
          <form class="item-form" :aria-busy="saving" @submit.prevent="save">
            <fieldset class="item-form-fields" :disabled="saving">
              <label class="item-form-field">
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
              <label class="item-form-field">
                <span>{{ t('itemForm.mediaFormat') }}</span>
                <select v-model.number="form.MediaFormat" name="MediaFormat">
                  <option v-for="format in mediaFormats" :key="format.value" :value="format.value">
                    {{ format.label }}
                  </option>
                </select>
              </label>
              <label class="item-form-field">
                <span>{{ t('itemForm.info') }}</span>
                <textarea v-model="form.Info" name="Info" rows="4" maxlength="10000"></textarea>
              </label>
            </fieldset>
            <p v-if="error" class="item-form-error" role="alert">{{ t(error) }}</p>
            <div class="item-dialog-actions">
              <Dialog.CloseTrigger type="button" :disabled="saving">{{
                t('itemForm.close')
              }}</Dialog.CloseTrigger>
              <button type="submit" :disabled="saving">
                {{ t(saving ? 'itemForm.saving' : 'itemForm.save') }}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Positioner>
    </Teleport>
  </Dialog.Root>
  <p v-if="saved" role="status">{{ t('itemForm.saved') }}</p>
</template>

<style src="../style/collection-item-dialog.css"></style>

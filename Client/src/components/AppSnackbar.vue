<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { snackbarDuration, useSnackbar } from '../composables/useSnackbar'

const { t } = useI18n({ useScope: 'global' })
const { notice, dismiss } = useSnackbar()
const visibleNotices = computed(() => (notice.value ? [notice.value] : []))
let timer: ReturnType<typeof setTimeout> | undefined

watch(
  () => notice.value?.id,
  (id) => {
    clearTimeout(timer)
    if (id !== undefined) timer = setTimeout(() => dismiss(id), snackbarDuration)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearTimeout(timer)
  dismiss()
})
</script>

<template>
  <Teleport to="body">
    <div
      class="snackbar-region"
      data-snackbar-region
      aria-live="polite"
      :aria-label="t('snackbar.notifications')"
    >
      <TransitionGroup name="snackbar">
        <div
          v-for="message in visibleNotices"
          :key="message.id"
          class="snackbar"
          :class="`snackbar--${message.type}`"
          :role="message.type === 'error' ? 'alert' : 'status'"
          aria-atomic="true"
        >
          <div
            class="snackbar-timer"
            :style="{ animationDuration: `${snackbarDuration}ms` }"
            aria-hidden="true"
          ></div>
          <p class="snackbar-message">{{ t(message.messageKey, message.params) }}</p>
          <button
            class="snackbar-close"
            type="button"
            :aria-label="t('snackbar.close')"
            @click="dismiss(message.id)"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="m6 6 12 12M6 18 18 6" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style src="../style/snackbar.css"></style>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Translation, useI18n } from 'vue-i18n'
import { snackbarDuration, snackbarVisibleLimit, useSnackbar } from '../composables/useSnackbar'

const { t } = useI18n({ useScope: 'global' })
const { notices, dismiss } = useSnackbar()
// Reserve each slot until its exit animation ends so a queued notice cannot
// appear as a fourth visible card during that animation.
const slots = ref<number[]>([])
function fillSlots() {
  const waiting = notices.value
    .filter((message) => !slots.value.includes(message.id))
    .slice(0, snackbarVisibleLimit - slots.value.length)
  if (waiting.length) slots.value = [...slots.value, ...waiting.map((message) => message.id)]
}
watch(notices, fillSlots, { immediate: true })
const visibleNotices = computed(() =>
  slots.value
    .map((id) => notices.value.find((message) => message.id === id))
    .filter((message) => message !== undefined)
    .reverse(),
)
const activeId = computed(() => notices.value.find((message) => message.id === slots.value[0])?.id)

function prepareLeave(element: Element) {
  const card = element as HTMLElement
  card.style.top = `${card.offsetTop}px`
  card.inert = true
  card.setAttribute('aria-hidden', 'true')
}

function finishLeave(element: Element) {
  const id = Number((element as HTMLElement).dataset.snackbarId)
  slots.value = slots.value.filter((slot) => slot !== id)
  fillSlots()
}
let timer: ReturnType<typeof setTimeout> | undefined

watch(
  activeId,
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
      <TransitionGroup name="snackbar" @before-leave="prepareLeave" @after-leave="finishLeave">
        <div
          v-for="message in visibleNotices"
          :key="message.id"
          :data-snackbar-id="message.id"
          class="snackbar"
          :class="`snackbar--${message.type}`"
          :role="message.type === 'error' ? 'alert' : 'status'"
          aria-atomic="true"
        >
          <div
            v-if="message.id === activeId"
            class="snackbar-timer"
            :style="{ animationDuration: `${snackbarDuration}ms` }"
            aria-hidden="true"
          ></div>
          <Translation
            v-if="message.params.name !== undefined"
            :keypath="message.messageKey"
            tag="p"
            scope="global"
            class="snackbar-message"
          >
            <template v-for="(value, key) in message.params" :key="key" #[key]>
              <strong v-if="key === 'name'">{{ value }}</strong>
              <template v-else>{{ value }}</template>
            </template>
          </Translation>
          <p v-else class="snackbar-message">{{ t(message.messageKey, message.params) }}</p>
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

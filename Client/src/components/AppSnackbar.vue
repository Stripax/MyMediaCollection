<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Translation, useI18n } from 'vue-i18n'
import { snackbarDuration, snackbarVisibleLimit, useSnackbar } from '../composables/useSnackbar'

const { t } = useI18n({ useScope: 'global' })
const { notices, dismiss } = useSnackbar()
const emit = defineEmits<{ edit: [id: number, trigger: HTMLElement, noticeId: number] }>()
const hovered = ref<number[]>([])
const paused = computed(() => timerId.value !== undefined && hovered.value.includes(timerId.value))

function setHovered(id: number, value: boolean) {
  hovered.value = value
    ? [...hovered.value.filter((entry) => entry !== id), id]
    : hovered.value.filter((entry) => entry !== id)
}
// Reserve each slot until its exit animation ends so a queued notice cannot
// appear as a fourth visible card during that animation.
const slots = ref<number[]>([])
const entered = ref<number[]>([])
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
const timerId = computed(() =>
  activeId.value !== undefined && entered.value.includes(activeId.value)
    ? activeId.value
    : undefined,
)

function finishEnter(element: Element) {
  const id = Number((element as HTMLElement).dataset.snackbarId)
  if (notices.value.some((message) => message.id === id) && !entered.value.includes(id))
    entered.value = [...entered.value, id]
}

function prepareLeave(element: Element) {
  const card = element as HTMLElement
  const bounds = card.getBoundingClientRect()
  card.style.position = 'fixed'
  card.style.top = `${bounds.top}px`
  card.style.left = `${bounds.left}px`
  card.style.width = `${bounds.width}px`
  card.style.height = `${bounds.height}px`
  card.style.transform = ''
  card.inert = true
  card.setAttribute('aria-hidden', 'true')
}

function finishLeave(element: Element) {
  const id = Number((element as HTMLElement).dataset.snackbarId)
  slots.value = slots.value.filter((slot) => slot !== id)
  entered.value = entered.value.filter((entry) => entry !== id)
  hovered.value = hovered.value.filter((entry) => entry !== id)
  fillSlots()
}
let timer: ReturnType<typeof setTimeout> | undefined
let remaining = snackbarDuration
let startedAt: number | undefined

watch(
  [timerId, paused],
  ([id, isPaused], [previousId]) => {
    clearTimeout(timer)
    if (id !== previousId) remaining = snackbarDuration
    else if (startedAt !== undefined) remaining = Math.max(0, remaining - (Date.now() - startedAt))
    startedAt = undefined
    if (id !== undefined && !isPaused) {
      startedAt = Date.now()
      timer = setTimeout(() => dismiss(id), remaining)
    }
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
      <TransitionGroup
        name="snackbar"
        appear
        @after-enter="finishEnter"
        @before-leave="prepareLeave"
        @after-leave="finishLeave"
      >
        <div
          v-for="message in visibleNotices"
          :key="message.id"
          :data-snackbar-id="message.id"
          class="snackbar"
          :class="`snackbar--${message.type}`"
          :role="message.type === 'error' ? 'alert' : 'status'"
          aria-atomic="true"
          @mouseenter="setHovered(message.id, true)"
          @mouseleave="setHovered(message.id, false)"
        >
          <div
            v-if="message.id === timerId"
            class="snackbar-timer"
            :style="{
              animationDuration: `${snackbarDuration}ms`,
              animationPlayState: paused ? 'paused' : 'running',
            }"
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
              <button
                v-if="
                  key === 'name' &&
                  message.itemId &&
                  !message.messageKey.startsWith('collection.notifications.deleted.')
                "
                class="snackbar-item-link"
                type="button"
                @click="
                  emit('edit', message.itemId, $event.currentTarget as HTMLElement, message.id)
                "
              >
                <strong>{{ value }}</strong>
              </button>
              <strong v-else-if="key === 'name'">{{ value }}</strong>
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

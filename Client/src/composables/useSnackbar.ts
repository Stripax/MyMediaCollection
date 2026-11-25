import { computed, readonly, shallowRef } from 'vue'

export type SnackbarType = 'success' | 'error' | 'info'
export const snackbarDuration = 5000
export const snackbarVisibleLimit = 3

interface SnackbarNotice {
  id: number
  messageKey: string
  type: SnackbarType
  params: Record<string, string | number>
}

const notices = shallowRef<SnackbarNotice[]>([])
const notice = computed(() => notices.value[notices.value.length - 1] ?? null)
let nextId = 0

// Keep notifications interactive without dismissing an open Ark UI dialog.
export function snackbarElements() {
  const region = document.querySelector<HTMLElement>('[data-snackbar-region]')
  return region ? [() => region] : []
}

export function useSnackbar() {
  function show(
    messageKey: string,
    type: SnackbarType = 'info',
    params: SnackbarNotice['params'] = {},
  ) {
    notices.value = [...notices.value, { id: ++nextId, messageKey, type, params: { ...params } }]
  }

  function dismiss(id?: number) {
    notices.value = id === undefined ? [] : notices.value.filter((message) => message.id !== id)
  }

  function dismissMessage(messageKey: string) {
    notices.value = notices.value.filter((message) => message.messageKey !== messageKey)
  }

  return { notice: readonly(notice), notices: readonly(notices), show, dismiss, dismissMessage }
}

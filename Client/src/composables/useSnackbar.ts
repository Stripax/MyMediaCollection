import { readonly, shallowRef } from 'vue'

export type SnackbarType = 'success' | 'error' | 'info'
export const snackbarDuration = 5000

interface SnackbarNotice {
  id: number
  messageKey: string
  type: SnackbarType
  params: Record<string, string | number>
}

const notice = shallowRef<SnackbarNotice | null>(null)
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
    notice.value = { id: ++nextId, messageKey, type, params }
  }

  function dismiss(id?: number) {
    if (id === undefined || notice.value?.id === id) notice.value = null
  }

  function dismissMessage(messageKey: string) {
    if (notice.value?.messageKey === messageKey) dismiss()
  }

  return { notice: readonly(notice), show, dismiss, dismissMessage }
}

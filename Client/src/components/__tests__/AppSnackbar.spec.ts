import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import AppSnackbar from '../AppSnackbar.vue'
import { useSnackbar } from '../../composables/useSnackbar'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'

let wrapper: VueWrapper | undefined
const snackbar = useSnackbar()

beforeEach(() => {
  vi.useFakeTimers()
  snackbar.dismiss()
})

afterEach(() => {
  wrapper?.unmount()
  snackbar.dismiss()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

function mountSnackbar() {
  const i18n = createI18n({ legacy: false, locale: 'fi', messages: { en, fi } })
  wrapper = mount(AppSnackbar, { attachTo: document.body, global: { plugins: [i18n] } })
  return i18n
}

describe('App snackbar', () => {
  it('shows a green success notice with a top timer and dismisses it after five seconds', async () => {
    mountSnackbar()
    snackbar.show('itemForm.saved', 'success')
    await nextTick()
    const notice = document.querySelector<HTMLElement>('.snackbar--success')!
    expect(notice.textContent).toContain(fi.itemForm.saved)
    expect(notice.getAttribute('role')).toBe('status')
    expect(notice.querySelector<HTMLElement>('.snackbar-timer')!.style.animationDuration).toBe(
      '5000ms',
    )
    await vi.advanceTimersByTimeAsync(4999)
    expect(document.querySelector('.snackbar')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(document.querySelector('.snackbar')).toBeNull()
  })

  it('supports red errors, informational notices and closing with X', async () => {
    mountSnackbar()
    snackbar.show('itemForm.saveError', 'error')
    await nextTick()
    expect(document.querySelector('.snackbar--error')?.getAttribute('role')).toBe('alert')
    expect(document.querySelector('.snackbar--error')?.textContent).toContain(fi.itemForm.saveError)
    const close = document.querySelector<HTMLButtonElement>('.snackbar-close')!
    expect(close.getAttribute('aria-label')).toBe(fi.snackbar.close)
    close.click()
    await nextTick()
    expect(snackbar.notice.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    snackbar.show('itemForm.updated', 'info')
    await nextTick()
    expect(document.querySelector('.snackbar--info')?.getAttribute('role')).toBe('status')
  })

  it('replaces an old notice and starts a fresh five-second timer', async () => {
    mountSnackbar()
    snackbar.show('itemForm.saved', 'success')
    await nextTick()
    const oldId = snackbar.notice.value!.id
    await vi.advanceTimersByTimeAsync(3000)
    snackbar.show('collection.deleteError', 'error')
    await nextTick()
    snackbar.dismiss(oldId)
    await vi.advanceTimersByTimeAsync(2000)
    expect(snackbar.notice.value?.messageKey).toBe('collection.deleteError')
    await vi.advanceTimersByTimeAsync(2999)
    expect(snackbar.notice.value).not.toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(snackbar.notice.value).toBeNull()
  })

  it('updates the language without restarting the timer and clears timers when unmounted', async () => {
    const i18n = mountSnackbar()
    snackbar.show('itemForm.saved', 'success')
    await nextTick()
    await vi.advanceTimersByTimeAsync(3000)
    i18n.global.locale.value = 'en'
    await nextTick()
    expect(document.querySelector('.snackbar')?.textContent).toContain(en.itemForm.saved)
    expect(document.querySelector('.snackbar-close')?.getAttribute('aria-label')).toBe(
      en.snackbar.close,
    )
    await vi.advanceTimersByTimeAsync(2000)
    expect(snackbar.notice.value).toBeNull()
    snackbar.show('itemForm.saved', 'success')
    await nextTick()
    wrapper!.unmount()
    wrapper = undefined
    expect(vi.getTimerCount()).toBe(0)
    expect(snackbar.notice.value).toBeNull()
  })
})

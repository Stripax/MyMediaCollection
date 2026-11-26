import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, onBeforeUpdate, onUpdated, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import AppSnackbar from '../AppSnackbar.vue'
import { useSnackbar } from '../../composables/useSnackbar'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'
import { itemNoticeKey } from '../../models/itemNotices'

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

function mountSnackbar(realTransitions = false) {
  const i18n = createI18n({ legacy: false, locale: 'fi', messages: { en, fi } })
  wrapper = mount(AppSnackbar, {
    attachTo: document.body,
    global: {
      plugins: [i18n],
      stubs: {
        'transition-group': realTransitions
          ? false
          : defineComponent({
              inheritAttrs: false,
              setup(_, { attrs, slots }) {
                const root = ref<HTMLElement>()
                let previous: Element[] = []
                onBeforeUpdate(() => {
                  previous = Array.from(root.value?.children ?? [])
                })
                onUpdated(() => {
                  for (const element of Array.from(root.value?.children ?? [])) {
                    if (!previous.includes(element))
                      (attrs.onAfterEnter as ((element: Element) => void) | undefined)?.(element)
                  }
                  for (const element of previous) {
                    if (!root.value?.contains(element))
                      (attrs.onAfterLeave as ((element: Element) => void) | undefined)?.(element)
                  }
                })
                return () => h('div', { ref: root }, slots.default?.())
              },
            }),
      },
    },
  })
  return i18n
}

describe('App snackbar', () => {
  it('pauses the countdown and progress bar on hover and resumes only the remaining time', async () => {
    mountSnackbar()
    snackbar.show(itemNoticeKey('saved', 1), 'success', { name: 'Game' }, 42)
    await nextTick()
    const card = document.querySelector<HTMLElement>('.snackbar')!
    await vi.advanceTimersByTimeAsync(1500)
    card.dispatchEvent(new MouseEvent('mouseenter'))
    await nextTick()
    expect(card.querySelector<HTMLElement>('.snackbar-timer')!.style.animationPlayState).toBe(
      'paused',
    )
    await vi.advanceTimersByTimeAsync(10000)
    expect(snackbar.notices.value).toHaveLength(1)
    card.dispatchEvent(new MouseEvent('mouseleave'))
    await nextTick()
    expect(card.querySelector<HTMLElement>('.snackbar-timer')!.style.animationPlayState).toBe(
      'running',
    )
    await vi.advanceTimersByTimeAsync(500)
    card.dispatchEvent(new MouseEvent('mouseenter'))
    await nextTick()
    await vi.advanceTimersByTimeAsync(4000)
    card.dispatchEvent(new MouseEvent('mouseleave'))
    await nextTick()
    await vi.advanceTimersByTimeAsync(1999)
    expect(snackbar.notices.value).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(snackbar.notices.value).toHaveLength(0)
  })

  it('pauses an already hovered queued card when it becomes the bottom card', async () => {
    mountSnackbar()
    snackbar.show('itemForm.saved', 'success', { name: 'A' })
    snackbar.show('itemForm.saved', 'success', { name: 'B' })
    await nextTick()
    const upper = document.querySelector<HTMLElement>('.snackbar')!
    upper.dispatchEvent(new MouseEvent('mouseenter'))
    await nextTick()
    await vi.advanceTimersByTimeAsync(4000)
    expect(snackbar.notices.value).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(10000)
    expect(snackbar.notices.value).toHaveLength(1)
    upper.dispatchEvent(new MouseEvent('mouseleave'))
    await nextTick()
    await vi.advanceTimersByTimeAsync(3999)
    expect(snackbar.notices.value).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(snackbar.notices.value).toHaveLength(0)
  })

  it.each(['saved', 'updated'] as const)(
    'opens the item from its %s name without surrounding quotes',
    async (action) => {
      mountSnackbar()
      snackbar.show(itemNoticeKey(action, 1), 'success', { name: 'Example movie' }, 42)
      await nextTick()
      const link = document.querySelector<HTMLButtonElement>('.snackbar-item-link')!
      expect(link.textContent).toBe('Example movie')
      expect(document.querySelector('.snackbar-message')!.textContent).not.toMatch(/[“”"]/)
      link.click()
      expect(wrapper!.emitted('edit')?.[0]).toEqual([42, link, snackbar.notice.value!.id])
    },
  )

  it('keeps deleted names as plain text and disables older links to a deleted item', async () => {
    mountSnackbar()
    snackbar.show(itemNoticeKey('updated', 1), 'success', { name: 'Movie' }, 42)
    snackbar.show(itemNoticeKey('deleted', 1), 'success', { name: 'Movie' }, 42)
    await nextTick()
    expect(document.querySelectorAll('.snackbar-item-link')).toHaveLength(1)
    snackbar.disableItemLinks(42)
    await nextTick()
    expect(document.querySelectorAll('.snackbar-item-link')).toHaveLength(0)
    expect(document.querySelectorAll('.snackbar-message strong')).toHaveLength(2)
  })

  it('starts the four-second countdown only after the enter transition finishes', async () => {
    mountSnackbar(true)
    snackbar.show('itemForm.saved', 'success', { name: 'Example game' })
    await nextTick()
    const card = document.querySelector<HTMLElement>('.snackbar')!
    card.style.transitionProperty = 'opacity'
    card.style.transitionDuration = '0.5s'
    card.style.transitionDelay = '0s'
    await vi.advanceTimersByTimeAsync(40)
    expect(card.classList.contains('snackbar-enter-to')).toBe(true)
    expect(document.querySelector('.snackbar-timer')).toBeNull()
    card.dispatchEvent(new Event('transitionend', { bubbles: true }))
    await nextTick()
    expect(document.querySelector('.snackbar-timer')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(3999)
    expect(snackbar.notices.value).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(snackbar.notices.value).toHaveLength(0)
    expect(document.body.contains(card)).toBe(true)
    await vi.advanceTimersByTimeAsync(540)
    expect(document.body.contains(card)).toBe(false)
  })

  it('keeps a card visible during its Vue leave transition when closed with X', async () => {
    vi.useRealTimers()
    mountSnackbar(true)
    snackbar.show('itemForm.saved', 'success', { name: 'Example game' })
    await nextTick()
    const card = document.querySelector<HTMLElement>('.snackbar')!
    await vi.waitFor(() => expect(card.classList.contains('snackbar-enter-active')).toBe(false))
    // Supply computed timing in jsdom, which does not load the component's CSS.
    card.style.transitionProperty = 'opacity'
    card.style.transitionDuration = '0.5s'
    card.style.transitionDelay = '0s'
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(new DOMRect(900, 300, 400, 80))
    card.querySelector<HTMLButtonElement>('.snackbar-close')!.click()
    await nextTick()
    expect(snackbar.notices.value).toHaveLength(0)
    expect(document.body.contains(card)).toBe(true)
    expect(card.classList.contains('snackbar-leave-active')).toBe(true)
    expect(card.inert).toBe(true)
    expect(card.style.position).toBe('fixed')
    expect(card.style.top).toBe('300px')
    expect(card.style.left).toBe('900px')
    expect(card.style.width).toBe('400px')
    expect(card.style.height).toBe('80px')
    await vi.waitFor(() => expect(card.classList.contains('snackbar-leave-to')).toBe(true))
    card.dispatchEvent(new Event('transitionend', { bubbles: true }))
    await vi.waitFor(() => expect(document.body.contains(card)).toBe(false))
  })

  it('reserves a closing card slot until the real Vue exit transition finishes', async () => {
    vi.useRealTimers()
    mountSnackbar(true)
    for (const name of ['A', 'B', 'C', 'D'])
      snackbar.show(itemNoticeKey('deleted', 1), 'success', { name })
    await nextTick()
    const bottom = Array.from(document.querySelectorAll<HTMLElement>('.snackbar')).find(
      (card) => card.querySelector('strong')?.textContent === 'A',
    )!
    snackbar.dismiss(Number(bottom.dataset.snackbarId))
    await nextTick()
    expect(document.querySelectorAll('.snackbar').length).toBeLessThanOrEqual(3)
    expect(document.querySelectorAll('.snackbar strong').length).toBeLessThanOrEqual(3)
    await vi.waitFor(() =>
      expect(
        Array.from(document.querySelectorAll('.snackbar strong')).map(
          (element) => element.textContent,
        ),
      ).toEqual(['D', 'C', 'B']),
    )
    expect(document.querySelectorAll('.snackbar')).toHaveLength(3)
    expect(document.querySelectorAll('.snackbar-timer')).toHaveLength(1)
  })
  it.each(['saved', 'updated', 'deleted'] as const)(
    'localizes category-specific %s messages while preserving the name',
    async (action) => {
      const i18n = mountSnackbar()
      snackbar.show(itemNoticeKey(action, 2), 'success', { name: 'Example series' })
      await nextTick()
      expect(document.querySelector('.snackbar-message strong')?.textContent).toBe('Example series')
      expect(document.querySelector('.snackbar')?.textContent).toContain(
        fi.collection.notifications[action].tvSeries.replace('{name}', 'Example series'),
      )
      i18n.global.locale.value = 'en'
      await nextTick()
      expect(document.querySelector('.snackbar-message strong')?.textContent).toBe('Example series')
      expect(document.querySelector('.snackbar')?.textContent).toContain(
        en.collection.notifications[action].tvSeries.replace('{name}', 'Example series'),
      )
    },
  )
  it('shows a green success notice with a top timer and dismisses it after four seconds', async () => {
    mountSnackbar()
    snackbar.show('itemForm.saved', 'success', { name: 'Example game' })
    await nextTick()
    const notice = document.querySelector<HTMLElement>('.snackbar--success')!
    expect(notice.textContent).toContain(fi.itemForm.saved.replace('{name}', 'Example game'))
    expect(notice.getAttribute('role')).toBe('status')
    expect(notice.querySelector<HTMLElement>('.snackbar-timer')!.style.animationDuration).toBe(
      '4000ms',
    )
    await vi.advanceTimersByTimeAsync(3999)
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
    snackbar.show('itemForm.updated', 'info', { name: 'Example game' })
    await nextTick()
    expect(document.querySelector('.snackbar--info')?.getAttribute('role')).toBe('status')
  })

  it('keeps the oldest notice at the bottom and starts the next timer only after it leaves', async () => {
    mountSnackbar()
    snackbar.show('itemForm.saved', 'success', { name: 'Example game' })
    await nextTick()
    await vi.advanceTimersByTimeAsync(3000)
    snackbar.show('collection.deleteError', 'error')
    await nextTick()
    expect(document.querySelectorAll('.snackbar')).toHaveLength(2)
    expect(document.querySelectorAll('.snackbar-timer')).toHaveLength(1)
    expect(
      document
        .querySelector('.snackbar-timer')
        ?.closest('.snackbar')
        ?.classList.contains('snackbar--success'),
    ).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(document.querySelectorAll('.snackbar')).toHaveLength(1)
    expect(snackbar.notice.value?.messageKey).toBe('collection.deleteError')
    await vi.advanceTimersByTimeAsync(3999)
    expect(snackbar.notice.value).not.toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(snackbar.notice.value).toBeNull()
  })

  it('shows at most three cards with the newest on top and drains queued notices in arrival order', async () => {
    mountSnackbar()
    const names = () =>
      Array.from(document.querySelectorAll('.snackbar strong')).map(
        (element) => element.textContent,
      )
    for (const name of ['A', 'B', 'C', 'D', 'E'])
      snackbar.show(itemNoticeKey('deleted', 1), 'success', { name })
    await nextTick()
    expect(names()).toEqual(['C', 'B', 'A'])
    expect(snackbar.notices.value).toHaveLength(5)
    expect(document.querySelectorAll('.snackbar-timer')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(4000)
    expect(names()).toEqual(['D', 'C', 'B'])
    await vi.advanceTimersByTimeAsync(4000)
    expect(names()).toEqual(['E', 'D', 'C'])
    await vi.advanceTimersByTimeAsync(4000)
    expect(names()).toEqual(['E', 'D'])
    await vi.advanceTimersByTimeAsync(4000)
    expect(names()).toEqual(['E'])
    await vi.advanceTimersByTimeAsync(4000)
    expect(names()).toEqual([])
    expect(snackbar.notices.value).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('fills an upper slot after X without resetting the bottom timer', async () => {
    mountSnackbar()
    for (const name of ['A', 'B', 'C', 'D'])
      snackbar.show(itemNoticeKey('saved', 1), 'success', { name })
    await nextTick()
    await vi.advanceTimersByTimeAsync(2000)
    const middle = Array.from(document.querySelectorAll('.snackbar')).find(
      (card) => card.querySelector('strong')?.textContent === 'B',
    )!
    middle.querySelector<HTMLButtonElement>('button')!.click()
    await nextTick()
    expect(
      Array.from(document.querySelectorAll('.snackbar strong')).map(
        (element) => element.textContent,
      ),
    ).toEqual(['D', 'C', 'A'])
    await vi.advanceTimersByTimeAsync(2000)
    expect(
      Array.from(document.querySelectorAll('.snackbar strong')).map(
        (element) => element.textContent,
      ),
    ).toEqual(['D', 'C'])
    await vi.advanceTimersByTimeAsync(3999)
    expect(document.querySelectorAll('.snackbar')).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(document.querySelectorAll('.snackbar')).toHaveLength(1)
    expect(document.querySelector('.snackbar strong')?.textContent).toBe('D')
  })

  it('starts a full timer for the next card after closing the bottom one early', async () => {
    mountSnackbar()
    for (const name of ['A', 'B']) snackbar.show(itemNoticeKey('saved', 1), 'success', { name })
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)
    const bottom = Array.from(document.querySelectorAll('.snackbar')).find(
      (card) => card.querySelector('strong')?.textContent === 'A',
    )!
    bottom.querySelector<HTMLButtonElement>('button')!.click()
    await nextTick()
    await vi.advanceTimersByTimeAsync(3999)
    expect(document.querySelector('.snackbar strong')?.textContent).toBe('B')
    await vi.advanceTimersByTimeAsync(1)
    expect(snackbar.notices.value).toHaveLength(0)
  })

  it('removes matching error messages from both visible slots and the hidden queue', async () => {
    mountSnackbar()
    snackbar.show('collection.deleteError', 'error')
    snackbar.show(itemNoticeKey('saved', 1), 'success', { name: 'Keep me' })
    snackbar.show('collection.deleteError', 'error')
    snackbar.show('collection.deleteError', 'error')
    await nextTick()
    snackbar.dismissMessage('collection.deleteError')
    await nextTick()
    expect(snackbar.notices.value).toHaveLength(1)
    expect(document.querySelectorAll('.snackbar')).toHaveLength(1)
    expect(document.querySelector('.snackbar strong')?.textContent).toBe('Keep me')
    expect(vi.getTimerCount()).toBe(1)
  })

  it('updates the language without restarting the timer and clears timers when unmounted', async () => {
    const i18n = mountSnackbar()
    snackbar.show('itemForm.saved', 'success', { name: 'Example game' })
    await nextTick()
    await vi.advanceTimersByTimeAsync(3000)
    i18n.global.locale.value = 'en'
    await nextTick()
    expect(document.querySelector('.snackbar')?.textContent).toContain(
      en.itemForm.saved.replace('{name}', 'Example game'),
    )
    expect(document.querySelector('.snackbar-close')?.getAttribute('aria-label')).toBe(
      en.snackbar.close,
    )
    await vi.advanceTimersByTimeAsync(1000)
    expect(snackbar.notice.value).toBeNull()
    snackbar.show('itemForm.saved', 'success', { name: 'Example game' })
    await nextTick()
    wrapper!.unmount()
    wrapper = undefined
    expect(vi.getTimerCount()).toBe(0)
    expect(snackbar.notice.value).toBeNull()
  })
})

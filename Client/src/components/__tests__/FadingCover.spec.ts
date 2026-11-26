import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import FadingCover from '../FadingCover.vue'

let wrapper: VueWrapper | undefined
let styles: HTMLStyleElement | undefined
afterEach(() => {
  wrapper?.unmount()
  styles?.remove()
  document.body.innerHTML = ''
})

describe('Fading cover', () => {
  it('crossfades the old and new covers inside a fixed-size frame', async () => {
    styles = document.createElement('style')
    styles.textContent =
      '.cover-fade-enter-active, .cover-fade-leave-active { transition-property: opacity; transition-duration: 0.3s; }'
    document.head.append(styles)
    wrapper = mount(FadingCover, {
      props: { src: '/first.jpg', width: 120, height: 180, alt: 'Box' },
      attachTo: document.body,
      global: { stubs: { transition: false } },
    })
    const first = wrapper.get('img').element
    await wrapper.setProps({ src: '/second.jpg' })
    expect(wrapper.findAll('img')).toHaveLength(2)
    expect(first.classList.contains('cover-fade-leave-active')).toBe(true)
    expect(first.getAttribute('aria-hidden')).toBe('true')
    expect(wrapper.get('img[src="/second.jpg"]').classes()).toContain('cover-fade-enter-active')
    expect((wrapper.element as HTMLElement).style.width).toBe('120px')
    expect((wrapper.element as HTMLElement).style.height).toBe('180px')
    await vi.waitFor(() => expect(first.classList.contains('cover-fade-leave-to')).toBe(true))
    first.dispatchEvent(new Event('transitionend', { bubbles: true }))
    await vi.waitFor(() => expect(first.isConnected).toBe(false))
    expect(wrapper.get('img').attributes('src')).toBe('/second.jpg')
    expect(wrapper.get('img').attributes('aria-hidden')).toBeUndefined()
  })

  it('reports the actual failed URL when the departing image errors after a source change', async () => {
    wrapper = mount(FadingCover, {
      props: { src: '/first.jpg', width: 92, height: 138 },
      global: { stubs: { transition: false } },
    })
    const previous = wrapper.get('img').element
    await wrapper.setProps({ src: '/second.jpg' })
    previous.dispatchEvent(new Event('error'))
    expect(wrapper.emitted('error')?.[0]).toEqual(['/first.jpg'])
  })
})

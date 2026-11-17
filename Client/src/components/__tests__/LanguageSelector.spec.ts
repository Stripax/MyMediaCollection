import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import App from '../../App.vue'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'

let wrapper: VueWrapper | undefined
const originalTitle = document.title

function mountApp() {
  wrapper = mount(App, {
    attachTo: document.body,
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en, fi } })],
    },
  })
  return wrapper
}

beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    clear: () => storage.clear(),
  })
})

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.lang = ''
  document.title = originalTitle
  vi.unstubAllGlobals()
})

describe('Language selector', () => {
  it('changes the global language and saves the selected language', async () => {
    const app = mountApp()
    await app.get('.language-trigger').trigger('click')
    await vi.waitFor(() =>
      expect(app.get('.language-trigger').attributes('aria-expanded')).toBe('true'),
    )
    const finnish = document.querySelector<HTMLElement>('[role="menuitemradio"][data-value="fi"]')
    expect(finnish).not.toBeNull()
    finnish!.click()

    await app.vm.$nextTick()
    expect(app.get('h1').text()).toBe(fi.header)
    expect(app.get('.language-trigger').text()).toBe('🇫🇮Suomi')
    expect(document.documentElement.lang).toBe('fi')
    expect(document.title).toBe(fi.title)
    expect(localStorage.getItem('mmc-language')).toBe('fi')
  })

  it.each(['en', 'fi'])('restores the stored %s language', async (language) => {
    localStorage.setItem('mmc-language', language)
    const app = mountApp()
    await app.vm.$nextTick()
    expect(document.documentElement.lang).toBe(language)
    expect(document.title).toBe(language === 'fi' ? fi.title : en.title)
    expect(app.get('h1').text()).toBe(language === 'fi' ? fi.header : en.header)
    expect(app.get('.language-trigger').text()).toBe(language === 'fi' ? '🇫🇮Suomi' : '🇬🇧English')
    await app.get('.language-trigger').trigger('click')
    expect(
      document
        .querySelector(`[data-value="${language}"][role="menuitemradio"]`)
        ?.getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('opens with ArrowDown and closes with Escape', async () => {
    const app = mountApp()
    const trigger = app.get('.language-trigger')
    ;(trigger.element as HTMLButtonElement).focus()
    await app.vm.$nextTick()
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await vi.waitFor(() => expect(trigger.attributes('aria-expanded')).toBe('true'))
    document
      .querySelector('[role="menu"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await app.vm.$nextTick()
    await vi.waitFor(() => expect(trigger.attributes('aria-expanded')).toBe('false'))
  })
})

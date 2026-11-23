import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../../router'
import App from '../../App.vue'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'

let wrapper: VueWrapper | undefined
const originalTitle = document.title

async function mountApp() {
  const router = createAppRouter(createMemoryHistory())
  await router.push('/')
  await router.isReady()
  wrapper = mount(App, {
    attachTo: document.body,
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en, fi } }), router],
    },
  })
  return wrapper
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
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
  it('selects and persists all themes from the settings menu', async () => {
    const app = await mountApp()
    const trigger = app.get('.theme-trigger')
    expect(document.documentElement.dataset.theme).toBe('light')
    for (const theme of ['dark', 'black', 'light']) {
      await trigger.trigger('click')
      await vi.waitFor(() => expect(trigger.attributes('aria-expanded')).toBe('true'))
      document.querySelector<HTMLElement>(`[role="menuitemradio"][data-value="${theme}"]`)!.click()
      await app.vm.$nextTick()
      expect(document.documentElement.dataset.theme).toBe(theme)
      expect(localStorage.getItem('mmc-theme')).toBe(theme)
      await vi.waitFor(() => expect(trigger.attributes('aria-expanded')).toBe('false'))
    }
  })

  it.each(['en', 'fi'])('restores black mode with its %s menu label', async (language) => {
    localStorage.setItem('mmc-language', language)
    localStorage.setItem('mmc-theme', 'black')
    const app = await mountApp()
    expect(document.documentElement.dataset.theme).toBe('black')
    await app.get('.theme-trigger').trigger('click')
    const blackMode = document.querySelector('[role="menuitemradio"][data-value="black"]')!
    expect(blackMode.getAttribute('aria-checked')).toBe('true')
    expect(blackMode.textContent).toContain(language === 'fi' ? 'Musta tila' : 'Black mode')
  })

  it('restores the saved dark theme and exposes the external Github link', async () => {
    localStorage.setItem('mmc-theme', 'dark')
    const app = await mountApp()
    expect(document.documentElement.dataset.theme).toBe('dark')
    const github = app.get('a[aria-label="Github"]')
    expect(github.attributes('href')).toBe('https://github.com/Stripax/MyMediaCollection')
    expect(github.attributes('target')).toBe('_blank')
    expect(github.attributes('rel')).toContain('noopener')
    await app.get('.login-button').trigger('click')
    expect(app.find('[role="dialog"]').exists()).toBe(false)
  })

  it('shows localized tooltips only on hover and dismisses with Escape', async () => {
    localStorage.setItem('mmc-language', 'fi')
    const app = await mountApp()
    const trigger = app.get('.theme-trigger')
    const tooltip = trigger.element.closest('.toolbar-tooltip')!
    tooltip.dispatchEvent(new MouseEvent('mouseenter'))
    await app.vm.$nextTick()
    expect(app.get('[role="tooltip"]').text()).toBe('Teemat ja lisätiedot')
    expect(trigger.attributes('aria-describedby')).toBe(
      app.get('[role="tooltip"]').attributes('id'),
    )
    tooltip.dispatchEvent(new MouseEvent('mouseleave'))
    await app.vm.$nextTick()
    expect(app.find('[role="tooltip"]').exists()).toBe(false)
    await trigger.trigger('focusin')
    expect(app.find('[role="tooltip"]').exists()).toBe(false)
    tooltip.dispatchEvent(new MouseEvent('mouseenter'))
    await app.vm.$nextTick()
    expect(app.get('[role="tooltip"]').text()).toBe('Teemat ja lisätiedot')
    await trigger.trigger('keydown', { key: 'Escape' })
    expect(app.find('[role="tooltip"]').exists()).toBe(false)
    expect(app.get('.login-button').text()).toBe('Kirjautuminen')
  })

  it.each([
    ['.theme-trigger', 'black'],
    ['.language-trigger', 'fi'],
  ])('keeps the tooltip hidden after selecting an option from %s', async (selector, value) => {
    const app = await mountApp()
    const trigger = app.get(selector)
    const tooltip = trigger.element.closest('.toolbar-tooltip')!
    tooltip.dispatchEvent(new MouseEvent('mouseenter'))
    await app.vm.$nextTick()
    expect(app.find('[role="tooltip"]').exists()).toBe(true)
    await trigger.trigger('click')
    await vi.waitFor(() => expect(trigger.attributes('aria-expanded')).toBe('true'))
    tooltip.dispatchEvent(new MouseEvent('mouseleave'))
    document.querySelector<HTMLElement>(`[role="menuitemradio"][data-value="${value}"]`)!.click()
    await vi.waitFor(() => expect(trigger.attributes('aria-expanded')).toBe('false'))
    ;(trigger.element as HTMLButtonElement).focus()
    await app.vm.$nextTick()
    expect(app.find('[role="tooltip"]').exists()).toBe(false)
    tooltip.dispatchEvent(new MouseEvent('mouseenter'))
    await app.vm.$nextTick()
    expect(app.find('[role="tooltip"]').exists()).toBe(true)
  })

  it('changes the global language and saves the selected language', async () => {
    const app = await mountApp()
    await app.get('.language-trigger').trigger('click')
    await vi.waitFor(() =>
      expect(app.get('.language-trigger').attributes('aria-expanded')).toBe('true'),
    )
    const finnish = document.querySelector<HTMLElement>('[role="menuitemradio"][data-value="fi"]')
    expect(finnish).not.toBeNull()
    finnish!.click()

    await app.vm.$nextTick()
    expect(app.get('h1').text()).toBe(fi.header)
    expect(app.get('.language-trigger').text()).toBe('')
    expect(app.get('.language-trigger').attributes('aria-label')).toBe(fi.selectLanguage)
    expect(document.documentElement.lang).toBe('fi')
    expect(document.title).toBe(fi.title)
    expect(localStorage.getItem('mmc-language')).toBe('fi')
  })

  it.each(['en', 'fi'])('restores the stored %s language', async (language) => {
    localStorage.setItem('mmc-language', language)
    const app = await mountApp()
    await app.vm.$nextTick()
    expect(document.documentElement.lang).toBe(language)
    expect(document.title).toBe(language === 'fi' ? fi.title : en.title)
    expect(app.get('h1').text()).toBe(language === 'fi' ? fi.header : en.header)
    expect(app.get('.language-trigger').text()).toBe('')
    expect(app.get('.language-trigger svg').attributes('aria-hidden')).toBe('true')
    expect(app.get('.language-trigger').attributes('aria-label')).toBe(
      language === 'fi' ? fi.selectLanguage : en.selectLanguage,
    )
    await app.get('.language-trigger').trigger('click')
    expect(
      document.querySelector('[role="menuitemradio"][data-value="fi"]')?.textContent,
    ).toContain('🇫🇮Suomi')
    expect(
      document.querySelector('[role="menuitemradio"][data-value="en"]')?.textContent,
    ).toContain('🇬🇧English')
    expect(
      document
        .querySelector(`[data-value="${language}"][role="menuitemradio"]`)
        ?.getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('opens with ArrowDown and closes with Escape', async () => {
    const app = await mountApp()
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

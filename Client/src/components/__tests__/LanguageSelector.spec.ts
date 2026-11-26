import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../../router'
import App from '../../App.vue'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'
import finnishFlag from '../../assets/flags/fi.svg'
import englishFlag from '../../assets/flags/gb.svg'

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
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US'])
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US')
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
  vi.restoreAllMocks()
})

describe('Language selector', () => {
  it.each([
    ['fi-FI', 'fi'],
    ['fi', 'fi'],
    ['FI-fi', 'fi'],
    ['en-US', 'en'],
    ['sv-FI', 'en'],
    ['fil-PH', 'en'],
  ])(
    'uses the preferred device language %s on the first visit (%s)',
    async (preferred, expected) => {
      vi.spyOn(navigator, 'languages', 'get').mockReturnValue([preferred, 'fi-FI'])
      const app = await mountApp()
      expect(document.documentElement.lang).toBe(expected)
      expect(document.title).toBe(expected === 'fi' ? fi.title : en.title)
      expect(localStorage.getItem('mmc-language')).toBe(expected)
      expect(app.get('h1').text()).toBe(expected === 'fi' ? fi.header : en.header)
    },
  )

  it('uses navigator.language when the preferred language list is unavailable', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue([])
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('fi-FI')
    await mountApp()
    expect(document.documentElement.lang).toBe('fi')
  })

  it('falls back to English and the light theme when device settings cannot be read', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockImplementation(() => {
      throw new Error('Unavailable')
    })
    vi.stubGlobal('matchMedia', undefined)
    await mountApp()
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it.each([true, false])(
    'uses the device dark-mode preference on the first visit (%s)',
    async (dark) => {
      vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: dark }))
      await mountApp()
      expect(document.documentElement.dataset.theme).toBe(dark ? 'dark' : 'light')
      expect(localStorage.getItem('mmc-theme')).toBe(dark ? 'dark' : 'light')
    },
  )

  it.each(['light', 'dark', 'black'])(
    'preserves the saved %s theme and saved English language over device settings',
    async (theme) => {
      localStorage.setItem('mmc-theme', theme)
      localStorage.setItem('mmc-language', 'en')
      vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fi-FI'])
      vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: theme !== 'dark' }))
      await mountApp()
      expect(document.documentElement.dataset.theme).toBe(theme)
      expect(document.documentElement.lang).toBe('en')
    },
  )

  it('uses device defaults without failing when browser storage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Blocked')
      },
      setItem: () => {
        throw new Error('Blocked')
      },
      clear: () => {},
    })
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fi-FI'])
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    await mountApp()
    expect(document.documentElement.lang).toBe('fi')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('uses the current rain speed and brightness as defaults and updates them live', async () => {
    localStorage.setItem('mmc-theme', 'black')
    const app = await mountApp()
    await app.get('.theme-trigger').trigger('click')
    const menu = new DOMWrapper(document.querySelector<HTMLElement>('.theme-menu')!)
    expect((menu.get('input[name="MatrixRainSpeed"]').element as HTMLInputElement).value).toBe(
      '100',
    )
    expect((menu.get('input[name="MatrixRainBrightness"]').element as HTMLInputElement).value).toBe(
      '55',
    )
    expect((app.get('.matrix-rain').element as HTMLElement).style.opacity).toBe('0.55')
    await menu.get('input[name="MatrixRainSpeed"]').setValue(150)
    await menu.get('input[name="MatrixRainBrightness"]').setValue(80)
    expect((menu.get('input[name="MatrixRainDensity"]').element as HTMLInputElement).value).toBe(
      '100',
    )
    expect(app.findAll('.matrix-rain-column')).toHaveLength(48)
    const firstColumn = app.get('.matrix-rain-column').text()
    await menu.get('input[name="MatrixRainDensity"]').setValue(200)
    expect(app.findAll('.matrix-rain-column')).toHaveLength(96)
    expect(app.get('.matrix-rain-column').text()).toBe(firstColumn)
    expect(localStorage.getItem('mmc-matrix-rain-density')).toBe('200')
    expect(
      (app.get('.matrix-rain').element as HTMLElement).style.getPropertyValue('--rain-speed'),
    ).toBe('1.5')
    expect((app.get('.matrix-rain').element as HTMLElement).style.opacity).toBe('0.8')
    expect(localStorage.getItem('mmc-matrix-rain-speed')).toBe('150')
    expect(localStorage.getItem('mmc-matrix-rain-brightness')).toBe('80')
    expect(app.get('.theme-trigger').attributes('aria-expanded')).toBe('true')
    await menu.get('input[name="MatrixRainSpeed"]').trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).not.toBe(app.get('.theme-trigger').element)
    menu
      .get('.matrix-rain-toggle')
      .element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await app.vm.$nextTick()
    expect(menu.find('.matrix-rain-settings').exists()).toBe(false)
    expect(localStorage.getItem('mmc-matrix-rain-speed')).toBe('150')
    expect(localStorage.getItem('mmc-matrix-rain-brightness')).toBe('80')
    await menu.get('.matrix-rain-toggle').trigger('click')
    expect((menu.get('input[name="MatrixRainDensity"]').element as HTMLInputElement).value).toBe(
      '200',
    )
    expect(app.findAll('.matrix-rain-column')).toHaveLength(96)
    expect((menu.get('input[name="MatrixRainSpeed"]').element as HTMLInputElement).value).toBe(
      '150',
    )
    expect((menu.get('input[name="MatrixRainBrightness"]').element as HTMLInputElement).value).toBe(
      '80',
    )
  })

  it.each(['fi', 'en'])(
    'restores and saves the rain defaults from the %s menu',
    async (language) => {
      localStorage.setItem('mmc-language', language)
      localStorage.setItem('mmc-theme', 'black')
      localStorage.setItem('mmc-matrix-rain-speed', '175')
      localStorage.setItem('mmc-matrix-rain-brightness', '90')
      localStorage.setItem('mmc-matrix-rain-density', '300')
      let app = await mountApp()
      await app.get('.theme-trigger').trigger('click')
      const menu = new DOMWrapper(document.querySelector<HTMLElement>('.theme-menu')!)
      expect(menu.get('.matrix-rain-reset').text()).toBe(
        language === 'fi' ? fi.topBar.matrixRainReset : en.topBar.matrixRainReset,
      )
      await menu.get('.matrix-rain-reset').trigger('click')
      expect((menu.get('input[name="MatrixRainDensity"]').element as HTMLInputElement).value).toBe(
        '100',
      )
      expect(app.findAll('.matrix-rain-column')).toHaveLength(48)
      expect(localStorage.getItem('mmc-matrix-rain-density')).toBe('100')
      expect((menu.get('input[name="MatrixRainSpeed"]').element as HTMLInputElement).value).toBe(
        '100',
      )
      expect(
        (menu.get('input[name="MatrixRainBrightness"]').element as HTMLInputElement).value,
      ).toBe('55')
      expect((app.get('.matrix-rain').element as HTMLElement).style.opacity).toBe('0.55')
      expect(
        (app.get('.matrix-rain').element as HTMLElement).style.getPropertyValue('--rain-speed'),
      ).toBe('1')
      expect(localStorage.getItem('mmc-matrix-rain-speed')).toBe('100')
      expect(localStorage.getItem('mmc-matrix-rain-brightness')).toBe('55')
      expect(app.get('.theme-trigger').attributes('aria-expanded')).toBe('true')
      expect(localStorage.getItem('mmc-matrix-rain')).toBe('true')
      app.unmount()
      app = await mountApp()
      expect((app.get('.matrix-rain').element as HTMLElement).style.opacity).toBe('0.55')
      expect(
        (app.get('.matrix-rain').element as HTMLElement).style.getPropertyValue('--rain-speed'),
      ).toBe('1')
    },
  )

  it.each([
    ['175', '90', '175', '90'],
    ['invalid', 'Infinity', '100', '55'],
    ['0', '200', '100', '55'],
  ])(
    'restores valid rain settings or falls back to defaults (%s, %s)',
    async (speed, brightness, expectedSpeed, expectedBrightness) => {
      localStorage.setItem('mmc-theme', 'black')
      localStorage.setItem('mmc-matrix-rain-speed', speed)
      localStorage.setItem('mmc-matrix-rain-brightness', brightness)
      const app = await mountApp()
      await app.get('.theme-trigger').trigger('click')
      const menu = new DOMWrapper(document.querySelector<HTMLElement>('.theme-menu')!)
      expect((menu.get('input[name="MatrixRainSpeed"]').element as HTMLInputElement).value).toBe(
        expectedSpeed,
      )
      expect(
        (menu.get('input[name="MatrixRainBrightness"]').element as HTMLInputElement).value,
      ).toBe(expectedBrightness)
      expect((app.get('.matrix-rain').element as HTMLElement).style.opacity).toBe(
        String(Number(expectedBrightness) / 100),
      )
    },
  )

  it.each([
    ['250', '250', 120],
    ['50', '50', 24],
    ['0', '0', 0],
    ['-25', '100', 48],
    ['invalid', '100', 48],
    ['999', '100', 48],
  ])(
    'restores saved text amount or uses the current default (%s)',
    async (stored, expected, count) => {
      localStorage.setItem('mmc-theme', 'black')
      localStorage.setItem('mmc-matrix-rain-density', stored)
      const app = await mountApp()
      expect(app.findAll('.matrix-rain-column')).toHaveLength(count)
      await app.get('.theme-trigger').trigger('click')
      const menu = new DOMWrapper(document.querySelector<HTMLElement>('.theme-menu')!)
      expect((menu.get('input[name="MatrixRainDensity"]').element as HTMLInputElement).value).toBe(
        expected,
      )
      await menu.get('input[name="MatrixRainDensity"]').setValue(0)
      expect(app.findAll('.matrix-rain-column')).toHaveLength(0)
      expect(localStorage.getItem('mmc-matrix-rain-density')).toBe('0')
      await menu.get('input[name="MatrixRainDensity"]').setValue(25)
      expect(app.findAll('.matrix-rain-column')).toHaveLength(12)
    },
  )

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
      expect(app.find('.matrix-rain').exists()).toBe(theme === 'black')
      expect(document.querySelector('.matrix-rain-toggle') !== null).toBe(theme === 'black')
      expect(document.querySelector('.matrix-rain-settings') !== null).toBe(theme === 'black')
      await vi.waitFor(() => expect(trigger.attributes('aria-expanded')).toBe('false'))
    }
  })

  it.each([true, false])('restores the saved code rain preference (%s)', async (enabled) => {
    localStorage.setItem('mmc-theme', 'black')
    localStorage.setItem('mmc-matrix-rain', String(enabled))
    const app = await mountApp()
    expect(app.find('.matrix-rain').exists()).toBe(enabled)
    await app.get('.theme-trigger').trigger('click')
    const toggle = document.querySelector('.matrix-rain-toggle')!
    expect(toggle.getAttribute('role')).toBe('menuitemcheckbox')
    expect(toggle.getAttribute('aria-checked')).toBe(String(enabled))
    expect(toggle.textContent).toContain(en.topBar.matrixRain)
    expect(document.querySelector('.matrix-rain-settings') !== null).toBe(enabled)
  })

  it('saves code rain changes and preserves the choice across themes and remounting', async () => {
    localStorage.setItem('mmc-theme', 'black')
    let app = await mountApp()
    await app.get('.theme-trigger').trigger('click')
    document.querySelector<HTMLElement>('.matrix-rain-toggle')!.click()
    await app.vm.$nextTick()
    expect(app.find('.matrix-rain').exists()).toBe(false)
    expect(localStorage.getItem('mmc-matrix-rain')).toBe('false')
    expect(app.get('.theme-trigger').attributes('aria-expanded')).toBe('true')
    document.querySelector<HTMLElement>('[role="menuitemradio"][data-value="dark"]')!.click()
    await vi.waitFor(() =>
      expect(app.get('.theme-trigger').attributes('aria-expanded')).toBe('false'),
    )
    expect(document.querySelector('.matrix-rain-toggle')).toBeNull()
    await app.get('.theme-trigger').trigger('click')
    document.querySelector<HTMLElement>('[role="menuitemradio"][data-value="black"]')!.click()
    await vi.waitFor(() =>
      expect(app.get('.theme-trigger').attributes('aria-expanded')).toBe('false'),
    )
    expect(app.find('.matrix-rain').exists()).toBe(false)
    app.unmount()
    app = await mountApp()
    expect(app.find('.matrix-rain').exists()).toBe(false)
    await app.get('.theme-trigger').trigger('click')
    document.querySelector<HTMLElement>('.matrix-rain-toggle')!.click()
    await app.vm.$nextTick()
    expect(app.find('.matrix-rain').exists()).toBe(true)
    expect(localStorage.getItem('mmc-matrix-rain')).toBe('true')
  })

  it.each(['en', 'fi'])('restores black mode with its %s menu label', async (language) => {
    localStorage.setItem('mmc-language', language)
    localStorage.setItem('mmc-theme', 'black')
    const app = await mountApp()
    expect(document.documentElement.dataset.theme).toBe('black')
    expect(app.get('.matrix-rain').attributes('aria-hidden')).toBe('true')
    expect(app.findAll('.matrix-rain-column')).toHaveLength(48)
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
    for (const [code, name, flag] of [
      ['fi', 'Suomi', finnishFlag],
      ['en', 'English', englishFlag],
    ]) {
      const option = document.querySelector(`[role="menuitemradio"][data-value="${code}"]`)!
      expect(option.textContent).toContain(name)
      const image = option.querySelector('img')!
      expect(image.getAttribute('src')).toBe(flag)
      expect(image.getAttribute('alt')).toBe('')
      expect(image.getAttribute('aria-hidden')).toBe('true')
    }
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

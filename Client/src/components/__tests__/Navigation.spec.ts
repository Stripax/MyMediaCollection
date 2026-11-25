import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory } from 'vue-router'
import App from '../../App.vue'
import { createAppRouter } from '../../router'
import fi from '../../lang/fi.json'
import en from '../../lang/en.json'

let wrapper: VueWrapper | undefined
const originalTitle = document.title

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key === 'mmc-language' ? 'fi' : null),
    setItem: vi.fn(),
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            { id: 1, name: 'Elokuva', mediaType: 1, mediaFormat: 2, info: null },
            { id: 2, name: 'Sarja', mediaType: 2, mediaFormat: 1, info: null },
          ]),
        ),
    ),
  )
})

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  document.title = originalTitle
  document.documentElement.lang = ''
  document.documentElement.removeAttribute('data-theme')
  vi.unstubAllGlobals()
})

async function mountAt(path = '/') {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  wrapper = mount(App, {
    attachTo: document.body,
    global: {
      plugins: [createI18n({ legacy: false, locale: 'fi', messages: { en, fi } }), router],
      stubs: { 'transition-group': false },
    },
  })
  await flushPromises()
  return { app: wrapper, router }
}

describe('Home and collection navigation', () => {
  it('lands on a home page containing only the introduction without fetching the collection', async () => {
    const { app, router } = await mountAt()
    expect(router.currentRoute.value.name).toBe('home')
    expect(app.get('main h1').text()).toBe(fi.header)
    expect(app.get('main .description').text()).toBe(fi.description)
    expect(app.get('main').element.children).toHaveLength(2)
    expect(app.find('.collection-add-button').exists()).toBe(false)
    expect(app.find('table').exists()).toBe(false)
    expect(app.find('.side-bar-category[aria-pressed="true"]').exists()).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('opens All from home and returns to the introduction using the brand link', async () => {
    const { app, router } = await mountAt()
    expect(app.get('.side-bar-toggle').attributes('aria-expanded')).toBe('false')
    await app.get('.side-bar-toggle').trigger('click')
    await app.findAll('.side-bar-category')[0]!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/collection/all')
    expect(app.get('.side-bar-toggle').attributes('aria-expanded')).toBe('false')
    expect(app.find('table').exists()).toBe(true)
    expect(app.findAll('tbody tr')).toHaveLength(2)
    expect(app.find('.description').exists()).toBe(false)
    expect(app.get('main h1').text()).toBe(fi.collection.allTitle)
    const homeLink = app.get('a.brand')
    expect(homeLink.text()).toBe(fi.title)
    expect(homeLink.attributes('href')).toBe('/')
    await homeLink.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')
    expect(app.get('main h1').text()).toBe(fi.header)
    expect(app.find('table').exists()).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('supports direct category URLs and browser back and forward navigation', async () => {
    const { app, router } = await mountAt('/collection/movies')
    expect(app.get('tbody tr:not([aria-hidden="true"]) .collection-name-button').text()).toBe(
      'Elokuva',
    )
    await app.findAll('.side-bar-category')[2]!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/collection/tvSeries')
    expect(app.get('tbody tr:not([aria-hidden="true"]) .collection-name-button').text()).toBe(
      'Sarja',
    )
    router.back()
    await flushPromises()
    expect(app.get('tbody tr:not([aria-hidden="true"]) .collection-name-button').text()).toBe(
      'Elokuva',
    )
    expect(app.findAll('.side-bar-category')[1]!.attributes('aria-pressed')).toBe('true')
    router.forward()
    await flushPromises()
    expect(app.get('tbody tr:not([aria-hidden="true"]) .collection-name-button').text()).toBe(
      'Sarja',
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('redirects an unknown URL to home', async () => {
    const { app, router } = await mountAt('/collection/unknown-category')
    expect(router.currentRoute.value.fullPath).toBe('/')
    expect(app.get('main h1').text()).toBe(fi.header)
    expect(fetch).not.toHaveBeenCalled()
  })
})

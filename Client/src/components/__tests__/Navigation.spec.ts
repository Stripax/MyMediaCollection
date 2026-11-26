import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory } from 'vue-router'
import App from '../../App.vue'
import { createAppRouter } from '../../router'
import fi from '../../lang/fi.json'
import en from '../../lang/en.json'
import { useSnackbar } from '../../composables/useSnackbar'
import { itemNoticeKey } from '../../models/itemNotices'

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
      stubs: { 'transition-group': false, transition: false },
    },
  })
  await flushPromises()
  return { app: wrapper, router }
}

describe('Home and collection navigation', () => {
  it('refreshes the all-items table with the selected member cover before the editor finishes closing', async () => {
    let cover = 701
    const contents = [
      { name: 'First', tmdbId: 701, posterPath: '/first.jpg' },
      { name: 'Second', tmdbId: 702, posterPath: '/second.jpg' },
    ]
    const api = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === 'PUT') cover = JSON.parse(options.body as string).CoverTmdbId
      const item = {
        id: 77,
        name: 'Movie box',
        mediaType: 1,
        mediaFormat: 2,
        info: null,
        isCollection: true,
        tmdbId: cover,
        posterPath: cover === 701 ? '/first.jpg' : '/second.jpg',
        collectionContents: contents,
      }
      return new Response(JSON.stringify(options?.method === 'PUT' ? item : [item]))
    })
    vi.stubGlobal('fetch', api)
    const { app, router } = await mountAt('/collection/all')
    expect(app.get('.collection-poster').attributes('src')).toContain('/first.jpg')
    await app.get('.collection-name-button').trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
    await dialog.findAll('.collection-member-details')[1]!.trigger('click')
    const layer = dialog.element.closest<HTMLElement>('.item-dialog-layer')!
    layer.style.transitionProperty = 'opacity'
    layer.style.transitionDuration = '10s'
    await dialog.get('form').trigger('submit')
    await vi.waitFor(() =>
      expect(app.get('.collection-poster').attributes('src')).toContain('/second.jpg'),
    )
    expect(app.get('.collection-cover-link').attributes('href')).toContain('/movie/702')
    expect(layer.classList.contains('item-modal-leave-active')).toBe(true)
    expect(cover).toBe(702)
    expect(api.mock.calls.filter(([, options]) => options?.method !== 'PUT')).toHaveLength(2)
    expect(router.currentRoute.value.fullPath).toBe('/collection/all')
  })

  it('animates only the clicked notification away once its item editor opens', async () => {
    await mountAt()
    useSnackbar().show(itemNoticeKey('saved', 2), 'success', { name: 'Sarja' }, 2)
    useSnackbar().show(itemNoticeKey('updated', 1), 'success', { name: 'Elokuva' }, 1)
    await flushPromises()
    const link = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.snackbar-item-link'),
    ).find((element) => element.textContent?.trim() === 'Elokuva')!
    const card = link.closest<HTMLElement>('.snackbar')!
    card.style.transitionProperty = 'opacity'
    card.style.transitionDuration = '0.5s'
    card.style.transitionDelay = '0s'
    link.click()
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(useSnackbar().notices.value.map((notice) => notice.params.name)).toEqual(['Sarja'])
    expect(document.body.contains(card)).toBe(true)
    expect(card.classList.contains('snackbar-leave-active')).toBe(true)
    await vi.waitFor(() => expect(card.classList.contains('snackbar-leave-to')).toBe(true))
    card.dispatchEvent(new Event('transitionend', { bubbles: true }))
    await vi.waitFor(() => expect(document.body.contains(card)).toBe(false))
  })

  it('opens fresh item details from a snackbar and refreshes the table after saving without clearing search', async () => {
    let name = 'Elokuva'
    const api = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === 'PUT') name = JSON.parse(options.body as string).Name
      const item = { id: 1, name, mediaType: 1, mediaFormat: 2, info: null }
      return new Response(JSON.stringify(options?.method === 'PUT' ? item : [item]))
    })
    vi.stubGlobal('fetch', api)
    const { app, router } = await mountAt('/collection/movies')
    await app.get('.collection-search-field input').setValue('Elokuva')
    name = 'Elokuva ajantasainen'
    useSnackbar().show(itemNoticeKey('saved', 1), 'success', { name: 'Elokuva' }, 1)
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.snackbar-item-link')!.click()
    await flushPromises()
    const dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
    expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe(
      'Elokuva ajantasainen',
    )
    await dialog.get('input[name="Name"]').setValue('Elokuva päivitetty')
    await dialog.get('form').trigger('submit')
    await vi.waitFor(() =>
      expect(app.get('.collection-name-button').text()).toBe('Elokuva päivitetty'),
    )
    expect(
      app
        .get('.collection-name-button')
        .element.closest('tr')
        ?.classList.contains('collection-row-updated'),
    ).toBe(true)
    expect((app.get('.collection-search-field input').element as HTMLInputElement).value).toBe(
      'Elokuva',
    )
    expect(router.currentRoute.value.fullPath).toBe('/collection/movies')
    expect(api.mock.calls.filter(([, options]) => options?.method !== 'PUT')).toHaveLength(3)
  })

  it('opens a snackbar item from home and allows reopening after cancelling', async () => {
    await mountAt()
    useSnackbar().show(itemNoticeKey('updated', 1), 'success', { name: 'Elokuva' }, 1)
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.snackbar-item-link')!.click()
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(useSnackbar().notices.value).toHaveLength(0)
    await vi.waitFor(() => expect(document.querySelector('.snackbar-item-link')).toBeNull())
    document.querySelector<HTMLButtonElement>('.item-dialog-cancel')!.click()
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
    expect(document.activeElement).toBe(document.querySelector('.brand'))
    useSnackbar().show(itemNoticeKey('updated', 1), 'success', { name: 'Elokuva' }, 1)
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.snackbar-item-link')!.click()
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('reports a missing snackbar item and removes its outdated link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]')))
    await mountAt()
    useSnackbar().show(itemNoticeKey('saved', 1), 'success', { name: 'Missing' }, 999)
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.snackbar-item-link')!.click()
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.querySelector('.snackbar-item-link')).toBeNull()
    expect(
      useSnackbar().notices.value.some((notice) => notice.messageKey === 'itemForm.notFound'),
    ).toBe(true)
  })

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

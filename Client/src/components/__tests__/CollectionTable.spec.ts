import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../../router'
import App from '../../App.vue'
import type { CollectionItem } from '../../models/collection'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'

const items: CollectionItem[] = [
  { id: 4, name: 'Lautapeli', mediaType: 4, mediaFormat: null, info: null },
  { id: 3, name: 'Videopeli', mediaType: 3, mediaFormat: null, platform: 9, info: '' },
  { id: 2, name: 'TV-sarja', mediaType: 2, mediaFormat: 1, info: 'Ensimmäinen\nToinen' },
  { id: 1, name: 'Elokuva', mediaType: 1, mediaFormat: 3, info: 'Lisätiedot' },
]
let wrapper: VueWrapper | undefined

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200 })
}

async function mountApp() {
  vi.stubGlobal('scrollTo', vi.fn())
  const router = createAppRouter(createMemoryHistory())
  await router.push('/collection/all')
  await router.isReady()
  const i18n = createI18n({ legacy: false, locale: 'fi', messages: { en, fi } })
  wrapper = mount(App, {
    attachTo: document.body,
    global: {
      plugins: [i18n, router],
      stubs: { TopBar: true, transition: false, 'transition-group': false },
    },
  })
  await flushPromises()
  await settleRows()
  return { app: wrapper, i18n }
}

function rowNames(app: VueWrapper) {
  return app
    .findAll('tbody tr:not([aria-hidden="true"]) .collection-name-button')
    .map((cell) => cell.text())
}

async function settleRows() {
  await vi.waitFor(() => expect(wrapper!.find('.collection-row-leave-active').exists()).toBe(false))
}

async function submitItem(app: VueWrapper, name: string, mediaType = '1') {
  await app.get('.collection-add-button').trigger('click')
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
  const dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
  await dialog.get('input[name="Name"]').setValue(name)
  const categorySelect = dialog.find('select[name="MediaType"]')
  if (categorySelect.exists()) await categorySelect.setValue(mediaType)
  await dialog.get('form').trigger('submit')
}

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('Collection table in the application', () => {
  it('shows the full notes in an info dialog and closes it with Cancel or an outside click', async () => {
    const notes = 'Ensimmäinen rivi\nToinen rivi <b>tekstinä</b>'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{ ...items[3]!, info: notes }])))
    const { app } = await mountApp()
    expect(app.find('.collection-info').exists()).toBe(false)
    expect(app.findAll('th').map((header) => header.text())).toEqual([
      fi.itemForm.name,
      fi.collection.category,
      fi.collection.actions,
    ])
    const button = app.get('.collection-info-button')
    await button.trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
    let dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
    expect(dialog.get('.collection-info-text').text()).toBe(notes)
    expect(dialog.get('.collection-info-dialog-title').text()).toBe(fi.itemForm.info)
    expect(dialog.find('b').exists()).toBe(false)
    expect(dialog.find('input, textarea, select').exists()).toBe(false)
    expect(dialog.findAll('button')).toHaveLength(1)
    await dialog.get('.item-dialog-cancel').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
    await vi.waitFor(() => expect((button.element as HTMLButtonElement).disabled).toBe(false))
    await button.trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
    dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
    await vi.waitFor(() => expect((button.element as HTMLButtonElement).disabled).toBe(false))
    const outside = new DOMWrapper(dialog.element.closest('.item-dialog-positioner')!)
    await outside.trigger('pointerdown', { button: 0, pointerType: 'mouse' })
    await outside.trigger('pointerup', { button: 0, pointerType: 'mouse' })
    await outside.trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
  })

  it('changes automatic TMDB names with the UI language and searches both languages while preserving custom names', async () => {
    const translated: CollectionItem[] = [
      {
        id: 21,
        name: 'Tappajahai',
        mediaType: 1,
        mediaFormat: 2,
        info: null,
        tmdbId: 578,
        isNameCustom: false,
        localizedTitles: { fi: 'Tappajahai', en: 'Jaws' },
      },
      {
        id: 22,
        name: 'Oma kopio',
        mediaType: 1,
        mediaFormat: 2,
        info: null,
        tmdbId: 578,
        isNameCustom: true,
        localizedTitles: { fi: 'Tappajahai', en: 'Jaws' },
      },
      { id: 23, name: 'Manual name', mediaType: 1, mediaFormat: 2, info: null },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(translated)))
    const { app, i18n } = await mountApp()
    expect(rowNames(app)).toEqual(['Tappajahai', 'Oma kopio', 'Manual name'])
    i18n.global.locale.value = 'en'
    await app.vm.$nextTick()
    expect(rowNames(app)).toEqual(['Jaws', 'Oma kopio', 'Manual name'])
    const input = app.get('input[type="search"]')
    for (const query of ['tappajahai', 'JAWS']) {
      await input.setValue(query)
      await settleRows()
      expect(rowNames(app)).toEqual(['Jaws', 'Oma kopio'])
    }
    await app.findAll('.side-bar-category')[2]!.trigger('click')
    await flushPromises()
    await settleRows()
    expect(app.get('.collection-empty').text()).toBe(en.collection.noMatches)
  })

  it('loads saved items and translates the category column and row actions in the all view', async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse(items))
    vi.stubGlobal('fetch', request)
    const { app, i18n } = await mountApp()
    expect(request).toHaveBeenCalledWith(
      '/api/collection',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(rowNames(app)).toEqual(['Lautapeli', 'Videopeli', 'TV-sarja', 'Elokuva'])
    expect(app.findAll('tbody tr')[0]!.find('.collection-info-button').exists()).toBe(true)
    expect(
      (app.findAll('tbody tr')[0]!.get('.collection-info-button').element as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      (app.findAll('tbody tr')[3]!.get('.collection-info-button').element as HTMLButtonElement)
        .disabled,
    ).toBe(false)
    expect(app.findAll('tbody tr')[3]!.get('.collection-row-actions button').classes()).toContain(
      'collection-info-button',
    )
    expect(app.findAll('tbody tr')[3]!.text()).toContain('4K UHD Blu-ray')
    expect(app.get('th').text()).toBe(fi.itemForm.name)
    expect(app.find('caption').exists()).toBe(false)
    expect(app.get('table').attributes('aria-label')).toBe(fi.collection.title)
    expect(app.findAll('td.collection-category').map((cell) => cell.text())).toEqual([
      fi.sidebar.boardGames,
      fi.sidebar.videoGames,
      fi.sidebar.tvSeries,
      fi.sidebar.movies,
    ])
    i18n.global.locale.value = 'en'
    await app.vm.$nextTick()
    expect(app.get('th').text()).toBe(en.itemForm.name)
    expect(app.findAll('th').map((header) => header.text())).toEqual([
      en.itemForm.name,
      en.collection.category,
      en.collection.actions,
    ])
    expect(app.findAll('td.collection-category').map((cell) => cell.text())).toEqual([
      en.sidebar.boardGames,
      en.sidebar.videoGames,
      en.sidebar.tvSeries,
      en.sidebar.movies,
    ])
    expect(app.get('.collection-edit-button').attributes('aria-label')).toBe('Edit item Lautapeli')
    expect(app.get('.collection-delete-button').attributes('aria-label')).toBe(
      'Delete item Lautapeli',
    )
  })

  it.each([
    ['.collection-edit-button', 'edit'],
    ['.collection-delete-button', 'delete'],
  ] as const)(
    'shows a localized hover tooltip for the %s icon button',
    async (selector, action) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(items)))
      const { app, i18n } = await mountApp()
      const button = app.get(selector)
      expect(button.text()).toBe('')
      expect(button.get('svg').attributes('aria-hidden')).toBe('true')
      const tooltip = button.element.closest('.toolbar-tooltip')!
      tooltip.dispatchEvent(new MouseEvent('mouseenter'))
      await app.vm.$nextTick()
      expect(app.get('[role="tooltip"]').text()).toBe(fi.collection[action])
      expect(button.attributes('aria-describedby')).toBe(
        app.get('[role="tooltip"]').attributes('id'),
      )
      i18n.global.locale.value = 'en'
      await app.vm.$nextTick()
      expect(app.get('[role="tooltip"]').text()).toBe(en.collection[action])
      tooltip.dispatchEvent(new MouseEvent('mouseleave'))
      await vi.waitFor(() => expect(app.find('[role="tooltip"]').exists()).toBe(false))
      await button.trigger('focusin')
      expect(app.find('[role="tooltip"]').exists()).toBe(false)
    },
  )

  it('opens the same item editor from its name and returns focus to the name after closing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(items)))
    const { app } = await mountApp()
    const row = app.findAll('tbody tr')[2]!
    const name = row.get('.collection-name-button')
    expect(name.text()).toBe('TV-sarja')
    expect(name.attributes('aria-label')).toBe('Muokkaa kohdetta TV-sarja')
    await name.trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
    const dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
    const dialogId = dialog.attributes('id')
    expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe('TV-sarja')
    expect(dialog.find('select[name="MediaType"]').exists()).toBe(false)
    await vi.waitFor(() =>
      expect(row.get('.collection-edit-button').attributes('disabled')).toBeUndefined(),
    )
    await dialog.get('button').trigger('click')
    await vi.waitFor(() => expect(document.activeElement).toBe(name.element))
    await row.get('.collection-edit-button').trigger('click')
    await vi.waitFor(() =>
      expect(row.get('.collection-edit-button').attributes('aria-expanded')).toBe('true'),
    )
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(document.querySelector('[role="dialog"]')?.id).toBe(dialogId)
    expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe('TV-sarja')
  })

  it('shows movie and TV formats and game platforms below the name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => jsonResponse(items)),
    )
    const { app, i18n } = await mountApp()
    expect(app.findAll('tbody tr')[1]!.get('.game-platform-badge').text()).toBe('PlayStation 5')
    expect(app.find('.collection-format').exists()).toBe(false)
    expect(app.findAll('tbody tr')[3]!.get('.media-format-badge').text()).toBe('4K UHD Blu-ray')
    for (const category of [1, 2]) {
      await app.findAll('.side-bar-category')[category]!.trigger('click')
      await flushPromises()
      await settleRows()
      expect(app.find('th.collection-format').exists()).toBe(false)
      expect(app.findAll('th')).toHaveLength(2)
      expect(app.find('.media-format-badge').exists()).toBe(true)
      await app.get('input[type="search"]').setValue('No matching item')
      expect(app.get('.collection-empty').attributes('colspan')).toBe('2')
      await app.get('input[type="search"]').setValue('')
    }
    await app.findAll('.side-bar-category')[3]!.trigger('click')
    await flushPromises()
    await settleRows()
    expect(app.find('th.collection-format').exists()).toBe(false)
    expect(app.findAll('th')).toHaveLength(3)
    expect(app.findAll('tbody tr')[0]!.get('.game-platform-badge').text()).toBe('PlayStation 5')
    i18n.global.locale.value = 'en'
    await app.vm.$nextTick()
    expect(app.get('.game-platform-badge').attributes('aria-label')).toBe('Platform: PlayStation 5')
  })

  it('shows translated physical, digital and unknown copy types only in the games view', async () => {
    const games: CollectionItem[] = [true, false, null].map((isPhysical, index) => ({
      id: index + 1,
      name: `Game ${index}`,
      mediaType: 3,
      mediaFormat: null,
      platform: 9,
      info: null,
      isPhysical,
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(games)))
    const { app, i18n } = await mountApp()
    expect(app.find('.collection-copy-type').exists()).toBe(false)
    await app.findAll('.side-bar-category')[3]!.trigger('click')
    await flushPromises()
    await settleRows()
    expect(app.findAll('th')[1]!.text()).toBe(fi.collection.copyType)
    expect(app.findAll('td.collection-copy-type').map((cell) => cell.text())).toEqual([
      'Fyysinen',
      'Digitaalinen',
      'Ei tiedossa',
    ])
    i18n.global.locale.value = 'en'
    await app.vm.$nextTick()
    expect(app.findAll('td.collection-copy-type').map((cell) => cell.text())).toEqual([
      'Physical',
      'Digital',
      'Unknown',
    ])
    await app.get('input[type="search"]').setValue('Not present')
    expect(app.get('.collection-empty').attributes('colspan')).toBe('3')
  })

  it('translates Other formats, platforms and stores in the table', async () => {
    const otherItems: CollectionItem[] = [
      { id: 80, name: 'Muu formaatti', mediaType: 1, mediaFormat: 99, info: null },
      { id: 81, name: 'Muu alusta', mediaType: 3, mediaFormat: null, platform: 99, info: null },
      {
        id: 82,
        name: 'Muu kauppa',
        mediaType: 3,
        mediaFormat: null,
        platform: 26,
        store: 99,
        info: null,
      },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(otherItems)))
    const { app, i18n } = await mountApp()
    expect(app.find('.collection-format').exists()).toBe(false)
    expect(app.get('.media-format-badge').text()).toBe('Muu')
    expect(app.findAll('.game-platform-badge').map((tag) => tag.text())).toEqual([
      'Muu',
      'PC · Muu',
    ])
    i18n.global.locale.value = 'en'
    await app.vm.$nextTick()
    expect(app.find('.collection-format').exists()).toBe(false)
    expect(app.get('.media-format-badge').text()).toBe('Other')
    expect(app.findAll('.game-platform-badge').map((tag) => tag.text())).toEqual([
      'Other',
      'PC · Other',
    ])
  })

  it('displays the selected PC store in the platform badge', async () => {
    const pcItems = items.map((item) =>
      item.mediaType === 3 ? { ...item, platform: 26, store: 1 } : item,
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(pcItems)))
    const { app } = await mountApp()
    expect(app.findAll('tbody tr')[1]!.get('.game-platform-badge').text()).toBe('PC · Steam')
    await app.findAll('.side-bar-category')[3]!.trigger('click')
    await flushPromises()
    await settleRows()
    expect(app.findAll('tbody tr')[0]!.get('.game-platform-badge').text()).toBe('PC · Steam')
  })

  it('distinguishes copies of the same title by platform family below each name', async () => {
    const copies: CollectionItem[] = [3, 9, 18, 26].map((platform, index) => ({
      id: index + 1,
      name: 'Same game',
      mediaType: 3,
      mediaFormat: null,
      platform,
      info: null,
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(copies)))
    const { app } = await mountApp()
    const tags = app.findAll('.game-platform-badge')
    expect(tags.map((tag) => tag.text())).toEqual([
      'Xbox One',
      'PlayStation 5',
      'Nintendo Switch',
      'PC',
    ])
    expect(tags.map((tag) => tag.attributes('data-platform-family'))).toEqual([
      'xbox',
      'playstation',
      'nintendo',
      'pc',
    ])
    expect(rowNames(app)).toEqual(['Same game', 'Same game', 'Same game', 'Same game'])
    expect(
      app
        .findAll('tbody .collection-name-label')
        .every((cell) => cell.find('.game-platform-badge').exists()),
    ).toBe(true)
  })

  it('shows the tabletop game type in the restored Format column and a four-column empty state', async () => {
    const legacyItems = items.map((item) =>
      item.mediaType === 4 ? { ...item, mediaFormat: 4 } : item,
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(legacyItems)))
    const { app } = await mountApp()
    expect(app.findAll('tbody tr')[0]!.get('.bgg-format-badge').text()).toBe(fi.gameTypes.boardGame)
    await app.findAll('.side-bar-category')[4]!.trigger('click')
    await flushPromises()
    await settleRows()
    expect(app.findAll('th').map((header) => header.text())).toEqual([
      fi.itemForm.name,
      fi.collection.actions,
    ])
    expect(app.findAll('tbody tr')[0]!.findAll('td')).toHaveLength(2)
    await app.get('input[type="search"]').setValue('Ei löydy')
    expect(app.get('.collection-empty').attributes('colspan')).toBe('2')
  })

  it('displays translated board, card and other game types while leaving legacy items unassigned', async () => {
    const tabletopItems: CollectionItem[] = [
      { id: 91, name: 'Board', mediaType: 4, mediaFormat: 4, info: null },
      { id: 92, name: 'Cards', mediaType: 4, mediaFormat: 5, info: null },
      { id: 93, name: 'Other', mediaType: 4, mediaFormat: 99, info: null },
      { id: 94, name: 'Legacy', mediaType: 4, mediaFormat: null, info: null },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tabletopItems)))
    const { app, i18n } = await mountApp()
    expect(
      app
        .findAll('tbody tr')
        .map((row) =>
          row.find('.bgg-format-badge').exists() ? row.get('.bgg-format-badge').text() : '—',
        ),
    ).toEqual(['Lautapeli', 'Korttipeli', 'Muu peli', '—'])
    expect(app.find('.collection-format').exists()).toBe(false)
    expect(app.findAll('thead th')).toHaveLength(3)
    expect(
      app.findAll('.bgg-format-badge').map((tag) => tag.attributes('data-game-format')),
    ).toEqual(['4', '5', '99'])
    expect(app.get('.collection-name-label .bgg-format-badge').attributes('aria-label')).toBe(
      'Pelityyppi: Lautapeli',
    )
    await app.findAll('.side-bar-category')[4]!.trigger('click')
    await flushPromises()
    await settleRows()
    expect(app.get('main h1').text()).toBe('Lauta- ja korttipelit')
    expect(app.findAll('thead th')).toHaveLength(2)
    i18n.global.locale.value = 'en'
    await app.vm.$nextTick()
    expect(app.get('main h1').text()).toBe('Board and card games')
    expect(
      app
        .findAll('tbody tr')
        .map((row) =>
          row.find('.bgg-format-badge').exists() ? row.get('.bgg-format-badge').text() : '—',
        ),
    ).toEqual(['Board game', 'Card game', 'Other game', '—'])
  })

  it('places a category-specific add button beside search and prefills the category', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => jsonResponse(items)),
    )
    const { app, i18n } = await mountApp()
    const categories = ['all', 'movies', 'tvSeries', 'videoGames', 'boardGames'] as const
    for (const [index, category] of categories.entries()) {
      await app.findAll('.side-bar-category')[index]!.trigger('click')
      await flushPromises()
      await settleRows()
      const button = app.get('.collection-toolbar .collection-add-button')
      expect(app.get('main h1').text()).toBe(
        category === 'all' ? fi.collection.allTitle : fi.sidebar[category],
      )
      expect(button.text()).toBe(fi.collection.add[category])
      expect(app.find('.collection-toolbar input[type="search"]').exists()).toBe(true)
      expect(app.get('.collection-instructions').text()).toContain(fi.collection.add[category])
      expect(app.get('.collection-instructions').text()).toContain('muokata ja poistaa')
      await button.trigger('click')
      await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
      const dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
      const categorySelect = dialog.find('select[name="MediaType"]')
      expect(categorySelect.exists()).toBe(category === 'all')
      if (category === 'all') {
        expect((categorySelect.element as HTMLSelectElement).value).toBe('1')
      }
      await dialog.get('button').trigger('click')
      await flushPromises()
      await settleRows()
    }
    i18n.global.locale.value = 'en'
    await app.vm.$nextTick()
    expect(app.get('.collection-add-button').text()).toBe(en.collection.add.boardGames)
    expect(app.get('main h1').text()).toBe(en.sidebar.boardGames)
    expect(app.get('.collection-instructions').text()).toContain(en.collection.add.boardGames)
  })

  it('filters all four categories using the sidebar and restores all items without refetching', async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse(items))
    vi.stubGlobal('fetch', request)
    const { app } = await mountApp()
    const buttons = app.findAll('.side-bar-category')
    for (const [index, name] of ['Elokuva', 'TV-sarja', 'Videopeli', 'Lautapeli'].entries()) {
      await buttons[index + 1]!.trigger('click')
      await flushPromises()
      await settleRows()
      expect(rowNames(app)).toEqual([name])
    }
    await buttons[0]!.trigger('click')
    await flushPromises()
    await settleRows()
    expect(rowNames(app)).toHaveLength(4)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('searches partial names without case sensitivity and ignores surrounding whitespace', async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse(items))
    vi.stubGlobal('fetch', request)
    const { app } = await mountApp()
    const search = app.get('input[type="search"]')
    await search.setValue('  PELI  ')
    expect(rowNames(app)).toEqual(['Lautapeli', 'Videopeli'])
    await search.setValue('Ensimmäinen')
    expect(app.get('.collection-empty').text()).toBe(fi.collection.noMatches)
    await search.setValue('   ')
    expect(rowNames(app)).toHaveLength(4)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('combines the name search with categories and clears only the search', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(items)))
    const { app } = await mountApp()
    const search = app.get('input[type="search"]')
    const categories = app.findAll('.side-bar-category')
    await search.setValue('peli')
    await categories[3]!.trigger('click')
    await flushPromises()
    await settleRows()
    expect(rowNames(app)).toEqual(['Videopeli'])
    await categories[4]!.trigger('click')
    await flushPromises()
    await settleRows()
    expect(rowNames(app)).toEqual(['Lautapeli'])
    await search.setValue('sarja')
    expect(app.get('.collection-empty').text()).toBe(fi.collection.noMatches)
    await app.get('.collection-search button').trigger('click')
    expect((search.element as HTMLInputElement).value).toBe('')
    expect(rowNames(app)).toEqual(['Lautapeli'])
    expect(categories[4]!.attributes('aria-pressed')).toBe('true')
    await categories[0]!.trigger('click')
    await flushPromises()
    await settleRows()
    expect(rowNames(app)).toHaveLength(4)
  })

  it('shows separate empty messages for the entire collection and a selected category', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))
    const { app } = await mountApp()
    expect(app.get('tbody').text()).toBe(fi.collection.empty)
    await app.findAll('.side-bar-category')[1]!.trigger('click')
    await flushPromises()
    await settleRows()
    expect(app.get('tbody').text()).toBe(fi.collection.emptyCategory)
  })

  it.each(['network', 'http'])(
    'shows a load error after a %s failure and supports retry',
    async (failure) => {
      const request = vi.fn()
      if (failure === 'network') request.mockRejectedValueOnce(new TypeError('Offline'))
      else request.mockResolvedValueOnce(new Response('{}', { status: 503 }))
      request.mockResolvedValueOnce(jsonResponse(items))
      vi.stubGlobal('fetch', request)
      const { app } = await mountApp()
      expect(app.get('[role="alert"]').text()).toBe(fi.collection.loadError)
      expect(app.find('.collection-empty').exists()).toBe(false)
      await app.get('.collection-error button').trigger('click')
      await vi.waitFor(() => expect(rowNames(app)).toHaveLength(4))
      expect(app.find('[role="alert"]').exists()).toBe(false)
    },
  )

  it('shows save errors in a dismissible snackbar without closing the form, then reports a successful retry', async () => {
    const added: CollectionItem = {
      id: 5,
      name: 'Uusi kohde',
      mediaType: 1,
      mediaFormat: 1,
      info: null,
    }
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(items))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(added), { status: 201 }))
      .mockResolvedValueOnce(jsonResponse([added, ...items]))
    vi.stubGlobal('fetch', request)
    const { app } = await mountApp()
    await submitItem(app, added.name)
    await vi.waitFor(() =>
      expect(document.querySelector('.snackbar--error')?.textContent).toContain(
        fi.itemForm.saveError,
      ),
    )
    const dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
    const close = new DOMWrapper(document.querySelector<HTMLButtonElement>('.snackbar-close')!)
    await close.trigger('pointerdown', { button: 0, pointerType: 'mouse' })
    await close.trigger('click')
    await vi.waitFor(() => expect(document.querySelector('.snackbar--error')).toBeNull())
    expect(app.get('.collection-add-button').attributes('aria-expanded')).toBe('true')
    expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe(added.name)
    await dialog.get('form').trigger('submit')
    await vi.waitFor(() => expect(rowNames(app)).toContain(added.name))
    await vi.waitFor(() =>
      expect(document.querySelector('.snackbar--success')?.textContent).toContain(
        fi.collection.notifications.saved.movies.replace('{name}', added.name),
      ),
    )
  })

  it('reloads after saving and preserves the active category filter', async () => {
    const added: CollectionItem = {
      id: 5,
      name: 'Uusi sarja',
      mediaType: 2,
      mediaFormat: 1,
      info: null,
    }
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(items))
      .mockResolvedValueOnce(new Response(JSON.stringify(added), { status: 201 }))
      .mockResolvedValueOnce(jsonResponse([added, ...items]))
    vi.stubGlobal('fetch', request)
    const { app } = await mountApp()
    await app.findAll('.side-bar-category')[2]!.trigger('click')
    await flushPromises()
    await settleRows()
    await app.get('input[type="search"]').setValue('SARJA')
    await submitItem(app, added.name, '2')
    await vi.waitFor(() => expect(rowNames(app)).toEqual(['Uusi sarja', 'TV-sarja']))
    expect(request).toHaveBeenCalledTimes(3)
    expect(app.findAll('.side-bar-category')[2]!.attributes('aria-pressed')).toBe('true')
    expect((app.get('input[type="search"]').element as HTMLInputElement).value).toBe('SARJA')
    await app.findAll('.side-bar-category')[0]!.trigger('click')
    await flushPromises()
    await settleRows()
    expect(rowNames(app)).toEqual(['Uusi sarja', 'TV-sarja'])
    await app.get('.collection-search button').trigger('click')
    expect(rowNames(app)).toHaveLength(5)
  })

  it('prefills the current form, updates the correct item and reapplies the category filter', async () => {
    const edited = {
      ...items[2]!,
      name: 'Muokattu sarja',
      mediaType: 2,
      mediaFormat: 3,
      info: 'Päivitetty',
    }
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(items))
      .mockResolvedValueOnce(jsonResponse(edited))
      .mockResolvedValueOnce(
        jsonResponse(items.map((item) => (item.id === edited.id ? edited : item))),
      )
    vi.stubGlobal('fetch', request)
    const { app } = await mountApp()
    await app.findAll('.side-bar-category')[2]!.trigger('click')
    await flushPromises()
    await settleRows()
    await app.get('tbody .collection-edit-button').trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
    const dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
    expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe('TV-sarja')
    expect(dialog.find('select[name="MediaType"]').exists()).toBe(false)
    expect((dialog.get('select[name="MediaFormat"]').element as HTMLSelectElement).value).toBe('1')
    expect((dialog.get('textarea[name="Info"]').element as HTMLTextAreaElement).value).toBe(
      'Ensimmäinen\nToinen',
    )
    await dialog.get('input[name="Name"]').setValue(edited.name)
    await dialog.get('select[name="MediaFormat"]').setValue('3')
    await dialog.get('textarea[name="Info"]').setValue(edited.info)
    await dialog.get('form').trigger('submit')
    await vi.waitFor(() => expect(rowNames(app)).toContain(edited.name))
    expect(request).toHaveBeenNthCalledWith(2, '/api/collection/2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        MediaType: 2,
        Name: edited.name,
        MediaFormat: 3,
        Info: edited.info,
        IsCompleteBox: false,
        OwnedSeasons: [],
      }),
    })
    expect(app.findAll('.side-bar-category')[2]!.attributes('aria-pressed')).toBe('true')
    await app.findAll('.side-bar-category')[0]!.trigger('click')
    await flushPromises()
    await settleRows()
    expect(rowNames(app)).toContain(edited.name)
  })

  it('discards cancelled edits and reopens with the saved item details', async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse(items))
    vi.stubGlobal('fetch', request)
    const { app } = await mountApp()
    await app.findAll('.collection-edit-button')[2]!.trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
    const dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
    await dialog.get('input[name="Name"]').setValue('Unsaved name')
    await dialog.get('button').trigger('click')
    expect(request).toHaveBeenCalledTimes(1)
    expect(rowNames(app)).toContain('TV-sarja')
    await vi.waitFor(() =>
      expect(app.findAll('.collection-edit-button')[2]!.attributes('disabled')).toBeUndefined(),
    )
    await app.findAll('.collection-edit-button')[2]!.trigger('click')
    expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe('TV-sarja')
  })

  it('asks for confirmation, cancels without deleting and refreshes only after confirmed deletion', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(items))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse(items.slice(1)))
    vi.stubGlobal('fetch', request)
    const { app } = await mountApp()
    await app.get('.collection-delete-button').trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).not.toBeNull())
    const dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="alertdialog"]')!)
    expect(dialog.text()).toContain('Lautapeli')
    expect(request).toHaveBeenCalledTimes(1)
    await dialog.get('button').trigger('click')
    expect(request).toHaveBeenCalledTimes(1)
    expect(rowNames(app)).toHaveLength(4)
    await vi.waitFor(() =>
      expect(app.get('.collection-delete-button').attributes('disabled')).toBeUndefined(),
    )
    await app.get('.collection-delete-button').trigger('click')
    await vi.waitFor(() =>
      expect(dialog.element.closest('.item-dialog-layer')?.getAttribute('aria-hidden')).toBe(
        'false',
      ),
    )
    await dialog.get('.collection-delete-confirm').trigger('click')
    expect(request).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(rowNames(app)).toEqual(['Videopeli', 'TV-sarja', 'Elokuva']))
    expect(request).toHaveBeenNthCalledWith(2, '/api/collection/4', { method: 'DELETE' })
    expect(document.querySelector('[data-snackbar-region]')?.textContent).toContain(
      fi.collection.notifications.deleted.boardGames.replace('{name}', 'Lautapeli'),
    )
  })

  it('ignores an older in-flight response after a successful save reloads the collection', async () => {
    let finishInitial!: (response: Response) => void
    const request = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishInitial = resolve
          }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 201 }))
      .mockResolvedValueOnce(jsonResponse(items))
    vi.stubGlobal('fetch', request)
    const { app } = await mountApp()
    expect(app.get('.collection-section').attributes('aria-busy')).toBe('true')
    await submitItem(app, 'Uusi kohde')
    await vi.waitFor(() => expect(rowNames(app)).toHaveLength(4))
    finishInitial(jsonResponse([]))
    await flushPromises()
    await settleRows()
    expect(rowNames(app)).toHaveLength(4)
    expect(app.get('.collection-section').attributes('aria-busy')).toBe('false')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import IgdbImportDialog from '../IgdbImportDialog.vue'
import CollectionTable from '../CollectionTable.vue'
import { igdbCoverUrl, igdbPlatformOptions } from '../../models/igdb'
import { useSnackbar } from '../../composables/useSnackbar'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'
import { gamePlatforms, type CollectionCategory } from '../../models/collection'

let wrapper: VueWrapper | undefined
const game = {
  igdbId: 1942,
  title: 'Example game',
  overview: 'Game overview',
  releaseDate: '2001-09-09',
  coverImageId: 'cover_id',
  sourceUrl: 'https://www.igdb.com/games/example',
  platforms: ['PlayStation 5', 'PC (Microsoft Windows)'],
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const plugins = (locale = 'fi') => [createI18n({ legacy: false, locale, messages: { en, fi } })]

async function open(locale = 'fi') {
  vi.stubGlobal('scrollTo', vi.fn())
  wrapper = mount(IgdbImportDialog, {
    attachTo: document.body,
    global: { plugins: plugins(locale), stubs: { transition: false } },
  })
  await wrapper.get('.igdb-add-button').trigger('click')
  await flushPromises()
  return new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
}

async function searchAndSelect(dialog: DOMWrapper<Element>) {
  await dialog.get('input[name="IgdbQuery"]').setValue('Example game')
  await dialog.get('.tmdb-search-form').trigger('submit')
  await flushPromises()
  await dialog.get('.tmdb-result').trigger('click')
}

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  useSnackbar().dismiss()
  vi.unstubAllGlobals()
})

describe('IGDB import', () => {
  it('offers Xbox, PlayStation and PC stores only for their platforms', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          json({ page: 1, hasNextPage: false, results: [{ ...game, platforms: [] }] }),
        ),
    )
    const dialog = await open()
    await searchAndSelect(dialog)
    expect((dialog.get('select[name="Store"]').element as HTMLSelectElement).disabled).toBe(true)
    const options = () =>
      dialog.findAll('select[name="Store"] option').map((option) => option.attributes('value'))
    await dialog.get('select[name="Platform"]').setValue('3')
    expect(options()).toEqual(['', '9', '99'])
    await dialog.get('select[name="Store"]').setValue('9')
    await dialog.get('select[name="Platform"]').setValue('4')
    expect((dialog.get('select[name="Store"]').element as HTMLSelectElement).value).toBe('9')
    await dialog.get('select[name="Platform"]').setValue('9')
    expect(options()).toEqual(['', '10', '99'])
    expect((dialog.get('select[name="Store"]').element as HTMLSelectElement).value).toBe('')
    await dialog.get('select[name="Platform"]').setValue('26')
    expect(options()).toEqual(['', '1', '2', '3', '4', '5', '6', '7', '8', '99'])
  })

  it.each([
    [
      ['PlayStation 5', 'PC (Microsoft Windows)', 'PlayStation 5'],
      [9, 26, 99],
    ],
    [
      [
        'Xbox Series X|S',
        'Wii',
        'Wii U',
        'GameCube',
        'Super Nintendo Entertainment System',
        'Sega Mega Drive/Genesis',
      ],
      [4, 13, 15, 16, 17, 23, 99],
    ],
    [['Linux', 'Mac'], [99]],
    [[], gamePlatforms.map((platform) => platform.value)],
    [['  '], gamePlatforms.map((platform) => platform.value)],
  ])('maps IGDB platforms %j to stored platform values', (names, expected) => {
    expect(igdbPlatformOptions(names as string[]).map((option) => option.value)).toEqual(expected)
  })

  it('limits platform choices to the selected game and clears an incompatible previous choice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json({
          page: 1,
          hasNextPage: false,
          results: [game, { ...game, igdbId: 2000, title: 'Xbox game', platforms: ['Xbox One'] }],
        }),
      ),
    )
    const dialog = await open()
    await searchAndSelect(dialog)
    expect(
      dialog.findAll('select[name="Platform"] option').map((option) => option.attributes('value')),
    ).toEqual(['', '9', '26', '99'])
    await dialog.get('select[name="Platform"]').setValue('9')
    await dialog.get('.tmdb-import-form button[type="button"]').trigger('click')
    await dialog.findAll('.tmdb-result')[1]!.trigger('click')
    expect(
      dialog.findAll('select[name="Platform"] option').map((option) => option.attributes('value')),
    ).toEqual(['', '3', '99'])
    expect((dialog.get('select[name="Platform"]').element as HTMLSelectElement).value).toBe('')
  })

  it('uses the current complete platform list when IGDB returns no platforms', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          json({ page: 1, hasNextPage: false, results: [{ ...game, platforms: [] }] }),
        ),
    )
    const dialog = await open()
    await searchAndSelect(dialog)
    expect(
      dialog.findAll('select[name="Platform"] option').map((option) => option.attributes('value')),
    ).toEqual(['', ...gamePlatforms.map((option) => String(option.value))])
  })
  it('imports a physical PC copy without a digital store', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({ page: 1, hasNextPage: false, results: [game] }))
      .mockResolvedValueOnce(json({ id: 8 }, 201))
    vi.stubGlobal('fetch', request)
    const dialog = await open()
    await searchAndSelect(dialog)
    await dialog.get('select[name="Platform"]').setValue('26')
    await dialog.get('select[name="Store"]').setValue('1')
    await dialog.get('input[name="IsPhysical"]').setValue(true)
    expect((dialog.get('select[name="Store"]').element as HTMLSelectElement).value).toBe('')
    expect((dialog.get('select[name="Store"]').element as HTMLSelectElement).disabled).toBe(true)
    expect(dialog.get('select[name="Store"]').attributes('required')).toBeUndefined()
    await dialog.get('.tmdb-import-form').trigger('submit')
    await vi.waitFor(() => expect(wrapper!.emitted('saved')).toHaveLength(1))
    expect(useSnackbar().notice.value).toMatchObject({
      messageKey: 'collection.notifications.saved.videoGames',
      params: { name: game.title },
      itemId: 8,
    })
    const body = JSON.parse(request.mock.calls[1]![1].body)
    expect(body.item.isPhysical).toBe(true)
    expect(body.item.platform).toBe(26)
    expect(body.item).not.toHaveProperty('store')
  })

  it.each(['fi', 'en'])(
    'searches and imports a console copy in %s with its cover and original game reference',
    async (locale) => {
      const request = vi
        .fn()
        .mockResolvedValueOnce(json({ page: 1, hasNextPage: false, results: [game] }))
        .mockResolvedValueOnce(json({ id: 8 }, 201))
      vi.stubGlobal('fetch', request)
      const dialog = await open(locale)
      expect(dialog.get('.item-dialog-title').text()).toBe(
        locale === 'fi' ? fi.igdb.title : en.igdb.title,
      )
      expect(dialog.find('select[name="TmdbMediaType"]').exists()).toBe(false)
      await searchAndSelect(dialog)
      const url = new URL(request.mock.calls[0]![0], 'http://localhost')
      expect(url.pathname).toBe('/api/igdb/search')
      expect(url.searchParams.get('query')).toBe('Example game')
      expect(url.searchParams.has('mediaType')).toBe(false)
      expect(dialog.find('select[name="MediaFormat"]').exists()).toBe(false)
      expect(dialog.find('select[name="Store"]').exists()).toBe(true)
      expect(dialog.get('select[name="Store"]').element.closest('label')?.textContent).toContain(
        locale === 'fi' ? 'Digitaalinen kauppa' : 'Digital store',
      )
      expect(dialog.get('.tmdb-selected img').attributes('src')).toBe(
        'https://images.igdb.com/igdb/image/upload/t_cover_big/cover_id.jpg',
      )
      await dialog.get('select[name="Platform"]').setValue('9')
      await dialog.get('textarea[name="Info"]').setValue('My edition')
      await dialog.get('.tmdb-import-form').trigger('submit')
      await vi.waitFor(() => expect(wrapper!.emitted('saved')).toHaveLength(1))
      expect(request).toHaveBeenLastCalledWith('/api/igdb/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          igdbId: 1942,
          item: {
            name: 'Example game',
            mediaType: 3,
            mediaFormat: null,
            platform: 9,
            info: 'My edition',
            isPhysical: false,
          },
        }),
      })
    },
  )

  it('requires a PC store and clears it when switching to a console', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({ page: 1, hasNextPage: false, results: [game] }))
      .mockResolvedValueOnce(json({ id: 8 }, 201))
    vi.stubGlobal('fetch', request)
    const dialog = await open()
    await searchAndSelect(dialog)
    await dialog.get('.tmdb-import-form').trigger('submit')
    expect(request).toHaveBeenCalledTimes(1)
    expect(dialog.get('[role="alert"]').text()).toBe(fi.itemForm.platformRequired)
    await dialog.get('select[name="Platform"]').setValue('26')
    await dialog.get('.tmdb-import-form').trigger('submit')
    expect(request).toHaveBeenCalledTimes(1)
    expect(dialog.get('[role="alert"]').text()).toBe(fi.itemForm.storeRequired)
    await dialog.get('select[name="Store"]').setValue('1')
    await dialog.get('input[name="IsPhysical"]').setValue(true)
    expect((dialog.get('select[name="Store"]').element as HTMLSelectElement).disabled).toBe(true)
    await dialog.get('input[name="IsPhysical"]').setValue(false)
    expect((dialog.get('select[name="Store"]').element as HTMLSelectElement).disabled).toBe(false)
    expect((dialog.get('select[name="Store"]').element as HTMLSelectElement).value).toBe('')
    await dialog.get('select[name="Store"]').setValue('1')
    await dialog.get('select[name="Platform"]').setValue('9')
    expect(dialog.find('select[name="Store"]').exists()).toBe(true)
    expect((dialog.get('select[name="Store"]').element as HTMLSelectElement).value).toBe('')
    expect(
      dialog.findAll('select[name="Store"] option').map((option) => option.attributes('value')),
    ).toEqual(['', '10', '99'])
    await dialog.get('select[name="Store"]').setValue('10')
    await dialog.get('.tmdb-import-form').trigger('submit')
    await flushPromises()
    const body = JSON.parse(request.mock.calls[1]![1].body)
    expect(body.item.platform).toBe(9)
    expect(body.item.store).toBe(10)
    await vi.waitFor(() => expect(wrapper!.emitted('saved')).toHaveLength(1))
  })

  it('saves a PC copy with its selected store', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({ page: 1, hasNextPage: false, results: [game] }))
      .mockResolvedValueOnce(json({ id: 8 }, 201))
    vi.stubGlobal('fetch', request)
    const dialog = await open()
    await searchAndSelect(dialog)
    await dialog.get('select[name="Platform"]').setValue('26')
    await dialog.get('select[name="Store"]').setValue('2')
    await dialog.get('.tmdb-import-form').trigger('submit')
    await flushPromises()
    expect(JSON.parse(request.mock.calls[1]![1].body).item).toMatchObject({
      platform: 26,
      store: 2,
      mediaFormat: null,
    })
    await vi.waitFor(() => expect(wrapper!.emitted('saved')).toHaveLength(1))
  })

  it('supports pagination, missing covers and controlled configuration errors', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        json({ page: 1, hasNextPage: true, results: [{ ...game, coverImageId: null }] }),
      )
      .mockResolvedValueOnce(json({ code: 'igdb_not_configured' }, 503))
    vi.stubGlobal('fetch', request)
    const dialog = await open()
    await dialog.get('input[name="IgdbQuery"]').setValue('Game')
    await dialog.get('.tmdb-search-form').trigger('submit')
    await flushPromises()
    expect(dialog.get('.tmdb-no-poster').text()).toBe(fi.igdb.noPoster)
    await dialog.get('.tmdb-pagination button:last-child').trigger('click')
    await flushPromises()
    expect(request.mock.calls[1]![0]).toContain('page=2')
    expect(dialog.get('[role="alert"]').text()).toBe(fi.igdb.notConfigured)
    expect(useSnackbar().notice.value?.type).toBe('error')
  })

  it.each(['all', 'movies', 'tvSeries', 'videoGames', 'boardGames'] as const)(
    'offers IGDB only for supported pages while keeping manual addition on %s',
    (category: CollectionCategory) => {
      wrapper = mount(CollectionTable, {
        props: { category, items: [], loading: false, error: false },
        global: { plugins: plugins() },
      })
      expect(wrapper.find('.collection-add-button').exists()).toBe(true)
      expect(wrapper.find('.igdb-add-button').exists()).toBe(
        category === 'all' || category === 'videoGames',
      )
    },
  )

  it('shows an imported game cover in the table and its existing editor', async () => {
    vi.stubGlobal('scrollTo', vi.fn())
    wrapper = mount(CollectionTable, {
      attachTo: document.body,
      props: {
        category: 'videoGames',
        items: [
          {
            id: 8,
            name: game.title,
            mediaType: 3,
            mediaFormat: null,
            platform: 9,
            info: null,
            igdbId: 1942,
            coverImageId: game.coverImageId,
          },
        ],
        loading: false,
        error: false,
      },
      global: { plugins: plugins() },
    })
    expect(wrapper.get('.collection-poster').attributes('src')).toBe(igdbCoverUrl('cover_id'))
    await wrapper.get('.collection-edit-button').trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
    expect(dialog.get('.item-dialog-poster').attributes('src')).toBe(igdbCoverUrl('cover_id'))
    expect((dialog.get('select[name="Platform"]').element as HTMLSelectElement).value).toBe('9')
    expect(igdbCoverUrl('https://example.com/track')).toBeNull()
  })
})

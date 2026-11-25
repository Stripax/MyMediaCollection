import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import BggImportDialog from '../BggImportDialog.vue'
import CollectionTable from '../CollectionTable.vue'
import CollectionItemDialog from '../CollectionItemDialog.vue'
import { useSnackbar } from '../../composables/useSnackbar'
import { bggImageUrl } from '../../models/bgg'
import { itemSourceUrl } from '../../models/itemSources'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'

const game = {
  bggId: 13,
  title: 'CATAN',
  overview: 'Game description',
  yearPublished: 1995,
  imageUrl: 'https://cf.geekdo-images.com/example/pic123.jpg',
  sourceUrl: 'https://boardgamegeek.com/boardgame/13',
  minPlayers: 3,
  maxPlayers: 4,
  playingTime: 90,
  minAge: 10,
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
const plugins = (locale = 'fi') => [createI18n({ legacy: false, locale, messages: { en, fi } })]
let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  useSnackbar().dismiss()
  vi.unstubAllGlobals()
})

async function open(locale = 'fi') {
  wrapper = mount(BggImportDialog, {
    attachTo: document.body,
    global: { plugins: plugins(locale), stubs: { transition: false } },
  })
  await wrapper.get('.bgg-add-button').trigger('click')
  await flushPromises()
  return new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
}

async function search(dialog: DOMWrapper<Element>) {
  await dialog.get('input[name="BggQuery"]').setValue('CATAN & friends')
  await dialog.get('.tmdb-search-form').trigger('submit')
  await flushPromises()
}

describe('BGG import', () => {
  it.each(['all', 'boardGames'] as const)(
    'opens and saves an owned required game even when search hides its row: %s',
    async (category) => {
      const request = vi.fn().mockResolvedValue(json({}, 200))
      vi.stubGlobal('fetch', request)
      const metadata = {
        ...game,
        source: 'BGG' as const,
        originalTitle: null,
        releaseDate: null,
        language: null,
        platforms: [],
        fetchedAt: null,
      }
      wrapper = mount(CollectionTable, {
        props: {
          category,
          loading: false,
          error: false,
          items: [
            {
              id: 1,
              name: 'Expansion item',
              mediaType: 4,
              mediaFormat: 5,
              info: null,
              bggId: 17,
              ...(category === 'boardGames'
                ? {
                    bggId: null,
                    boardGameKind: 2,
                    baseGames: [
                      { collectionItemId: 2, name: 'CATAN' },
                      { bggId: 18, name: 'Missing game' },
                    ],
                  }
                : {}),
              sourceMetadata: {
                ...metadata,
                isExpansion: true,
                requiredGames: [
                  { bggId: 13, name: 'CATAN' },
                  { bggId: 18, name: 'Missing game' },
                ],
              },
            },
            {
              id: 2,
              name: 'My renamed base copy',
              mediaType: 4,
              mediaFormat: 4,
              info: 'Own base notes',
              bggId: category === 'boardGames' ? null : 13,
              sourceMetadata: { ...metadata, isExpansion: false },
            },
          ],
        },
        attachTo: document.body,
        global: { plugins: plugins(), stubs: { transition: false, 'transition-group': false } },
      })
      await wrapper.get('input[type="search"]').setValue('Expansion item')
      await vi.waitFor(() =>
        expect(wrapper!.findAll('button.collection-name-button')).toHaveLength(1),
      )
      const tag = wrapper.get('button.bgg-required-game-badge')
      expect(tag.text()).toBe('CATAN')
      expect(tag.attributes('aria-haspopup')).toBe('dialog')
      expect(tag.attributes('href')).toBeUndefined()
      const external = wrapper.get('a.bgg-required-game-badge')
      expect(external.attributes('href')).toBe('https://boardgamegeek.com/boardgame/18')
      expect(external.attributes('target')).toBe('_blank')
      await tag.trigger('click')
      await flushPromises()
      const dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
      expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe(
        'My renamed base copy',
      )
      expect((dialog.get('textarea[name="Info"]').element as HTMLTextAreaElement).value).toBe(
        'Own base notes',
      )
      await dialog.get('textarea[name="Info"]').setValue('Updated base notes')
      await dialog.get('form').trigger('submit')
      await vi.waitFor(() => expect(wrapper!.emitted('changed')).toHaveLength(1))
      expect(request.mock.calls[0]![0]).toBe('/api/collection/2')
      expect(JSON.parse(request.mock.calls[0]![1].body).Info).toBe('Updated base notes')
      await vi.waitFor(() => expect(document.activeElement).toBe(tag.element))
    },
  )
  it.each(['fi', 'en'])(
    'shows expansion requirements in both import and editor in %s',
    async (locale) => {
      const expansion = {
        ...game,
        isExpansion: true,
        requiredGames: [
          { bggId: 13, name: 'Base CATAN', sourceUrl: 'https://boardgamegeek.com/boardgame/13' },
          {
            bggId: 18,
            name: 'Other required expansion',
            sourceUrl: 'https://boardgamegeek.com/boardgame/18',
          },
        ],
      }
      const labels = locale === 'fi' ? fi : en
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(json({ page: 1, hasNextPage: false, results: [expansion] }))
          .mockResolvedValueOnce(json(expansion)),
      )
      const dialog = await open(locale)
      await search(dialog)
      await dialog.get('.tmdb-result').trigger('click')
      await flushPromises()
      expect(dialog.get('.bgg-expansion-details').text()).toContain(labels.bgg.expansion)
      expect(dialog.get('.bgg-expansion-details').text()).toContain(labels.bgg.requiredGames)
      expect(dialog.findAll('.bgg-required-games a').map((link) => link.text())).toEqual([
        'Base CATAN',
        'Other required expansion',
      ])
      wrapper!.unmount()
      wrapper = mount(CollectionItemDialog, {
        props: {
          item: {
            id: 2,
            name: 'Own expansion',
            mediaType: 4,
            mediaFormat: 5,
            info: 'Own notes',
            sourceMetadata: {
              ...expansion,
              source: 'BGG',
              originalTitle: null,
              releaseDate: null,
              language: null,
              platforms: [],
              fetchedAt: null,
            },
          },
        },
        attachTo: document.body,
        global: { plugins: plugins(locale), stubs: { transition: false } },
      })
      await wrapper.get('button').trigger('click')
      await flushPromises()
      const editor = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
      expect(editor.find('.source-details .bgg-expansion-details').exists()).toBe(false)
      expect((editor.get('select[name="BoardGameKind"]').element as HTMLSelectElement).value).toBe(
        '2',
      )
      expect(
        editor
          .findAll('.board-game-parent input')
          .map((input) => (input.element as HTMLInputElement).value),
      ).toEqual(['Base CATAN', 'Other required expansion'])
    },
  )
  it.each(['fi', 'en'])('searches, loads details and imports a card game in %s', async (locale) => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        json({ page: 1, hasNextPage: false, results: [{ ...game, overview: '', imageUrl: null }] }),
      )
      .mockResolvedValueOnce(json(game))
      .mockResolvedValueOnce(json({ id: 10 }, 201))
    vi.stubGlobal('fetch', request)
    const labels = locale === 'fi' ? fi : en
    const dialog = await open(locale)
    expect(dialog.get('.item-dialog-title').text()).toBe(labels.bgg.title)
    await search(dialog)
    const url = new URL(request.mock.calls[0]![0], 'http://localhost')
    expect(url.pathname).toBe('/api/bgg/search')
    expect(url.searchParams.get('query')).toBe('CATAN & friends')
    expect(url.searchParams.has('language')).toBe(false)
    expect(dialog.get('.tmdb-no-poster').text()).toBe(labels.bgg.noPoster)
    await dialog.get('.tmdb-result').trigger('click')
    await flushPromises()
    expect(request.mock.calls[1]![0]).toBe('/api/bgg/details?bggId=13')
    expect(dialog.get('.tmdb-selected img').attributes('src')).toBe(game.imageUrl)
    expect(dialog.get('.tmdb-selected').text()).toContain('Game description')
    expect(dialog.get('.tmdb-selected').text()).toContain('3–4')
    expect(dialog.get('.tmdb-selected').text()).toContain('90 min')
    expect(dialog.find('select[name="Platform"]').exists()).toBe(false)
    expect(dialog.find('select[name="Store"]').exists()).toBe(false)
    expect(
      dialog
        .get('select[name="MediaFormat"]')
        .findAll('option')
        .map((option) => option.attributes('value')),
    ).toEqual(['4', '5', '99'])
    await dialog.get('select[name="MediaFormat"]').setValue('5')
    await dialog.get('input[name="Name"]').setValue('My CATAN')
    await dialog.get('textarea[name="Info"]').setValue('Own notes')
    const button = dialog.get<HTMLButtonElement>('.tmdb-save-button')
    expect(button.element.form).toBe(dialog.get('form.tmdb-import-form').element)
    await dialog.get('.tmdb-import-form').trigger('submit')
    await vi.waitFor(() => expect(wrapper!.emitted('saved')).toHaveLength(1))
    expect(useSnackbar().notice.value).toMatchObject({
      messageKey: 'collection.notifications.saved.boardGames',
      params: { name: 'My CATAN' },
    })
    expect(JSON.parse(request.mock.calls[2]![1].body)).toEqual({
      bggId: 13,
      item: { name: 'My CATAN', mediaType: 4, mediaFormat: 5, info: 'Own notes' },
    })
  })

  it('keeps saving disabled while details load and ignores a response after closing', async () => {
    let resolveDetails!: (value: Response) => void
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({ page: 1, hasNextPage: false, results: [game] }))
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveDetails = resolve
        }),
      )
    vi.stubGlobal('fetch', request)
    const dialog = await open()
    await search(dialog)
    await dialog.get('.tmdb-result').trigger('click')
    expect(dialog.get('.tmdb-save-button').attributes('disabled')).toBeDefined()
    await dialog.get('.tmdb-import-form').trigger('submit')
    expect(request).toHaveBeenCalledTimes(2)
    wrapper!.unmount()
    wrapper = undefined
    resolveDetails(json(game))
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it.each(['bgg_not_configured', 'bgg_pending', 'bgg_credentials'])(
    'reports %s through the form and snackbar',
    async (code) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code }, 503)))
      const dialog = await open()
      await search(dialog)
      expect(dialog.get('[role="alert"]').text()).toBe(
        code === 'bgg_pending'
          ? fi.bgg.pending
          : code === 'bgg_credentials'
            ? fi.bgg.credentialsError
            : fi.bgg.notConfigured,
      )
      expect(useSnackbar().notice.value?.type).toBe('error')
    },
  )

  it.each(['all', 'boardGames', 'movies', 'tvSeries', 'videoGames'] as const)(
    'shows the search button in the appropriate category: %s',
    (category) => {
      wrapper = mount(CollectionTable, {
        props: { category, items: [], loading: false, error: false },
        global: { plugins: plugins() },
      })
      expect(wrapper.find('.bgg-add-button').exists()).toBe(
        category === 'all' || category === 'boardGames',
      )
    },
  )

  it('shows saved BGG details and a clickable cover in the editor', async () => {
    const item = {
      id: 10,
      name: 'Own copy',
      mediaType: 4,
      mediaFormat: 5,
      info: 'Notes',
      bggId: 13,
      bggImageUrl: game.imageUrl,
      sourceMetadata: {
        ...game,
        source: 'BGG' as const,
        originalTitle: null,
        releaseDate: null,
        language: null,
        platforms: [],
        fetchedAt: null,
      },
    }
    expect(itemSourceUrl(item)).toBe(game.sourceUrl)
    wrapper = mount(CollectionItemDialog, {
      props: { item },
      attachTo: document.body,
      global: { plugins: plugins(), stubs: { transition: false } },
    })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
    expect(dialog.get('a.item-dialog-cover-link').attributes('href')).toBe(game.sourceUrl)
    expect(dialog.get('.source-details').text()).toContain('1995')
    expect(dialog.get('.source-details').text()).toContain('3–4')
    expect(dialog.get('.source-details').text()).toContain('90 min')
    expect(dialog.get('.source-details').text()).toContain('10+')
    await dialog.get('.cover-tooltip').trigger('mouseenter')
    expect(dialog.get('[role="tooltip"]').text()).toBe(fi.sourceMetadata.openBgg)
  })

  it('rejects untrusted cover URLs', () => {
    for (const url of [
      'javascript:alert(1)',
      'https://evil.test/image.jpg',
      'https://cf.geekdo-images.com.evil.test/image.jpg',
      'http://cf.geekdo-images.com/image.jpg',
    ])
      expect(bggImageUrl(url)).toBeNull()
  })
})

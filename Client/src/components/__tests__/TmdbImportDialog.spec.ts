import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import TmdbImportDialog from '../TmdbImportDialog.vue'
import CollectionTable from '../CollectionTable.vue'
import { useSnackbar } from '../../composables/useSnackbar'
import { posterUrl } from '../../models/tmdb'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'
import type { CollectionCategory } from '../../models/collection'

let wrapper: VueWrapper | undefined
const movie = {
  tmdbId: 603,
  mediaType: 1,
  language: 'fi-FI',
  title: 'The Matrix',
  originalTitle: 'The Matrix',
  overview: 'A hacker discovers the truth.',
  releaseDate: '1999-03-30',
  posterPath: '/matrix.jpg',
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status })
}

async function open(category: CollectionCategory = 'all', locale = 'fi') {
  vi.stubGlobal('scrollTo', vi.fn())
  wrapper = mount(TmdbImportDialog, {
    props: { category },
    attachTo: document.body,
    global: {
      stubs: { transition: false },
      plugins: [createI18n({ legacy: false, locale, messages: { en, fi } })],
    },
  })
  await wrapper.get('.tmdb-add-button').trigger('click')
  await flushPromises()
  return new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
}

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  useSnackbar().dismiss()
  vi.unstubAllGlobals()
})

describe('TMDB import', () => {
  it('inspects any collection member without changing its order or cover', async () => {
    const first = { ...movie, overview: 'First description' }
    const second = {
      ...movie,
      tmdbId: 604,
      title: 'Second movie',
      posterPath: '/second.jpg',
      overview: 'Second description',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ page: 1, totalPages: 1, results: [first, second] })),
    )
    const dialog = await open('movies')
    await dialog.get('input[name="IsCollection"]').setValue(true)
    await dialog.get('input[name="TmdbQuery"]').setValue('Movies')
    await dialog.get('.tmdb-search-form').trigger('submit')
    await flushPromises()
    await dialog.findAll('.tmdb-result')[0]!.trigger('click')
    await dialog.findAll('.tmdb-result')[1]!.trigger('click')
    await dialog.get('input[name="Name"]').setValue('My collection')
    await vi.waitFor(() =>
      expect(dialog.get('.tmdb-selected').text()).toContain('Second description'),
    )
    expect(
      dialog.get('.tmdb-selected img:not(.cover-fade-leave-active)').attributes('src'),
    ).toContain('/matrix.jpg')
    await dialog.findAll('.collection-member-title')[0]!.trigger('click')
    await vi.waitFor(() =>
      expect(dialog.get('.tmdb-selected').text()).toContain('First description'),
    )
    await dialog.findAll('.collection-member-title')[1]!.trigger('click')
    await vi.waitFor(() =>
      expect(dialog.get('.tmdb-selected').text()).toContain('Second description'),
    )
    await vi.waitFor(() =>
      expect(dialog.get('.tmdb-selected a').attributes('href')).toContain('/movie/604'),
    )
    expect(
      dialog.get('.tmdb-selected img:not(.cover-fade-leave-active)').attributes('src'),
    ).toContain('/matrix.jpg')
    expect(dialog.findAll('.media-collection-entry-title').map((entry) => entry.text())).toEqual([
      movie.title,
      'Second movie',
    ])
    expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe(
      'My collection',
    )
  })

  it('loads and retains details separately for each TV collection member', async () => {
    const first = { ...movie, mediaType: 2, overview: 'First series overview' }
    const second = {
      ...first,
      tmdbId: 604,
      title: 'Second series',
      overview: 'Second series overview',
    }
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({ page: 1, totalPages: 1, results: [first, second] }))
      .mockResolvedValueOnce(json({ ...first, numberOfSeasons: 3, numberOfEpisodes: 30 }))
      .mockResolvedValueOnce(json({ ...second, numberOfSeasons: 5, numberOfEpisodes: 50 }))
    vi.stubGlobal('fetch', request)
    const dialog = await open('tvSeries')
    await dialog.get('input[name="IsCollection"]').setValue(true)
    await dialog.get('input[name="TmdbQuery"]').setValue('Series')
    await dialog.get('.tmdb-search-form').trigger('submit')
    await flushPromises()
    await dialog.findAll('.tmdb-result')[0]!.trigger('click')
    await flushPromises()
    await dialog.findAll('.tmdb-result')[1]!.trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(dialog.get('.tmdb-selected').text()).toContain('50'))
    await dialog.findAll('.collection-member-title')[0]!.trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(dialog.get('.tmdb-selected').text()).toContain('30'))
    await vi.waitFor(() =>
      expect(dialog.get('.tmdb-selected').text()).toContain('First series overview'),
    )
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('reorders collection entries by dragging and imports the new first title as the cover', async () => {
    const second = { ...movie, tmdbId: 604, title: 'Second movie', posterPath: '/second.jpg' }
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({ page: 1, totalPages: 1, results: [movie, second] }))
      .mockResolvedValueOnce(json({ id: 77 }, 201))
    vi.stubGlobal('fetch', request)
    const dialog = await open('movies')
    await dialog.get('input[name="IsCollection"]').setValue(true)
    await dialog.get('input[name="TmdbQuery"]').setValue('Movies')
    await dialog.get('.tmdb-search-form').trigger('submit')
    await flushPromises()
    await dialog.findAll('.tmdb-result')[0]!.trigger('click')
    await dialog.findAll('.tmdb-result')[1]!.trigger('click')
    await dialog.get('input[name="Name"]').setValue('My box')
    const transfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() }
    await dialog
      .findAll('.collection-drag-handle')[1]!
      .trigger('dragstart', { dataTransfer: transfer })
    await dialog
      .findAll('.media-collection-selection li')[0]!
      .trigger('dragover', { dataTransfer: transfer })
    expect(dialog.find('.collection-entry-drop-target').exists()).toBe(true)
    await dialog
      .findAll('.media-collection-selection li')[0]!
      .trigger('drop', { dataTransfer: transfer })
    expect(dialog.findAll('.media-collection-entry-title').map((entry) => entry.text())).toEqual([
      'Second movie',
      movie.title,
    ])
    expect(
      dialog.get('.tmdb-selected img:not(.cover-fade-leave-active)').attributes('src'),
    ).toContain('/second.jpg')
    await vi.waitFor(() =>
      expect(dialog.get('.tmdb-selected a').attributes('href')).toContain('/movie/604'),
    )
    expect(dialog.find('.collection-entry-dragging').exists()).toBe(false)
    await dialog.get('.tmdb-import-form').trigger('submit')
    await flushPromises()
    expect(JSON.parse(request.mock.calls[1]![1].body)).toMatchObject({
      tmdbId: 604,
      tmdbIds: [604, 603],
      item: { name: 'My box', mediaFormat: 1 },
    })
  })

  it('toggles the first and last collection selections from search results and updates the cover', async () => {
    const second = { ...movie, tmdbId: 604, title: 'Second movie', posterPath: '/second.jpg' }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ page: 1, totalPages: 1, results: [movie, second] })),
    )
    const dialog = await open('movies')
    await dialog.get('input[name="IsCollection"]').setValue(true)
    await dialog.get('input[name="TmdbQuery"]').setValue('Movies')
    await dialog.get('.tmdb-search-form').trigger('submit')
    await flushPromises()
    const [firstResult, secondResult] = dialog.findAll('.tmdb-result')
    await firstResult!.trigger('click')
    await secondResult!.trigger('click')
    await dialog.get('input[name="Name"]').setValue('Own box')
    await firstResult!.trigger('click')
    expect(dialog.findAll('.media-collection-selection li')).toHaveLength(1)
    expect(firstResult!.attributes('aria-pressed')).toBe('false')
    expect(
      dialog.get('.tmdb-selected img:not(.cover-fade-leave-active)').attributes('src'),
    ).toContain('/second.jpg')
    await secondResult!.trigger('click')
    expect(dialog.find('.tmdb-import-form').exists()).toBe(false)
    expect(dialog.find('.tmdb-save-button').exists()).toBe(false)
    expect(secondResult!.attributes('aria-pressed')).toBe('false')
    await firstResult!.trigger('click')
    expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe('Own box')
    expect(
      dialog.get('.tmdb-selected img:not(.cover-fade-leave-active)').attributes('src'),
    ).toContain('/matrix.jpg')
    expect(firstResult!.attributes('aria-pressed')).toBe('true')
  })

  it.each(['movies', 'tvSeries'] as const)(
    'uses an English overview for %s when Finnish is missing without replacing the Finnish name',
    async (category) => {
      const result = {
        ...movie,
        mediaType: category === 'movies' ? 1 : 2,
        title: 'Suomenkielinen nimi',
        overview: '  ',
      }
      const request = vi
        .fn()
        .mockResolvedValueOnce(json({ page: 1, totalPages: 1, results: [result] }))
        .mockResolvedValueOnce(json(result))
        .mockResolvedValueOnce(
          json({
            ...result,
            language: 'en-US',
            title: 'English name',
            overview: 'English description',
          }),
        )
      vi.stubGlobal('fetch', request)
      const dialog = await open(category)
      await dialog.get('input[name="TmdbQuery"]').setValue('Series')
      await dialog.get('.tmdb-search-form').trigger('submit')
      await flushPromises()
      await dialog.get('.tmdb-result').trigger('click')
      await flushPromises()
      expect(dialog.get('.tmdb-selected').text()).toContain('English description')
      expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe(
        'Suomenkielinen nimi',
      )
      expect(request.mock.calls[2]![0]).toContain('language=en-US')
    },
  )

  it.each(['fi', 'en'])(
    'shows the generic missing description text in %s when no overview is available',
    async (locale) => {
      const result = {
        ...movie,
        mediaType: 2,
        language: locale === 'fi' ? 'fi-FI' : 'en-US',
        overview: '',
      }
      const request = vi
        .fn()
        .mockResolvedValue(json(result))
        .mockResolvedValueOnce(json({ page: 1, totalPages: 1, results: [result] }))
      vi.stubGlobal('fetch', request)
      const dialog = await open('tvSeries', locale)
      await dialog.get('input[name="TmdbQuery"]').setValue('Series')
      await dialog.get('.tmdb-search-form').trigger('submit')
      await flushPromises()
      await dialog.get('.tmdb-result').trigger('click')
      await flushPromises()
      expect(dialog.get('.tmdb-selected').text()).toContain(
        locale === 'fi' ? 'Kuvausta ei ole saatavilla.' : 'No description available.',
      )
      expect(request).toHaveBeenCalledTimes(locale === 'fi' ? 3 : 2)
    },
  )

  it('keeps multiple TMDB selections across searches and uses the first cover for a box', async () => {
    const second = {
      ...movie,
      tmdbId: 604,
      title: 'The Matrix Reloaded',
      posterPath: '/reloaded.jpg',
    }
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({ page: 1, totalPages: 1, results: [movie] }))
      .mockResolvedValueOnce(json({ page: 1, totalPages: 1, results: [second] }))
      .mockResolvedValueOnce(json({ id: 77 }, 201))
    vi.stubGlobal('fetch', request)
    const dialog = await open('movies')
    await dialog.get('input[name="IsCollection"]').setValue(true)
    await dialog.get('input[name="TmdbQuery"]').setValue('Matrix')
    await dialog.get('.tmdb-search-form').trigger('submit')
    await flushPromises()
    await dialog.get('.tmdb-result').trigger('click')
    await dialog.get('input[name="Name"]').setValue('Matrix collection')
    expect(dialog.get('.tmdb-result').attributes('data-selected')).toBe('true')
    expect(dialog.get('.tmdb-result').attributes('aria-pressed')).toBe('true')
    expect(dialog.get('.tmdb-select-label').text()).toBe('Valittu')
    expect(dialog.find('.tmdb-selection-check').exists()).toBe(true)
    await dialog.get('input[name="TmdbQuery"]').setValue('Reloaded')
    await dialog.get('.tmdb-search-form').trigger('submit')
    await flushPromises()
    expect(dialog.get('.tmdb-result').attributes('data-selected')).toBeUndefined()
    await dialog.get('.tmdb-result').trigger('click')
    await dialog.get('.tmdb-result').trigger('click')
    expect(dialog.findAll('.media-collection-selection li')).toHaveLength(1)
    expect(dialog.get('.tmdb-result').attributes('aria-pressed')).toBe('false')
    expect(dialog.get('.tmdb-select-label').text()).toBe('Valitse')
    await dialog.get('.tmdb-result').trigger('click')
    expect(dialog.findAll('.media-collection-selection li')).toHaveLength(2)
    expect(
      dialog.get('.tmdb-selected img:not(.cover-fade-leave-active)').attributes('src'),
    ).toContain('/matrix.jpg')
    await dialog.findAll('.media-collection-remove')[1]!.trigger('click')
    expect(dialog.get('.tmdb-result').attributes('data-selected')).toBeUndefined()
    expect(dialog.get('.tmdb-result').attributes('aria-pressed')).toBe('false')
    expect(dialog.get('.tmdb-select-label').text()).toBe('Valitse')
    await dialog.get('.tmdb-result').trigger('click')
    await dialog.get('select[name="MediaFormat"]').setValue('2')
    await dialog.get('.tmdb-import-form').trigger('submit')
    await flushPromises()
    expect(JSON.parse(request.mock.calls[2]![1].body)).toEqual({
      tmdbId: 603,
      tmdbIds: [603, 604],
      language: 'fi-FI',
      useLocalizedName: false,
      item: {
        name: 'Matrix collection',
        mediaType: 1,
        mediaFormat: 2,
        info: '',
        isCollection: true,
      },
    })
  })

  it('searches, selects a movie and saves its own copy details with a TMDB reference', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({ page: 1, totalPages: 1, results: [movie] }))
      .mockResolvedValueOnce(json({ id: 12 }, 201))
    vi.stubGlobal('fetch', request)
    const dialog = await open('movies')
    expect(dialog.find('select[name="TmdbMediaType"]').exists()).toBe(false)
    await dialog.get('input[name="TmdbQuery"]').setValue('Matrix & yö')
    await dialog.get('.tmdb-search-form').trigger('submit')
    await flushPromises()
    const address = new URL(request.mock.calls[0]![0], 'http://localhost')
    expect(address.pathname).toBe('/api/tmdb/search')
    expect(address.searchParams.get('query')).toBe('Matrix & yö')
    expect(address.searchParams.get('mediaType')).toBe('1')
    expect(address.searchParams.get('language')).toBe('fi-FI')
    expect(dialog.get('.tmdb-result-poster').attributes('src')).toBe(
      'https://image.tmdb.org/t/p/w185/matrix.jpg',
    )
    await dialog.get('.tmdb-result').trigger('click')
    expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe('The Matrix')
    await dialog.get('select[name="MediaFormat"]').setValue('3')
    await dialog.get('textarea[name="Info"]').setValue('Steelbook edition')
    const saveButton = dialog.get('.item-dialog-actions .tmdb-save-button')
    expect((saveButton.element as HTMLButtonElement).form).toBe(
      dialog.get('.tmdb-import-form').element,
    )
    expect(dialog.find('.item-dialog-actions .item-dialog-cancel').exists()).toBe(true)
    await saveButton.trigger('click')
    await flushPromises()
    expect(request).toHaveBeenLastCalledWith('/api/tmdb/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tmdbId: 603,
        language: 'fi-FI',
        useLocalizedName: true,
        item: { name: 'The Matrix', mediaType: 1, mediaFormat: 3, info: 'Steelbook edition' },
      }),
    })
    await vi.waitFor(() => expect(wrapper!.emitted('saved')).toHaveLength(1))
    expect(useSnackbar().notice.value?.messageKey).toBe('collection.notifications.saved.movies')
    expect(useSnackbar().notice.value?.params).toEqual({ name: 'The Matrix' })
  })

  it('supports TV selection, pagination and missing posters', async () => {
    const request = vi
      .fn()
      .mockImplementation(async () =>
        json({ page: 1, totalPages: 2, results: [{ ...movie, mediaType: 2, posterPath: null }] }),
      )
    vi.stubGlobal('fetch', request)
    const dialog = await open('all', 'en')
    expect(dialog.findAll('select[name="TmdbMediaType"] option')).toHaveLength(2)
    await dialog.get('select[name="TmdbMediaType"]').setValue('2')
    await dialog.get('input[name="TmdbQuery"]').setValue('Example')
    await dialog.get('.tmdb-search-form').trigger('submit')
    await flushPromises()
    expect(dialog.get('.tmdb-no-poster').text()).toBe(en.tmdb.noPoster)
    expect(request.mock.calls[0]![0]).toContain('mediaType=2')
    expect(request.mock.calls[0]![0]).toContain('language=en-US')
    await dialog.get('.tmdb-pagination button:last-child').trigger('click')
    await flushPromises()
    expect(request.mock.calls[1]![0]).toContain('page=2')
    await dialog.get('.tmdb-result').trigger('click')
    await dialog.get('select[name="TmdbMediaType"]').setValue('1')
    expect(dialog.find('.tmdb-import-form').exists()).toBe(false)
    expect(dialog.find('.tmdb-results').exists()).toBe(false)
  })

  it('reports missing configuration while keeping the dialog usable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code: 'tmdb_not_configured' }, 503)))
    const dialog = await open()
    await dialog.get('input[name="TmdbQuery"]').setValue('Movie')
    await dialog.get('.tmdb-search-form').trigger('submit')
    await flushPromises()
    expect(dialog.get('[role="alert"]').text()).toBe(fi.tmdb.notConfigured)
    expect(useSnackbar().notice.value?.type).toBe('error')
    expect(wrapper!.get('.tmdb-add-button').attributes('aria-expanded')).toBe('true')
    expect(wrapper!.emitted('saved')).toBeUndefined()
  })

  it('ignores stale search results after the category or query changes', async () => {
    let resolve!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((done) => {
            resolve = done
          }),
      ),
    )
    const dialog = await open()
    await dialog.get('input[name="TmdbQuery"]').setValue('Movie')
    await dialog.get('.tmdb-search-form').trigger('submit')
    await dialog.get('select[name="TmdbMediaType"]').setValue('2')
    resolve(json({ page: 1, totalPages: 1, results: [movie] }))
    await flushPromises()
    expect(dialog.find('.tmdb-result').exists()).toBe(false)
  })

  it('keeps a failed import open for retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ page: 1, totalPages: 1, results: [movie] }))
        .mockResolvedValueOnce(json({}, 503)),
    )
    const dialog = await open()
    await dialog.get('input[name="TmdbQuery"]').setValue('Movie')
    await dialog.get('.tmdb-search-form').trigger('submit')
    await flushPromises()
    await dialog.get('.tmdb-result').trigger('click')
    await dialog.get('.tmdb-import-form').trigger('submit')
    await flushPromises()
    expect(dialog.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper!.emitted('saved')).toBeUndefined()
    expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe(movie.title)
  })

  it.each(['all', 'movies', 'tvSeries', 'videoGames', 'boardGames'] as const)(
    'keeps manual addition and offers TMDB only for supported categories on %s',
    (category) => {
      wrapper = mount(CollectionTable, {
        props: {
          category,
          items: [
            {
              id: 1,
              name: 'My movie',
              mediaType: 1,
              mediaFormat: 1,
              info: null,
              tmdbId: 603,
              posterPath: '/matrix.jpg',
            },
          ],
          loading: false,
          error: false,
        },
        global: { plugins: [createI18n({ legacy: false, locale: 'fi', messages: { en, fi } })] },
      })
      expect(wrapper.find('.collection-add-button').exists()).toBe(true)
      expect(wrapper.find('.tmdb-add-button').exists()).toBe(
        ['all', 'movies', 'tvSeries'].includes(category),
      )
      if (category === 'all' || category === 'movies')
        expect(wrapper.get('.collection-poster').attributes('src')).toBe(
          'https://image.tmdb.org/t/p/w185/matrix.jpg',
        )
    },
  )

  it('accepts only TMDB image paths when constructing poster URLs', () => {
    expect(posterUrl('https://example.com/track.jpg')).toBeNull()
    expect(posterUrl('/../../track.jpg')).toBeNull()
    expect(posterUrl(null)).toBeNull()
    expect(posterUrl('/cover.jpg')).toBe('https://image.tmdb.org/t/p/w185/cover.jpg')
  })
})

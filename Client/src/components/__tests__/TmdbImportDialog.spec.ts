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
    await dialog.get('.tmdb-import-form').trigger('submit')
    await flushPromises()
    expect(request).toHaveBeenLastCalledWith('/api/tmdb/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tmdbId: 603,
        language: 'fi-FI',
        item: { name: 'The Matrix', mediaType: 1, mediaFormat: 3, info: 'Steelbook edition' },
      }),
    })
    await vi.waitFor(() => expect(wrapper!.emitted('saved')).toHaveLength(1))
    expect(useSnackbar().notice.value?.messageKey).toBe('itemForm.saved')
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

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import CollectionItemDialog from '../CollectionItemDialog.vue'
import { useSnackbar } from '../../composables/useSnackbar'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'
import {
  mediaCategories,
  type CollectionCategory,
  type CollectionItem,
} from '../../models/collection'

let wrapper: VueWrapper | undefined

async function openForm(
  locale = 'fi',
  item?: CollectionItem,
  category: CollectionCategory = 'all',
  items: CollectionItem[] = [],
) {
  wrapper = mount(CollectionItemDialog, {
    props: { item, category, items },
    attachTo: document.body,
    global: {
      stubs: { transition: false },
      plugins: [createI18n({ legacy: false, locale, messages: { en, fi } })],
    },
  })
  await wrapper.get('button').trigger('click')
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
  return new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
}

afterEach(() => {
  wrapper?.unmount()
  useSnackbar().dismiss()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('Collection item dialog', () => {
  it.each(['movies', 'tvSeries'] as const)(
    'adds a manual %s collection with one shared format',
    async (category) => {
      const request = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }))
      vi.stubGlobal('fetch', request)
      const dialog = await openForm('fi', undefined, category)
      expect(dialog.findAll('label > span')[0]!.text()).toBe(fi.mediaCollection.label)
      await dialog.get('input[name="IsCollection"]').setValue(true)
      await dialog.get('input[name="Name"]').setValue('Oma boksi')
      await dialog.get('input[name="CollectionContent-0"]').setValue('Ensimmäinen')
      await dialog.get('.media-collection-contents > button').trigger('click')
      await dialog.get('input[name="CollectionContent-1"]').setValue('Toinen')
      await dialog.get('select[name="MediaFormat"]').setValue('2')
      expect(dialog.find('.tv-season-ownership').exists()).toBe(false)
      expect(dialog.findAll('select[name="MediaFormat"]')).toHaveLength(1)
      await dialog.get('form').trigger('submit')
      expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({
        MediaType: category === 'movies' ? 1 : 2,
        Name: 'Oma boksi',
        MediaFormat: 2,
        Info: '',
        IsCollection: true,
        CollectionContents: [{ Name: 'Ensimmäinen' }, { Name: 'Toinen' }],
      })
    },
  )

  it('edits imported collection contents while retaining their source references', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', request)
    const dialog = await openForm('fi', {
      id: 77,
      name: 'Boksi',
      mediaType: 1,
      mediaFormat: 2,
      info: null,
      isCollection: true,
      collectionContents: [
        { name: 'Ensimmäinen', tmdbId: 701 },
        { name: 'Toinen', tmdbId: 702 },
      ],
    })
    expect((dialog.get('input[name="IsCollection"]').element as HTMLInputElement).checked).toBe(
      true,
    )
    await dialog.get('input[name="CollectionContent-1"]').setValue('Uusi nimi')
    await dialog.get('form').trigger('submit')
    expect(JSON.parse(request.mock.calls[0]![1].body).CollectionContents).toEqual([
      { Name: 'Ensimmäinen', TmdbId: 701 },
      { Name: 'Uusi nimi', TmdbId: 702 },
    ])
  })

  it.each([
    ['fi', 2],
    ['en', 2],
    ['fi', 99],
    ['en', 99],
  ] as const)(
    'adds a manual related item with a named base game in %s (kind %s)',
    async (locale, kind) => {
      const request = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }))
      vi.stubGlobal('fetch', request)
      const labels = locale === 'fi' ? fi : en
      const dialog = await openForm(locale, undefined, 'boardGames')
      expect(dialog.findAll('label > span').map((label) => label.text())).toEqual([
        labels.itemForm.name,
        labels.bgg.classification,
        labels.itemForm.gameType,
        labels.itemForm.info,
      ])
      expect(
        dialog
          .findAll('select[name="BoardGameKind"] option')
          .map((option) => option.attributes('value')),
      ).toEqual(['1', '2', '99'])
      await dialog.get('input[name="Name"]').setValue('My expansion')
      await dialog.get('select[name="BoardGameKind"]').setValue(String(kind))
      await dialog.get('input[name="BaseGameName-0"]').setValue('Unlisted base game')
      await dialog.get('select[name="MediaFormat"]').setValue('5')
      await dialog.get('form').trigger('submit')
      expect(JSON.parse(request.mock.calls[0]![1].body)).toMatchObject({
        MediaType: 4,
        MediaFormat: 5,
        BoardGameKind: kind,
        BaseGames: [{ name: 'Unlisted base game' }],
      })
    },
  )

  it('prefills BGG expansion defaults, selects owned parents by ID and saves an independent override', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', request)
    const parent: CollectionItem = {
      id: 20,
      name: 'Renamed base',
      mediaType: 4,
      mediaFormat: 4,
      info: null,
      bggId: 13,
    }
    const dialog = await openForm(
      'fi',
      {
        id: 30,
        name: 'Expansion',
        mediaType: 4,
        mediaFormat: 5,
        info: null,
        bggId: 17,
        sourceMetadata: {
          source: 'BGG',
          title: 'Source expansion',
          originalTitle: null,
          overview: '',
          releaseDate: null,
          language: null,
          platforms: [],
          fetchedAt: null,
          isExpansion: true,
          requiredGames: [{ bggId: 13, name: 'BGG base' }],
        },
      },
      'boardGames',
      [parent],
    )
    expect((dialog.get('select[name="BoardGameKind"]').element as HTMLSelectElement).value).toBe(
      '2',
    )
    expect((dialog.get('select[name="BaseGameId-0"]').element as HTMLSelectElement).value).toBe(
      '20',
    )
    expect(dialog.find('.source-details .bgg-expansion-details').exists()).toBe(false)
    await dialog.get('select[name="BoardGameKind"]').setValue('1')
    expect(dialog.find('.board-game-parents').exists()).toBe(false)
    await dialog.get('form').trigger('submit')
    expect(JSON.parse(request.mock.calls[0]![1].body)).toMatchObject({
      BoardGameKind: 1,
      BaseGames: [],
    })
  })

  it('preserves an owned base game when switching from Expansion to Other', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }))
    vi.stubGlobal('fetch', request)
    const dialog = await openForm('fi', undefined, 'boardGames', [
      { id: 20, name: 'Manual base', mediaType: 4, mediaFormat: 4, info: null },
    ])
    await dialog.get('input[name="Name"]').setValue('Expansion')
    await dialog.get('select[name="BoardGameKind"]').setValue('2')
    await dialog.get('select[name="BaseGameId-0"]').setValue('20')
    await dialog.get('select[name="BoardGameKind"]').setValue('99')
    expect((dialog.get('select[name="BaseGameId-0"]').element as HTMLSelectElement).value).toBe(
      '20',
    )
    expect(dialog.find('input[name="BaseGameName-0"]').exists()).toBe(false)
    await dialog.get('select[name="MediaFormat"]').setValue('4')
    await dialog.get('form').trigger('submit')
    expect(JSON.parse(request.mock.calls[0]![1].body).BoardGameKind).toBe(99)
    expect(JSON.parse(request.mock.calls[0]![1].body).BaseGames).toEqual([
      { collectionItemId: 20, name: 'Manual base' },
    ])
  })
  it.each([false, true])(
    'tracks name changes separately from other edits for a localized TMDB item (renaming: %s)',
    async (renaming) => {
      const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
      vi.stubGlobal('fetch', request)
      const dialog = await openForm('en', {
        id: 110,
        name: 'Tappajahai',
        mediaType: 1,
        mediaFormat: 2,
        info: null,
        tmdbId: 578,
        isNameCustom: false,
        localizedTitles: { fi: 'Tappajahai', en: 'Jaws' },
      })
      expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe('Jaws')
      await dialog.get('textarea[name="Info"]').setValue('Own notes')
      if (renaming) await dialog.get('input[name="Name"]').setValue('My own title')
      await dialog.get('form').trigger('submit')
      const body = JSON.parse(request.mock.calls[0]![1].body)
      expect(body.NameWasEdited).toBe(renaming)
      expect(body.Name).toBe(renaming ? 'My own title' : 'Jaws')
      await vi.waitFor(() =>
        expect(useSnackbar().notice.value).toMatchObject({
          messageKey: 'collection.notifications.updated.movies',
          params: { name: renaming ? 'My own title' : 'Jaws' },
        }),
      )
    },
  )

  it('prefills and edits a physical console copy and its console store', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', request)
    const dialog = await openForm('fi', {
      id: 105,
      name: 'Console game',
      mediaType: 3,
      mediaFormat: null,
      platform: 3,
      store: 9,
      isPhysical: true,
      info: null,
    })
    const physical = dialog.get('input[name="IsPhysical"]')
    expect((physical.element as HTMLInputElement).checked).toBe(true)
    expect((dialog.get('select[name="Store"]').element as HTMLSelectElement).value).toBe('9')
    expect(dialog.get('select[name="Store"] option[value="10"]').text()).toBe('PlayStation Store')
    await physical.setValue(false)
    await dialog.get('select[name="Store"]').setValue('10')
    await dialog.get('form').trigger('submit')
    expect(request).toHaveBeenCalledWith(
      '/api/collection/105',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(JSON.parse(request.mock.calls[0]![1].body)).toMatchObject({
      IsPhysical: false,
      Store: 10,
      Platform: 3,
    })
  })

  it('adds a physical PC copy without requiring a digital store', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }))
    vi.stubGlobal('fetch', request)
    const dialog = await openForm('fi', undefined, 'videoGames')
    await dialog.get('input[name="Name"]').setValue('Boxed PC game')
    await dialog.get('select[name="Platform"]').setValue('26')
    await dialog.get('input[name="IsPhysical"]').setValue(true)
    expect(dialog.get('select[name="Store"]').attributes('required')).toBeUndefined()
    await dialog.get('form').trigger('submit')
    const body = JSON.parse(request.mock.calls[0]![1].body)
    expect(body.IsPhysical).toBe(true)
    expect(body.Platform).toBe(26)
    expect(body).not.toHaveProperty('Store')
  })

  it.each([
    ['fi', 'TMDB'],
    ['en', 'TMDB'],
    ['fi', 'IGDB'],
    ['en', 'IGDB'],
  ] as const)(
    'shows stored %s %s metadata read-only while saving personal changes separately',
    async (locale, source) => {
      const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
      vi.stubGlobal('fetch', request)
      const labels = locale === 'fi' ? fi : en
      const dialog = await openForm(locale, {
        id: 101,
        name: 'Own copy',
        mediaType: source === 'TMDB' ? 2 : 3,
        mediaFormat: source === 'TMDB' ? 2 : null,
        platform: source === 'IGDB' ? 9 : null,
        info: 'Personal notes',
        sourceMetadata: {
          source,
          title: 'Imported title',
          originalTitle: source === 'TMDB' ? 'Original title' : null,
          overview: 'Imported overview\nSecond line',
          releaseDate: '2023-09-10',
          language: source === 'TMDB' ? 'fi-FI' : null,
          platforms: source === 'IGDB' ? ['PlayStation 5', 'PC'] : [],
          fetchedAt: '2026-11-24T08:00:00Z',
        },
      })
      const details = dialog.get('.source-details')
      expect(details.text()).toContain('Imported title')
      expect(details.text()).toContain('2023')
      expect(details.text()).toContain('Imported overview')
      expect(details.text()).toContain(labels.sourceMetadata.overview)
      expect(details.get('time').attributes('datetime')).toBe('2023-09-10')
      expect(details.findAll('input, textarea, select')).toHaveLength(0)
      if (source === 'IGDB') expect(details.text()).toContain('PlayStation 5, PC')
      else {
        expect(details.text()).toContain('Original title')
        expect(details.text()).toContain(labels.sourceMetadata.firstAirDate)
        expect(details.text()).not.toContain(labels.sourceMetadata.language)
      }
      expect((dialog.get('textarea[name="Info"]').element as HTMLTextAreaElement).value).toBe(
        'Personal notes',
      )
      await dialog.get('input[name="Name"]').setValue('Renamed copy')
      await dialog.get('form').trigger('submit')
      const body = JSON.parse(request.mock.calls[0]![1].body)
      expect(body.Name).toBe('Renamed copy')
      expect(body.Info).toBe('Personal notes')
      expect(body).not.toHaveProperty('sourceMetadata')
    },
  )

  it('handles missing source dates and overviews without affecting the manual fields', async () => {
    const dialog = await openForm('fi', {
      id: 102,
      name: 'Incomplete title',
      mediaType: 1,
      mediaFormat: 1,
      info: null,
      sourceMetadata: {
        source: 'TMDB',
        title: 'Incomplete title',
        originalTitle: null,
        overview: '',
        releaseDate: null,
        language: null,
        platforms: [],
        fetchedAt: null,
      },
    })
    expect(dialog.get('.source-details').text()).toContain(fi.sourceMetadata.unknown)
    expect(dialog.get('.source-details').text()).toContain(fi.sourceMetadata.noOverview)
    expect(dialog.find('.source-details time').exists()).toBe(false)
    expect(dialog.find('input[name="Name"]').exists()).toBe(true)
  })

  it.each([
    ['fi', false],
    ['en', false],
    ['fi', true],
    ['en', true],
  ] as const)('updates category-specific titles in %s (editing: %s)', async (locale, editing) => {
    const dialog = await openForm(
      locale,
      editing ? { id: 60, name: 'Kohde', mediaType: 1, mediaFormat: 1, info: null } : undefined,
    )
    const labels = locale === 'fi' ? fi : en
    expect(dialog.get('button[type="submit"]').text()).toBe(
      editing ? labels.itemForm.saveChanges : labels.itemForm.add,
    )
    if (editing) {
      expect(dialog.find('select[name="MediaType"]').exists()).toBe(false)
      expect(dialog.get('.item-form-category dt').text()).toBe(labels.itemForm.category)
      expect(dialog.get('.item-form-category dd').text()).toBe(labels.sidebar.movies)
      expect(dialog.get('.item-dialog-title').text()).toBe(labels.collection.editTitles.movies)
      return
    }
    for (const category of mediaCategories) {
      await dialog.get('select[name="MediaType"]').setValue(String(category.value))
      expect(dialog.get('.item-dialog-title').text()).toBe(
        editing ? labels.collection.editTitles[category.id] : labels.collection.add[category.id],
      )
    }
  })

  it.each([
    ['movies', 1],
    ['tvSeries', 2],
    ['videoGames', 3],
    ['boardGames', 4],
  ] as const)(
    'hides the category selector and submits the page category on %s',
    async (category, mediaType) => {
      const request = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }))
      vi.stubGlobal('fetch', request)
      const dialog = await openForm('fi', undefined, category)
      expect(dialog.get('.item-dialog-title').text()).toBe(fi.collection.add[category])
      expect(dialog.find('select[name="MediaType"]').exists()).toBe(false)
      expect(dialog.get('input[name="Name"]').element.closest('label')?.textContent).toBe(
        fi.itemForm.name,
      )
      await dialog.get('input[name="Name"]').setValue('Uusi kohde')
      if (mediaType === 3) await dialog.get('select[name="Platform"]').setValue('9')
      if (mediaType === 4) await dialog.get('select[name="MediaFormat"]').setValue('4')
      await dialog.get('form').trigger('submit')
      expect(request).toHaveBeenCalledWith('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          MediaType: mediaType,
          Name: 'Uusi kohde',
          MediaFormat: mediaType === 4 ? 4 : mediaType < 3 ? 1 : null,
          Info: '',
          ...(mediaType === 3 ? { Platform: 9, IsPhysical: false } : {}),
          ...(mediaType === 4 ? { BoardGameKind: 1, BaseGames: [] } : {}),
          ...(mediaType === 2 ? { IsCompleteBox: false, OwnedSeasons: [] } : {}),
        }),
      })
      await vi.waitFor(() =>
        expect(useSnackbar().notice.value).toMatchObject({
          messageKey: `collection.notifications.saved.${category}`,
          params: { name: 'Uusi kohde' },
        }),
      )
    },
  )

  it.each(mediaCategories)(
    'preserves category $id when editing without a category selector',
    async (category) => {
      const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
      vi.stubGlobal('fetch', request)
      const dialog = await openForm(
        'fi',
        {
          id: 50,
          name: 'Kohde',
          mediaType: category.value,
          mediaFormat: category.value === 4 ? 4 : 2,
          platform: category.value === 3 ? 9 : null,
          info: null,
        },
        category.id,
      )
      expect(dialog.find('select[name="MediaType"]').exists()).toBe(false)
      expect(dialog.get('.item-dialog-title').text()).toBe(fi.collection.editTitles[category.id])
      expect(dialog.get('.item-form-category dd').text()).toBe(fi.sidebar[category.id])
      await dialog.get('input[name="Name"]').setValue('Muokattu kohde')
      await dialog.get('form').trigger('submit')
      expect(request).toHaveBeenCalledWith(
        '/api/collection/50',
        expect.objectContaining({ method: 'PUT' }),
      )
      const body = JSON.parse(request.mock.calls[0]![1].body)
      expect(body.MediaType).toBe(category.value)
      expect(body.Name).toBe('Muokattu kohde')
      await vi.waitFor(() =>
        expect(useSnackbar().notice.value).toMatchObject({
          messageKey: `collection.notifications.updated.${category.id}`,
          params: { name: 'Muokattu kohde' },
        }),
      )
    },
  )

  it.each(['fi', 'en'])('opens a translated form with enum values in %s', async (locale) => {
    const dialog = await openForm(locale)
    const labels = locale === 'fi' ? fi : en
    expect(dialog.get('.item-dialog-title').text()).toBe(labels.collection.add.movies)
    expect(dialog.findAll('label > span').map((label) => label.text())).toEqual([
      labels.itemForm.category,
      labels.mediaCollection.label,
      labels.itemForm.name,
      labels.itemForm.mediaFormat,
      labels.itemForm.info,
    ])
    expect(
      dialog.findAll('select[name="MediaType"] option').map((option) => option.attributes('value')),
    ).toEqual(['1', '2', '3', '4'])
    expect(
      dialog
        .findAll('select[name="MediaFormat"] option')
        .map((option) => [option.attributes('value'), option.text()]),
    ).toEqual([
      ['1', 'DVD'],
      ['2', 'Blu-ray'],
      ['3', '4K UHD Blu-ray'],
      ['99', labels.common.other],
    ])

    await dialog.get('select[name="MediaType"]').setValue('2')
    await dialog.get('input[name="Name"]').setValue('Test collection item')
    await dialog.get('select[name="MediaFormat"]').setValue('3')
    await dialog.get('textarea[name="Info"]').setValue('First line\nSecond line')
    expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe(
      'Test collection item',
    )
    expect((dialog.get('textarea[name="Info"]').element as HTMLTextAreaElement).value).toBe(
      'First line\nSecond line',
    )
    expect((dialog.get('select[name="MediaType"]').element as HTMLSelectElement).value).toBe('2')
    expect((dialog.get('select[name="MediaFormat"]').element as HTMLSelectElement).value).toBe('3')

    await dialog.get('button').trigger('click')
    await vi.waitFor(() => expect(wrapper!.get('button').attributes('aria-expanded')).toBe('false'))
  })

  it.each(['fi', 'en'])(
    'shows console options for video games and saves Platform in %s',
    async (locale) => {
      const request = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }))
      vi.stubGlobal('fetch', request)
      const dialog = await openForm(locale)
      const labels = locale === 'fi' ? fi : en
      await dialog.get('select[name="MediaType"]').setValue('3')
      expect(dialog.find('select[name="MediaFormat"]').exists()).toBe(false)
      expect(dialog.findAll('label > span')[2]!.text()).toBe(labels.itemForm.platform)
      const platformNames = dialog
        .findAll('select[name="Platform"] option')
        .map((option) => option.text())
      expect(platformNames).toEqual(
        expect.arrayContaining([
          'Xbox',
          'Xbox 360',
          'Xbox One',
          'Xbox Series S/X',
          'PlayStation 3',
          'PlayStation 4',
          'PlayStation 5',
          'Nintendo Switch',
          'Nintendo Switch 2',
          'Sega Dreamcast',
        ]),
      )
      expect(platformNames).toContain('PC')
      expect(platformNames.some((name) => /Steam|GOG/.test(name))).toBe(false)
      await dialog.get('input[name="Name"]').setValue('Console game')
      await dialog.get('form').trigger('submit')
      expect(dialog.get('[role="alert"]').text()).toBe(labels.itemForm.platformRequired)
      expect(request).not.toHaveBeenCalled()
      await dialog.get('select[name="Platform"]').setValue('9')
      await dialog.get('form').trigger('submit')
      expect(request).toHaveBeenCalledWith('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          MediaType: 3,
          Name: 'Console game',
          MediaFormat: null,
          Info: '',
          Platform: 9,
          IsPhysical: false,
        }),
      })
    },
  )

  it.each(['fi', 'en'])(
    'shows Store for every game platform and saves the chosen store in %s',
    async (locale) => {
      const request = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }))
      vi.stubGlobal('fetch', request)
      const dialog = await openForm(locale)
      const labels = locale === 'fi' ? fi : en
      expect(dialog.find('select[name="Store"]').exists()).toBe(false)
      await dialog.get('select[name="MediaType"]').setValue('3')
      await dialog.get('select[name="Platform"]').setValue('9')
      expect(dialog.find('select[name="Store"]').exists()).toBe(true)
      await dialog.get('select[name="Platform"]').setValue('26')
      expect(dialog.findAll('label > span')[3]!.text()).toBe(labels.itemForm.store)
      expect(dialog.findAll('select[name="Store"] option').map((option) => option.text())).toEqual([
        labels.itemForm.chooseStore,
        'Steam',
        'GOG',
        'Epic Games Store',
        'Microsoft Store',
        'EA app',
        'Ubisoft Store',
        'Battle.net',
        'itch.io',
        'Xbox Store',
        'PlayStation Store',
        labels.common.other,
      ])
      await dialog.get('input[name="Name"]').setValue('PC game')
      await dialog.get('form').trigger('submit')
      expect(request).not.toHaveBeenCalled()
      expect(dialog.get('[role="alert"]').text()).toBe(labels.itemForm.storeRequired)
      await dialog.get('select[name="Store"]').setValue('1')
      await dialog.get('form').trigger('submit')
      expect(request).toHaveBeenCalledWith('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          MediaType: 3,
          Name: 'PC game',
          MediaFormat: null,
          Info: '',
          Platform: 26,
          Store: 1,
          IsPhysical: false,
        }),
      })
    },
  )

  it.each(['fi', 'en'])(
    'offers translated Other options and posts their numeric values in %s',
    async (locale) => {
      const request = vi.fn().mockImplementation(async () => new Response('{}', { status: 201 }))
      vi.stubGlobal('fetch', request)
      const dialog = await openForm(locale)
      const other = locale === 'fi' ? 'Muu' : 'Other'
      expect(dialog.get('select[name="MediaFormat"] option[value="99"]').text()).toBe(other)
      await dialog.get('select[name="MediaFormat"]').setValue('99')
      await dialog.get('input[name="Name"]').setValue('Other format')
      await dialog.get('form').trigger('submit')
      expect(request).toHaveBeenLastCalledWith('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ MediaType: 1, Name: 'Other format', MediaFormat: 99, Info: '' }),
      })
      await vi.waitFor(() =>
        expect(wrapper!.get('button').attributes('aria-expanded')).toBe('false'),
      )
      await vi.waitFor(() => expect(wrapper!.get('button').attributes('disabled')).toBeUndefined())
      await wrapper!.get('button').trigger('click')
      await dialog.get('select[name="MediaType"]').setValue('3')
      expect(dialog.get('select[name="Platform"] option[value="99"]').text()).toBe(other)
      await dialog.get('select[name="Platform"]').setValue('99')
      await dialog.get('input[name="Name"]').setValue('Other platform')
      expect(dialog.find('select[name="Store"]').exists()).toBe(true)
      await dialog.get('form').trigger('submit')
      expect(request).toHaveBeenLastCalledWith('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          MediaType: 3,
          Name: 'Other platform',
          MediaFormat: null,
          Info: '',
          Platform: 99,
          IsPhysical: false,
        }),
      })
      await vi.waitFor(() =>
        expect(wrapper!.get('button').attributes('aria-expanded')).toBe('false'),
      )
      await vi.waitFor(() => expect(wrapper!.get('button').attributes('disabled')).toBeUndefined())
      await wrapper!.get('button').trigger('click')
      await dialog.get('select[name="MediaType"]').setValue('3')
      await dialog.get('select[name="Platform"]').setValue('26')
      expect(dialog.get('select[name="Store"] option[value="99"]').text()).toBe(other)
      await dialog.get('select[name="Store"]').setValue('99')
      await dialog.get('input[name="Name"]').setValue('Other store')
      await dialog.get('form').trigger('submit')
      expect(request).toHaveBeenLastCalledWith('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          MediaType: 3,
          Name: 'Other store',
          MediaFormat: null,
          Info: '',
          Platform: 26,
          Store: 99,
          IsPhysical: false,
        }),
      })
    },
  )

  it.each([
    { field: 'MediaFormat', mediaType: 1, mediaFormat: 99, platform: null, store: null },
    { field: 'Platform', mediaType: 3, mediaFormat: null, platform: 99, store: null },
    { field: 'Store', mediaType: 3, mediaFormat: null, platform: 26, store: 99 },
  ])('prefills a saved Other choice in $field when editing', async ({ field, ...fields }) => {
    const dialog = await openForm('fi', {
      id: 70,
      name: 'Muu kohde',
      info: 'Tarkemmat tiedot',
      ...fields,
    })
    expect((dialog.get(`select[name="${field}"]`).element as HTMLSelectElement).value).toBe('99')
    expect(dialog.get(`select[name="${field}"] option[value="99"]`).text()).toBe('Muu')
  })

  it('prefills and updates an existing PC game store', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', request)
    const dialog = await openForm('fi', {
      id: 40,
      name: 'PC-peli',
      mediaType: 3,
      mediaFormat: null,
      platform: 26,
      store: 2,
      info: null,
    })
    expect((dialog.get('select[name="Platform"]').element as HTMLSelectElement).value).toBe('26')
    expect((dialog.get('select[name="Store"]').element as HTMLSelectElement).value).toBe('2')
    await dialog.get('select[name="Store"]').setValue('3')
    await dialog.get('form').trigger('submit')
    expect(request).toHaveBeenCalledWith('/api/collection/40', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        MediaType: 3,
        Name: 'PC-peli',
        MediaFormat: null,
        Info: '',
        Platform: 26,
        Store: 3,
        IsPhysical: false,
      }),
    })
  })

  it.each(['console', 'movie', 'boardGame'])(
    'retains the console store and omits Store for other categories after switching PC to a %s',
    async (target) => {
      const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
      vi.stubGlobal('fetch', request)
      const dialog = await openForm('fi')
      await dialog.get('input[name="Name"]').setValue('Kohde')
      await dialog.get('select[name="MediaType"]').setValue('3')
      await dialog.get('select[name="Platform"]').setValue('26')
      await dialog.get('select[name="Store"]').setValue('1')
      if (target === 'console') {
        await dialog.get('select[name="Platform"]').setValue('9')
      } else {
        await dialog.get('select[name="MediaType"]').setValue(target === 'movie' ? '1' : '4')
        if (target === 'movie') await dialog.get('select[name="MediaFormat"]').setValue('2')
        if (target === 'boardGame') await dialog.get('select[name="MediaFormat"]').setValue('4')
      }
      expect(dialog.find('select[name="Store"]').exists()).toBe(target === 'console')
      await dialog.get('form').trigger('submit')
      const options = request.mock.calls[0]![1] as RequestInit
      const body = JSON.parse(options.body as string)
      if (target === 'console') expect(body.Store).toBe(1)
      else expect(body).not.toHaveProperty('Store')
      expect(body.Platform).toBe(target === 'console' ? 9 : undefined)
    },
  )

  it('prefills and updates a saved game platform without assigning a disc format', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', request)
    const dialog = await openForm('fi', {
      id: 28,
      name: 'Peli',
      mediaType: 3,
      mediaFormat: null,
      platform: 4,
      info: 'Muistiinpanot',
    })
    expect((dialog.get('select[name="Platform"]').element as HTMLSelectElement).value).toBe('4')
    await dialog.get('select[name="Platform"]').setValue('18')
    await dialog.get('form').trigger('submit')
    expect(request).toHaveBeenCalledWith('/api/collection/28', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        MediaType: 3,
        Name: 'Peli',
        MediaFormat: null,
        Info: 'Muistiinpanot',
        Platform: 18,
        IsPhysical: false,
      }),
    })
  })

  it('switches back to disc formats and omits Platform when changing a game to a movie', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', request)
    const dialog = await openForm('fi')
    await dialog.get('input[name="Name"]').setValue('Kohde')
    await dialog.get('select[name="MediaType"]').setValue('3')
    await dialog.get('select[name="Platform"]').setValue('9')
    await dialog.get('select[name="MediaType"]').setValue('1')
    expect(dialog.find('select[name="Platform"]').exists()).toBe(false)
    expect(
      dialog.get('select[name="MediaFormat"]').element.closest('label')?.textContent,
    ).toContain(fi.itemForm.mediaFormat)
    await dialog.get('select[name="MediaFormat"]').setValue('3')
    await dialog.get('form').trigger('submit')
    expect(request).toHaveBeenCalledWith('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ MediaType: 1, Name: 'Kohde', MediaFormat: 3, Info: '' }),
    })
  })

  it('requires a platform for legacy games without reinterpreting an old DVD value as a console', async () => {
    const dialog = await openForm('fi', {
      id: 30,
      name: 'Vanha peli',
      mediaType: 3,
      mediaFormat: 1,
      info: null,
    })
    const platform = dialog.get('select[name="Platform"]').element as HTMLSelectElement
    expect(platform.value).toBe('')
    expect(platform.checkValidity()).toBe(false)
  })

  it.each(['create', 'edit'])(
    'saves the selected tabletop game type without a platform (%s)',
    async (mode) => {
      const request = vi
        .fn()
        .mockResolvedValue(new Response('{}', { status: mode === 'edit' ? 200 : 201 }))
      vi.stubGlobal('fetch', request)
      const item =
        mode === 'edit'
          ? {
              id: 31,
              name: 'Lautapeli',
              mediaType: 4,
              mediaFormat: 1,
              platform: 9,
              info: 'Muistiinpanot',
            }
          : undefined
      const dialog = await openForm('fi', item)
      if (!item) {
        await dialog.get('select[name="MediaType"]').setValue('4')
        await dialog.get('input[name="Name"]').setValue('Lautapeli')
        await dialog.get('textarea[name="Info"]').setValue('Muistiinpanot')
      }
      expect((dialog.get('select[name="MediaFormat"]').element as HTMLSelectElement).value).toBe('')
      expect(dialog.find('select[name="Platform"]').exists()).toBe(false)
      expect(dialog.findAll('label > span').map((label) => label.text())).toEqual([
        ...(!item ? [fi.itemForm.category] : []),
        fi.itemForm.name,
        fi.bgg.classification,
        fi.itemForm.gameType,
        fi.itemForm.info,
      ])
      await dialog.get('select[name="MediaFormat"]').setValue('5')
      await dialog.get('form').trigger('submit')
      expect(request).toHaveBeenCalledWith(item ? '/api/collection/31' : '/api/collection', {
        method: item ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          MediaType: 4,
          Name: 'Lautapeli',
          MediaFormat: 5,
          Info: 'Muistiinpanot',
          BoardGameKind: 1,
          BaseGames: [],
        }),
      })
    },
  )

  it.each(['fi', 'en'])(
    'offers translated tabletop types and requires a choice when adding in %s',
    async (locale) => {
      const request = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }))
      vi.stubGlobal('fetch', request)
      const dialog = await openForm(locale, undefined, 'boardGames')
      const labels = locale === 'fi' ? fi : en
      expect(dialog.find('select[name="MediaType"]').exists()).toBe(false)
      expect(
        dialog
          .findAll('select[name="MediaFormat"] option')
          .map((option) => [option.attributes('value'), option.text()]),
      ).toEqual([
        ['', labels.itemForm.chooseGameType],
        ['4', labels.gameTypes.boardGame],
        ['5', labels.gameTypes.cardGame],
        ['99', labels.gameTypes.otherGame],
      ])
      await dialog.get('input[name="Name"]').setValue('New tabletop game')
      await dialog.get('form').trigger('submit')
      expect(request).not.toHaveBeenCalled()
      expect(dialog.get('[role="alert"]').text()).toBe(labels.itemForm.gameTypeRequired)
      await dialog.get('select[name="MediaFormat"]').setValue('99')
      await dialog.get('form').trigger('submit')
      expect(request).toHaveBeenCalledWith('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          MediaType: 4,
          Name: 'New tabletop game',
          MediaFormat: 99,
          Info: '',
          BoardGameKind: 1,
          BaseGames: [],
        }),
      })
    },
  )

  it.each([
    [4, 'boardGame'],
    [5, 'cardGame'],
    [99, 'otherGame'],
  ] as const)('prefills the saved tabletop type %s when editing', async (mediaFormat, label) => {
    const dialog = await openForm('fi', {
      id: 90,
      name: 'Peli',
      mediaType: 4,
      mediaFormat,
      info: null,
    })
    expect((dialog.get('select[name="MediaFormat"]').element as HTMLSelectElement).value).toBe(
      String(mediaFormat),
    )
    expect(dialog.get(`select[name="MediaFormat"] option[value="${mediaFormat}"]`).text()).toBe(
      fi.gameTypes[label],
    )
    expect(dialog.find('select[name="Platform"]').exists()).toBe(false)
  })

  it('hides a selected console when changing a video game to a board game', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', request)
    const dialog = await openForm('fi')
    await dialog.get('input[name="Name"]').setValue('Kohde')
    await dialog.get('select[name="MediaType"]').setValue('3')
    await dialog.get('select[name="Platform"]').setValue('9')
    await dialog.get('select[name="MediaType"]').setValue('4')
    expect(dialog.find('select[name="Platform"]').exists()).toBe(false)
    expect(dialog.find('select[name="MediaFormat"]').exists()).toBe(true)
    await dialog.get('select[name="MediaFormat"]').setValue('99')
    await dialog.get('form').trigger('submit')
    expect(request).toHaveBeenCalledWith('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        MediaType: 4,
        Name: 'Kohde',
        MediaFormat: 99,
        Info: '',
        BoardGameKind: 1,
        BaseGames: [],
      }),
    })
  })

  it('posts numeric enums once, then closes and confirms a successful save', async () => {
    let finish!: (response: Response) => void
    const request = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    vi.stubGlobal('fetch', request)
    const dialog = await openForm()
    await dialog.get('input[name="Name"]').setValue('  Elokuva  ')
    await dialog.get('select[name="MediaType"]').setValue('2')
    await dialog.get('select[name="MediaFormat"]').setValue('3')
    await dialog.get('textarea[name="Info"]').setValue('Lisätiedot')
    await dialog.get('form').trigger('submit')
    await dialog.get('form').trigger('submit')
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        MediaType: 2,
        Name: 'Elokuva',
        MediaFormat: 3,
        Info: 'Lisätiedot',
        IsCompleteBox: false,
        OwnedSeasons: [],
      }),
    })
    expect(dialog.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    finish(new Response('{}', { status: 201 }))
    await vi.waitFor(() =>
      expect(useSnackbar().notice.value).toMatchObject({
        messageKey: 'collection.notifications.saved.tvSeries',
        type: 'success',
        params: { name: 'Elokuva' },
      }),
    )
    expect(wrapper!.get('button').attributes('aria-expanded')).toBe('false')
    expect(wrapper!.emitted('saved')).toHaveLength(1)
  })

  it.each([400, 503, 'network'])(
    'keeps input and allows retry after a %s failure',
    async (failure) => {
      const request = vi.fn()
      if (failure === 'network') request.mockRejectedValueOnce(new TypeError('Offline'))
      else request.mockResolvedValueOnce(new Response('{}', { status: failure as number }))
      request.mockResolvedValueOnce(new Response('{}', { status: 201 }))
      vi.stubGlobal('fetch', request)
      const dialog = await openForm()
      await dialog.get('input[name="Name"]').setValue('Säilytä nimi')
      await dialog.get('form').trigger('submit')
      await vi.waitFor(() =>
        expect(dialog.get('[role="alert"]').text()).toBe(
          failure === 400 ? fi.itemForm.validationError : fi.itemForm.saveError,
        ),
      )
      expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe(
        'Säilytä nimi',
      )
      expect(dialog.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
      expect(wrapper!.emitted('saved')).toBeUndefined()
      expect(useSnackbar().notice.value).toMatchObject({
        type: 'error',
        messageKey: failure === 400 ? 'itemForm.validationError' : 'itemForm.saveError',
      })
      await dialog.get('form').trigger('submit')
      await vi.waitFor(() =>
        expect(useSnackbar().notice.value).toMatchObject({
          messageKey: 'collection.notifications.saved.movies',
          type: 'success',
        }),
      )
      expect(request).toHaveBeenCalledTimes(2)
    },
  )

  it('preserves edits when the item has been removed from the database', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }))
    vi.stubGlobal('fetch', request)
    const dialog = await openForm('fi', {
      id: 17,
      name: 'Alkuperäinen',
      mediaType: 2,
      mediaFormat: 3,
      info: 'Tietoja',
    })
    await dialog.get('input[name="Name"]').setValue('Muokattu')
    await dialog.get('form').trigger('submit')
    await vi.waitFor(() => expect(dialog.get('[role="alert"]').text()).toBe(fi.itemForm.notFound))
    expect(request).toHaveBeenCalledWith(
      '/api/collection/17',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe('Muokattu')
    expect(wrapper!.emitted('saved')).toBeUndefined()
    expect(wrapper!.get('button').attributes('aria-expanded')).toBe('true')
  })

  it('does not silently replace a missing media format with DVD while editing', async () => {
    const dialog = await openForm('fi', {
      id: 18,
      name: 'Elokuva',
      mediaType: 1,
      mediaFormat: null,
      info: null,
    })
    const format = dialog.get('select[name="MediaFormat"]').element as HTMLSelectElement
    expect(format.value).toBe('')
    expect(format.required).toBe(true)
    expect(format.checkValidity()).toBe(false)
    await dialog.get('select[name="MediaFormat"]').setValue('2')
    expect(format.checkValidity()).toBe(true)
  })

  it('rejects whitespace-only names before sending a request', async () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    const dialog = await openForm()
    await dialog.get('input[name="Name"]').setValue('   ')
    await dialog.get('form').trigger('submit')
    expect(dialog.get('[role="alert"]').text()).toBe(fi.itemForm.nameRequired)
    expect(request).not.toHaveBeenCalled()
  })
})

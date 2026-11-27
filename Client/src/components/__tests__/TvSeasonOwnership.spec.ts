import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import CollectionItemDialog from '../CollectionItemDialog.vue'
import TmdbImportDialog from '../TmdbImportDialog.vue'
import CollectionTable from '../CollectionTable.vue'
import fi from '../../lang/fi.json'
import en from '../../lang/en.json'
import { useSnackbar } from '../../composables/useSnackbar'

let wrapper: VueWrapper | undefined
const seasons = [1, 2, 3].map((seasonNumber) => ({
  seasonNumber,
  name: `Season ${seasonNumber}`,
  episodeCount: 8,
}))
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const plugins = (locale = 'fi') => [createI18n({ legacy: false, locale, messages: { en, fi } })]

async function openEditor(editing = false, completeBox = false) {
  vi.stubGlobal('scrollTo', vi.fn())
  wrapper = mount(CollectionItemDialog, {
    attachTo: document.body,
    props: {
      category: 'tvSeries',
      ...(editing
        ? {
            item: {
              id: 50,
              name: 'Series',
              mediaType: 2,
              mediaFormat: 2,
              info: null,
              isCompleteBox: completeBox,
              ownedSeasons: [
                { seasonNumber: 1, mediaFormat: 1 },
                { seasonNumber: 3, mediaFormat: 3 },
              ],
            },
          }
        : {}),
    },
    global: { plugins: plugins(), stubs: { transition: false } },
  })
  await wrapper.get('button').trigger('click')
  await flushPromises()
  return new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
}

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  useSnackbar().dismiss()
  vi.unstubAllGlobals()
})

describe('TV season ownership', () => {
  it('adds individually owned seasons in different formats', async () => {
    const request = vi.fn().mockResolvedValue(json({}, 201))
    vi.stubGlobal('fetch', request)
    const dialog = await openEditor()
    await dialog.get('input[name="Name"]').setValue('Series')
    await dialog.get('input[name="SeasonCount"]').setValue(3)
    await dialog.get('input[name="OwnedSeason1"]').setValue(true)
    await dialog.get('input[name="OwnedSeason3"]').setValue(true)
    await dialog.get('select[name="SeasonFormat3"]').setValue('3')
    await dialog.get('form').trigger('submit')
    const body = JSON.parse(request.mock.calls[0]![1].body)
    expect(body.IsCompleteBox).toBe(false)
    expect(body.OwnedSeasons).toEqual([
      { seasonNumber: 1, mediaFormat: 1 },
      { seasonNumber: 3, mediaFormat: 3 },
    ])
    await vi.waitFor(() => expect(wrapper!.emitted('saved')).toHaveLength(1))
  })

  it('locks individual season selections for a complete box and unlocks them when unchecked', async () => {
    const dialog = await openEditor()
    await dialog.get('input[name="SeasonCount"]').setValue(3)
    await dialog.get('input[name="OwnedSeason2"]').setValue(true)
    await dialog.get('select[name="SeasonFormat2"]').setValue('3')
    await dialog.get('input[name="IsCompleteBox"]').setValue(true)
    expect(
      dialog
        .findAll('.tv-season-row input')
        .every((input) => (input.element as HTMLInputElement).checked),
    ).toBe(true)
    expect(
      dialog
        .findAll('.tv-season-row input')
        .every((input) => (input.element as HTMLInputElement).disabled),
    ).toBe(true)
    expect(
      dialog
        .findAll('.tv-season-row select')
        .every(
          (select) =>
            (select.element as HTMLSelectElement).disabled &&
            (select.element as HTMLSelectElement).value === '1',
        ),
    ).toBe(true)
    await dialog.get('select[name="MediaFormat"]').setValue('2')
    expect(
      dialog
        .findAll('.tv-season-row select')
        .every(
          (select) =>
            (select.element as HTMLSelectElement).disabled &&
            (select.element as HTMLSelectElement).value === '2',
        ),
    ).toBe(true)
    await dialog.get('input[name="SeasonCount"]').setValue(4)
    expect((dialog.get('select[name="SeasonFormat4"]').element as HTMLSelectElement).value).toBe(
      '2',
    )
    await dialog.get('input[name="IsCompleteBox"]').setValue(false)
    expect(
      dialog
        .findAll('.tv-season-row select')
        .every((select) => !(select.element as HTMLSelectElement).disabled),
    ).toBe(true)
    await dialog.get('select[name="SeasonFormat2"]').setValue('3')
    await dialog.get('select[name="MediaFormat"]').setValue('1')
    expect(
      dialog
        .findAll('.tv-season-row input')
        .every((input) => !(input.element as HTMLInputElement).disabled),
    ).toBe(true)
    await dialog.get('input[name="OwnedSeason3"]').setValue(false)
    expect((dialog.get('input[name="IsCompleteBox"]').element as HTMLInputElement).checked).toBe(
      false,
    )
    expect((dialog.get('select[name="SeasonFormat2"]').element as HTMLSelectElement).value).toBe(
      '3',
    )
    expect((dialog.get('input[name="OwnedSeason3"]').element as HTMLInputElement).checked).toBe(
      false,
    )
    await dialog.get('input[name="OwnedSeason3"]').setValue(true)
    expect((dialog.get('input[name="OwnedSeason3"]').element as HTMLInputElement).checked).toBe(
      true,
    )
  })

  it('prefills saved season selections and formats when editing', async () => {
    const request = vi.fn().mockResolvedValue(json({}))
    vi.stubGlobal('fetch', request)
    const dialog = await openEditor(true)
    expect((dialog.get('input[name="OwnedSeason1"]').element as HTMLInputElement).checked).toBe(
      true,
    )
    expect((dialog.get('input[name="OwnedSeason2"]').element as HTMLInputElement).checked).toBe(
      false,
    )
    expect((dialog.get('select[name="SeasonFormat1"]').element as HTMLSelectElement).value).toBe(
      '1',
    )
    expect((dialog.get('select[name="SeasonFormat3"]').element as HTMLSelectElement).value).toBe(
      '3',
    )
    await dialog.get('select[name="SeasonFormat1"]').setValue('2')
    await dialog.get('form').trigger('submit')
    expect(JSON.parse(request.mock.calls[0]![1].body).OwnedSeasons).toEqual([
      { seasonNumber: 1, mediaFormat: 2 },
      { seasonNumber: 3, mediaFormat: 3 },
    ])
    await vi.waitFor(() => expect(wrapper!.emitted('saved')).toHaveLength(1))
  })

  it('normalizes a saved complete box to its main format when opening the editor', async () => {
    const request = vi.fn().mockResolvedValue(json({}))
    vi.stubGlobal('fetch', request)
    const dialog = await openEditor(true, true)
    expect(
      dialog
        .findAll('.tv-season-row select')
        .every(
          (select) =>
            (select.element as HTMLSelectElement).disabled &&
            (select.element as HTMLSelectElement).value === '2',
        ),
    ).toBe(true)
    await dialog.get('form').trigger('submit')
    expect(JSON.parse(request.mock.calls[0]![1].body).OwnedSeasons).toEqual([
      { seasonNumber: 1, mediaFormat: 2 },
      { seasonNumber: 2, mediaFormat: 2 },
      { seasonNumber: 3, mediaFormat: 2 },
    ])
    await vi.waitFor(() => expect(wrapper!.emitted('saved')).toHaveLength(1))
  })

  it('loads TMDB season counts and imports a complete box with the shared main format', async () => {
    const series = {
      tmdbId: 100,
      mediaType: 2,
      language: 'fi-FI',
      title: 'Series',
      originalTitle: 'Series',
      overview: 'Overview',
      releaseDate: '2020-01-01',
      posterPath: null,
    }
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({ page: 1, totalPages: 1, results: [series] }))
      .mockResolvedValueOnce(json({ ...series, numberOfSeasons: 3, numberOfEpisodes: 24, seasons }))
      .mockResolvedValueOnce(json({}, 201))
    vi.stubGlobal('fetch', request)
    vi.stubGlobal('scrollTo', vi.fn())
    wrapper = mount(TmdbImportDialog, {
      props: { category: 'tvSeries' },
      attachTo: document.body,
      global: { plugins: plugins(), stubs: { transition: false } },
    })
    await wrapper.get('.tmdb-add-button').trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
    await dialog.get('input[name="TmdbQuery"]').setValue('Series')
    await dialog.get('.tmdb-search-form').trigger('submit')
    await flushPromises()
    await dialog.get('.tmdb-result').trigger('click')
    await flushPromises()
    expect(request.mock.calls[1]![0]).toContain('/api/tmdb/details?')
    expect(dialog.get('.tv-season-totals').text()).toContain('24')
    expect(dialog.find('input[name="SeasonCount"]').exists()).toBe(false)
    await dialog.get('input[name="IsCompleteBox"]').setValue(true)
    expect(
      dialog
        .findAll('.tv-season-row input')
        .every((input) => (input.element as HTMLInputElement).disabled),
    ).toBe(true)
    await dialog.get('select[name="MediaFormat"]').setValue('3')
    expect(
      dialog
        .findAll('.tv-season-row select')
        .every(
          (select) =>
            (select.element as HTMLSelectElement).disabled &&
            (select.element as HTMLSelectElement).value === '3',
        ),
    ).toBe(true)
    await dialog.get('.tmdb-import-form').trigger('submit')
    const body = JSON.parse(request.mock.calls[2]![1].body)
    expect(body.item.isCompleteBox).toBe(true)
    expect(body.item.ownedSeasons).toEqual([
      { seasonNumber: 1, mediaFormat: 3 },
      { seasonNumber: 2, mediaFormat: 3 },
      { seasonNumber: 3, mediaFormat: 3 },
    ])
    await vi.waitFor(() => expect(wrapper!.emitted('saved')).toHaveLength(1))
  })

  it('displays complete series and individual seasons from different formats together', async () => {
    wrapper = mount(CollectionTable, {
      props: {
        category: 'tvSeries',
        items: [
          {
            id: 1,
            name: 'Series',
            mediaType: 2,
            mediaFormat: 1,
            info: null,
            isCompleteBox: true,
            ownedSeasons: [
              { seasonNumber: 1, mediaFormat: 1 },
              { seasonNumber: 2, mediaFormat: 2 },
              { seasonNumber: 3, mediaFormat: 1 },
            ],
          },
        ],
        loading: false,
        error: false,
      },
      global: { plugins: plugins() },
    })
    expect(wrapper.findAll('.media-format-badge').map((tag) => tag.text())).toEqual([
      fi.tvOwnership.completeBoxShort,
      'DVD',
      'Blu-ray',
    ])
    expect(wrapper.find('th.collection-format').exists()).toBe(false)
    expect(wrapper.find('.media-individual-seasons-badge').exists()).toBe(false)
    await wrapper.setProps({
      items: [
        {
          id: 1,
          name: 'Series',
          mediaType: 2,
          mediaFormat: 2,
          isCompleteBox: true,
          info: null,
          versions: [
            { id: 0, mediaFormat: 2, isCompleteBox: true, info: null },
            {
              id: 20,
              mediaFormat: 1,
              isCompleteBox: false,
              ownedSeasons: [{ seasonNumber: 1, mediaFormat: 1 }],
              info: null,
            },
          ],
        },
      ],
    })
    expect(wrapper.findAll('.media-format-badge').map((tag) => tag.text())).toEqual([
      fi.tvOwnership.completeBoxShort,
      fi.tvOwnership.individualSeasons,
      'Blu-ray',
      'DVD',
    ])
    await wrapper.setProps({
      items: [{ id: 1, name: 'Series', mediaType: 2, mediaFormat: 1, info: null }],
    })
    expect(wrapper.find('.media-individual-seasons-badge').exists()).toBe(false)
  })
})

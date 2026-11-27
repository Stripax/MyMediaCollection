import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import CollectionTable from '../CollectionTable.vue'
import type { CollectionCategory, CollectionItem } from '../../models/collection'
import fi from '../../lang/fi.json'
import en from '../../lang/en.json'

const items: CollectionItem[] = [
  { id: 1, name: 'Matrix', mediaType: 1, mediaFormat: 2, info: null },
  { id: 2, name: 'Movie box', mediaType: 1, mediaFormat: 1, isCollection: true, info: null },
  { id: 3, name: 'Other movie', mediaType: 1, mediaFormat: 99, info: null },
  {
    id: 4,
    name: 'Mixed series',
    mediaType: 2,
    mediaFormat: 1,
    ownedSeasons: [
      { seasonNumber: 1, mediaFormat: 2 },
      { seasonNumber: 2, mediaFormat: 3 },
    ],
    info: null,
  },
  { id: 5, name: 'DVD series', mediaType: 2, mediaFormat: 1, info: null },
  {
    id: 6,
    name: 'Mass Effect PC',
    mediaType: 3,
    mediaFormat: null,
    platform: 26,
    store: 1,
    isPhysical: false,
    info: null,
  },
  {
    id: 7,
    name: 'Mass Effect Xbox digital',
    mediaType: 3,
    mediaFormat: null,
    platform: 4,
    store: 9,
    isPhysical: false,
    info: null,
  },
  {
    id: 8,
    name: 'Mass Effect PlayStation',
    mediaType: 3,
    mediaFormat: null,
    platform: 9,
    store: 10,
    isPhysical: false,
    info: null,
  },
  {
    id: 9,
    name: 'Mass Effect Xbox disc',
    mediaType: 3,
    mediaFormat: null,
    platform: 4,
    store: 9,
    isPhysical: true,
    info: null,
  },
  { id: 10, name: 'Legacy game', mediaType: 3, mediaFormat: null, platform: null, info: null },
  { id: 11, name: 'Base board game', mediaType: 4, mediaFormat: 4, boardGameKind: 1, info: null },
  { id: 12, name: 'Expansion', mediaType: 4, mediaFormat: 4, boardGameKind: 2, info: null },
  { id: 13, name: 'Card game', mediaType: 4, mediaFormat: 5, boardGameKind: 99, info: null },
  {
    id: 14,
    name: 'Unknown tabletop game',
    mediaType: 4,
    mediaFormat: null,
    bggId: 900,
    info: null,
  },
  {
    id: 15,
    name: 'TV complete box',
    mediaType: 2,
    mediaFormat: 2,
    isCompleteBox: true,
    info: null,
  },
]
let wrapper: VueWrapper | undefined
async function setup(category: CollectionCategory = 'all', locale = 'fi', expand = true) {
  wrapper = mount(CollectionTable, {
    props: { items, category, loading: false, error: false },
    attachTo: document.body,
    global: {
      plugins: [createI18n({ legacy: false, locale, messages: { fi, en } })],
      stubs: { 'transition-group': false },
    },
  })
  if (expand) await wrapper.get('.collection-filters-toggle').trigger('click')
  return wrapper
}
function ids() {
  return wrapper!
    .findAll('tbody tr[data-item-id]:not([aria-hidden="true"])')
    .map((row) => Number(row.attributes('data-item-id')))
}
afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})

describe('Collection table filters', () => {
  it('shows every platform badge and combines filters against the same owned version', async () => {
    const table = await setup('videoGames')
    await table.setProps({
      items: [
        {
          id: 30,
          name: 'Destiny 2',
          mediaType: 3,
          mediaFormat: null,
          platform: 4,
          isPhysical: true,
          info: null,
          versions: [
            { id: 0, mediaFormat: null, platform: 4, isPhysical: true, info: null },
            { id: 41, mediaFormat: null, platform: 9, store: 10, isPhysical: false, info: null },
          ],
        },
      ],
    })
    expect(
      table
        .get('tr[data-item-id="30"]')
        .findAll('.game-platform-badge')
        .map((badge) => badge.text()),
    ).toEqual(['Xbox Series S/X', 'PlayStation 5 · PlayStation Store'])
    await table.get('select[name="FilterPlatform"]').setValue('9')
    await table.get('select[name="FilterCopyType"]').setValue('digital')
    expect(ids()).toEqual([30])
    await table.get('select[name="FilterCopyType"]').setValue('physical')
    expect(ids()).toEqual([])
  })

  it('shows and filters all movie formats on one row', async () => {
    const table = await setup('movies')
    await table.setProps({
      items: [
        {
          id: 31,
          name: 'Movie',
          mediaType: 1,
          mediaFormat: 2,
          info: null,
          versions: [
            { id: 0, mediaFormat: 2, info: null },
            { id: 42, mediaFormat: 3, info: null },
          ],
        },
      ],
    })
    expect(
      table
        .get('tr[data-item-id="31"]')
        .findAll('.media-format-badge')
        .map((badge) => badge.text()),
    ).toEqual(['Blu-ray', '4K UHD Blu-ray'])
    await table.get('select[name="FilterFormat"]').setValue('3')
    expect(ids()).toEqual([31])
    await table.get('select[name="FilterFormat"]').setValue('1')
    expect(ids()).toEqual([])
  })

  it('starts collapsed and keeps active filters when hidden and reopened', async () => {
    const table = await setup('movies', 'fi', false)
    const toggle = table.get('.collection-filters-toggle')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(table.find('.collection-filters-panel').exists()).toBe(false)
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(table.get('.collection-filters-panel').attributes('id')).toBe(
      toggle.attributes('aria-controls'),
    )
    await table.get('select[name="FilterFormat"]').setValue('2')
    expect(ids()).toEqual([1])
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(ids()).toEqual([1])
    await toggle.trigger('click')
    expect((table.get('select[name="FilterFormat"]').element as HTMLSelectElement).value).toBe('2')
    expect(ids()).toEqual([1])
  })

  it('combines platform, store, copy type and name search and preserves them on data refresh', async () => {
    const table = await setup('videoGames')
    await table.get('select[name="FilterPlatform"]').setValue('4')
    expect(ids()).toEqual([7, 9])
    await table.get('select[name="FilterStore"]').setValue('9')
    await table.get('select[name="FilterCopyType"]').setValue('digital')
    await table.get('input[type="search"]').setValue('MASS EFFECT')
    expect(ids()).toEqual([7])
    await table.setProps({
      items: [...items, { ...items[6]!, id: 16, name: 'Mass Effect 2 Xbox' }],
    })
    expect(ids()).toEqual([7, 16])
    await table.get('input[type="search"]').setValue('Missing')
    expect(ids()).toEqual([])
    expect(table.get('.collection-empty').text()).toBe(fi.collection.noMatches)
    await table.get('input[type="search"]').setValue('Mass Effect')
    await table.get('.collection-filters-clear').trigger('click')
    expect(ids()).toEqual([6, 7, 8, 9, 16])
    expect((table.get('input[type="search"]').element as HTMLInputElement).value).toBe(
      'Mass Effect',
    )
  })

  it('clears incompatible filters when changing the all-view category or sidebar category', async () => {
    const table = await setup()
    expect(ids()).toHaveLength(items.length)
    await table.get('select[name="FilterCategory"]').setValue('3')
    await table.get('select[name="FilterPlatform"]').setValue('4')
    expect(ids()).toEqual([7, 9])
    await table.get('select[name="FilterCategory"]').setValue('1')
    expect(table.find('select[name="FilterPlatform"]').exists()).toBe(false)
    expect(ids()).toEqual([1, 2, 3])
    await table.get('select[name="FilterFormat"]').setValue('2')
    expect(ids()).toEqual([1])
    await table.setProps({ category: 'tvSeries' })
    expect(table.find('select[name="FilterCategory"]').exists()).toBe(false)
    await vi.waitFor(() => expect(ids()).toEqual([4, 5, 15]))
    expect((table.get('select[name="FilterFormat"]').element as HTMLSelectElement).value).toBe('')
  })

  it.each(['fi', 'en'])(
    'filters individual TV seasons and complete series per format in %s',
    async (locale) => {
      const table = await setup('tvSeries', locale)
      const labels = locale === 'fi' ? fi : en
      expect(table.get('select[name="FilterCollectionType"] option[value="single"]').text()).toBe(
        labels.tvOwnership.individualSeasons,
      )
      await table.get('select[name="FilterFormat"]').setValue('2')
      expect(ids()).toEqual([4, 15])
      await table.get('select[name="FilterFormat"]').setValue('3')
      expect(ids()).toEqual([4])
      await table.get('select[name="FilterFormat"]').setValue('1')
      expect(ids()).toEqual([5])
      await table.get('select[name="FilterFormat"]').setValue('2')
      await table.get('select[name="FilterCollectionType"]').setValue('completeBox')
      expect(ids()).toEqual([15])
      expect(
        table.get('select[name="FilterCollectionType"] option[value="completeBox"]').text(),
      ).toBe(labels.tvOwnership.completeBoxShort)
      expect(
        table.find('select[name="FilterCollectionType"] option[value="collection"]').exists(),
      ).toBe(false)
      await table.get('select[name="FilterCollectionType"]').setValue('single')
      expect(ids()).toEqual([4])
      await table.get('select[name="FilterFormat"]').setValue('1')
      expect(ids()).toEqual([])
      await table.get('select[name="FilterFormat"]').setValue('2')
      await table.setProps({
        items: [
          {
            id: 16,
            name: 'Mixed ownership',
            mediaType: 2,
            mediaFormat: 3,
            info: null,
            versions: [
              {
                id: 0,
                mediaFormat: 3,
                isCompleteBox: false,
                ownedSeasons: [{ seasonNumber: 1, mediaFormat: 3 }],
                info: null,
              },
              { id: 20, mediaFormat: 2, isCompleteBox: true, info: null },
            ],
          },
        ],
      })
      await table.get('select[name="FilterCollectionType"]').setValue('completeBox')
      expect(ids()).toEqual([16])
      await table.get('select[name="FilterFormat"]').setValue('3')
      expect(ids()).toEqual([])
      await table.get('select[name="FilterCollectionType"]').setValue('single')
      expect(ids()).toEqual([16])
    },
  )

  it('combines board/card game type and base game/expansion classification, including unknown values', async () => {
    const table = await setup('boardGames')
    await table.get('select[name="FilterGameType"]').setValue('4')
    await table.get('select[name="FilterBoardKind"]').setValue('2')
    expect(ids()).toEqual([12])
    await table.get('select[name="FilterGameType"]').setValue('5')
    expect(ids()).toEqual([])
    await table.get('select[name="FilterBoardKind"]').setValue('99')
    expect(ids()).toEqual([13])
    await table.get('select[name="FilterGameType"]').setValue('unknown')
    await table.get('select[name="FilterBoardKind"]').setValue('unknown')
    expect(ids()).toEqual([14])
  })

  it('finds legacy unknown game details and treats physical games as having no digital store', async () => {
    const table = await setup('videoGames')
    await table.get('select[name="FilterPlatform"]').setValue('unknown')
    await table.get('select[name="FilterCopyType"]').setValue('unknown')
    await table.get('select[name="FilterStore"]').setValue('none')
    expect(ids()).toEqual([10])
    await table.get('.collection-filters-clear').trigger('click')
    await table.get('select[name="FilterCopyType"]').setValue('physical')
    await table.get('select[name="FilterStore"]').setValue('none')
    expect(ids()).toEqual([9])
  })

  it('translates filters and resets all-view filters without changing the search', async () => {
    const table = await setup('all', 'en')
    expect(table.get('.collection-filters-heading').text()).toBe(en.collection.filters.title)
    expect((table.get('.collection-filters-clear').element as HTMLButtonElement).disabled).toBe(
      true,
    )
    await table.get('select[name="FilterCategory"]').setValue('1')
    await table.get('select[name="FilterFormat"]').setValue('99')
    expect(ids()).toEqual([3])
    expect(table.get('select[name="FilterFormat"] option[value="99"]').text()).toBe(en.common.other)
    await table.get('input[type="search"]').setValue('Other')
    await table.get('.collection-filters-clear').trigger('click')
    expect((table.get('select[name="FilterCategory"]').element as HTMLSelectElement).value).toBe('')
    expect(table.find('select[name="FilterFormat"]').exists()).toBe(false)
    expect(ids()).toEqual([3])
  })
})

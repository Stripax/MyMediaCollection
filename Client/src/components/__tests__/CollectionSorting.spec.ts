import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import CollectionTable from '../CollectionTable.vue'
import type { CollectionCategory, CollectionItem } from '../../models/collection'
import fi from '../../lang/fi.json'
import en from '../../lang/en.json'

let wrapper: VueWrapper | undefined
function setup(items: CollectionItem[], category: CollectionCategory = 'all') {
  const i18n = createI18n({ legacy: false, locale: 'fi', messages: { fi, en } })
  wrapper = mount(CollectionTable, {
    props: { items, category, loading: false, error: false },
    attachTo: document.body,
    global: { plugins: [i18n], stubs: { 'transition-group': false } },
  })
  return { table: wrapper, i18n }
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

describe('Collection name sorting', () => {
  it('cycles category order, translates its tooltip and switches sorting between columns', async () => {
    const items: CollectionItem[] = [
      { id: 1, name: 'Zulu', mediaType: 3, mediaFormat: null, info: null },
      { id: 2, name: 'Alpha', mediaType: 1, mediaFormat: 2, info: null },
      { id: 3, name: 'Gamma', mediaType: 4, mediaFormat: 4, info: null },
      { id: 4, name: 'Beta', mediaType: 2, mediaFormat: 1, info: null },
      { id: 5, name: 'Delta', mediaType: 4, mediaFormat: 5, info: null },
    ]
    const { table, i18n } = setup(items)
    const category = table.get('.collection-category-sort-button')
    const tooltip = table.get('th.collection-category .collection-sort-tooltip')
    await tooltip.trigger('mouseenter')
    expect(tooltip.get('[role="tooltip"]').text()).toBe(fi.collection.sortCategoryAscending)
    await category.trigger('click')
    expect(ids()).toEqual([2, 3, 5, 4, 1])
    expect(table.get('th.collection-category').attributes('aria-sort')).toBe('ascending')
    await tooltip.trigger('mouseleave')
    await tooltip.trigger('mouseenter')
    expect(tooltip.get('[role="tooltip"]').text()).toBe(fi.collection.sortCategoryDescending)
    i18n.global.locale.value = 'en'
    await table.vm.$nextTick()
    expect(ids()).toEqual([3, 5, 2, 4, 1])
    expect(tooltip.get('[role="tooltip"]').text()).toBe(en.collection.sortCategoryDescending)
    await category.trigger('click')
    expect(ids()).toEqual([1, 4, 2, 3, 5])
    expect(category.attributes('aria-label')).toBe(en.collection.sortCategoryDefault)
    await category.trigger('click')
    expect(ids()).toEqual([1, 2, 3, 4, 5])
    expect(table.get('th.collection-category').attributes('aria-sort')).toBe('none')
    await category.trigger('click')
    await table.get('.collection-sort-button').trigger('click')
    expect(ids()).toEqual([2, 4, 5, 3, 1])
    expect(table.get('th.collection-category').attributes('aria-sort')).toBe('none')
    await category.trigger('click')
    expect(ids()).toEqual([3, 5, 2, 4, 1])
    expect(table.get('th').attributes('aria-sort')).toBe('none')
    await table.setProps({ category: 'movies' })
    await vi.waitFor(() => expect(ids()).toEqual([2]))
    await table.setProps({ category: 'all' })
    await vi.waitFor(() => expect(ids()).toEqual([1, 2, 3, 4, 5]))
    expect(items.map((item) => item.id)).toEqual([1, 2, 3, 4, 5])
  })

  it.each<CollectionCategory>(['all', 'movies', 'tvSeries', 'videoGames', 'boardGames'])(
    'toggles Finnish alphabetical order in %s without mutating the source items',
    async (category) => {
      const mediaType =
        category === 'tvSeries'
          ? 2
          : category === 'videoGames'
            ? 3
            : category === 'boardGames'
              ? 4
              : 1
      const items = ['Öljy', 'Zeta', 'Ääni', 'Beta', 'Alpha'].map(
        (name, index): CollectionItem => ({
          id: index + 1,
          name,
          mediaType,
          mediaFormat: mediaType === 4 ? 4 : mediaType === 3 ? null : 2,
          info: null,
        }),
      )
      const { table } = setup(items, category)
      expect(ids()).toEqual([1, 2, 3, 4, 5])
      expect(table.get('th').attributes('aria-sort')).toBe('none')
      await table.get('.collection-sort-button').trigger('click')
      expect(ids()).toEqual([5, 4, 2, 3, 1])
      expect(table.get('th').attributes('aria-sort')).toBe('ascending')
      expect(table.get('.collection-sort-button').attributes('aria-label')).toBe(
        fi.collection.sortNameDescending,
      )
      await table.get('.collection-sort-button').trigger('click')
      expect(ids()).toEqual([1, 3, 2, 4, 5])
      expect(table.get('th').attributes('aria-sort')).toBe('descending')
      expect(table.get('.collection-sort-button').attributes('aria-label')).toBe(
        fi.collection.sortNameDefault,
      )
      await table.get('.collection-sort-button').trigger('click')
      expect(ids()).toEqual([1, 2, 3, 4, 5])
      expect(table.get('th').attributes('aria-sort')).toBe('none')
      await table.get('.collection-sort-button').trigger('click')
      expect(ids()).toEqual([5, 4, 2, 3, 1])
      expect(items.map((item) => item.id)).toEqual([1, 2, 3, 4, 5])
    },
  )

  it('sorts filtered search results naturally and reorders updated items while retaining filters', async () => {
    const items: CollectionItem[] = [
      { id: 1, name: 'Game 10', mediaType: 3, mediaFormat: null, platform: 4, info: null },
      { id: 2, name: 'Game 2', mediaType: 3, mediaFormat: null, platform: 4, info: null },
      { id: 3, name: 'Game 1 PC', mediaType: 3, mediaFormat: null, platform: 26, info: null },
    ]
    const { table } = setup(items, 'videoGames')
    await table.get('.collection-filters-toggle').trigger('click')
    await table.get('select[name="FilterPlatform"]').setValue('4')
    await table.get('input[type="search"]').setValue('game')
    await table.get('.collection-sort-button').trigger('click')
    expect(ids()).toEqual([2, 1])
    await table.setProps({ items: [{ ...items[0]!, name: 'Game 0' }, items[1]!, items[2]!] })
    expect(ids()).toEqual([1, 2])
    expect((table.get('select[name="FilterPlatform"]').element as HTMLSelectElement).value).toBe(
      '4',
    )
    await table.get('.collection-sort-button').trigger('click')
    expect(ids()).toEqual([2, 1])
    await table.get('.collection-sort-button').trigger('click')
    expect(ids()).toEqual([1, 2])
    expect((table.get('input[type="search"]').element as HTMLInputElement).value).toBe('game')
    expect((table.get('select[name="FilterPlatform"]').element as HTMLSelectElement).value).toBe(
      '4',
    )
  })

  it('sorts the displayed localized TMDB names and recomputes on a language change', async () => {
    const { table, i18n } = setup([
      {
        id: 1,
        name: 'Original',
        mediaType: 1,
        mediaFormat: 2,
        info: null,
        tmdbId: 701,
        isNameCustom: false,
        localizedTitles: { fi: 'Ääni', en: 'Apple' },
      },
      { id: 2, name: 'Beta', mediaType: 1, mediaFormat: 2, info: null },
      {
        id: 3,
        name: 'Zoo',
        mediaType: 1,
        mediaFormat: 2,
        info: null,
        tmdbId: 702,
        isNameCustom: true,
        localizedTitles: { fi: 'A', en: 'A' },
      },
    ])
    await table.get('.collection-sort-button').trigger('click')
    expect(ids()).toEqual([2, 3, 1])
    i18n.global.locale.value = 'en'
    await table.vm.$nextTick()
    expect(ids()).toEqual([1, 2, 3])
    expect(table.get('.collection-sort-button').attributes('aria-label')).toBe(
      en.collection.sortNameDescending,
    )
  })
})

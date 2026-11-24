import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import CollectionTable from '../CollectionTable.vue'
import CollectionItemDialog from '../CollectionItemDialog.vue'
import { itemSourceUrl } from '../../models/itemSources'
import type { CollectionItem } from '../../models/collection'
import fi from '../../lang/fi.json'
import en from '../../lang/en.json'

const sources: [CollectionItem, string][] = [
  [
    {
      id: 1,
      name: 'Movie',
      mediaType: 1,
      mediaFormat: 2,
      info: null,
      tmdbId: 603,
      posterPath: '/poster.jpg',
    },
    'https://www.themoviedb.org/movie/603',
  ],
  [
    {
      id: 2,
      name: 'Series',
      mediaType: 2,
      mediaFormat: 2,
      info: null,
      tmdbId: 1399,
      posterPath: '/poster.jpg',
    },
    'https://www.themoviedb.org/tv/1399',
  ],
  [
    {
      id: 3,
      name: 'Mass Effect Legendary Edition',
      mediaType: 3,
      mediaFormat: null,
      platform: 9,
      info: null,
      igdbId: 123,
      coverImageId: 'cover',
      sourceMetadata: {
        source: 'IGDB',
        sourceUrl: 'https://www.igdb.com/games/mass-effect-legendary-edition',
        title: 'Mass Effect Legendary Edition',
        originalTitle: null,
        overview: '',
        releaseDate: null,
        language: null,
        platforms: [],
        fetchedAt: null,
      },
    },
    'https://www.igdb.com/games/mass-effect-legendary-edition',
  ],
]
let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})
const plugins = () => [createI18n({ legacy: false, locale: 'fi', messages: { fi, en } })]

describe('Source cover links', () => {
  it('links table covers to the exact service pages and keeps name editing separate', async () => {
    wrapper = mount(CollectionTable, {
      props: {
        items: sources.map(([item]) => item),
        category: 'all',
        loading: false,
        error: false,
      },
      global: {
        plugins: plugins(),
        stubs: {
          CollectionItemDialog: true,
          DeleteCollectionItemDialog: true,
          TmdbImportDialog: true,
          IgdbImportDialog: true,
        },
      },
    })
    const links = wrapper.findAll('a.collection-cover-link')
    expect(links).toHaveLength(3)
    links.forEach((link, index) => {
      expect(link.attributes('href')).toBe(sources[index]![1])
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toBe('noopener noreferrer')
      expect(link.find('img').exists()).toBe(true)
    })
    expect(wrapper.findAll('button.collection-name-button')).toHaveLength(3)
  })

  it.each(sources)('links the edit cover for $name', async (item, url) => {
    wrapper = mount(CollectionItemDialog, {
      props: { item },
      attachTo: document.body,
      global: { plugins: plugins(), stubs: { transition: false } },
    })
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() =>
      expect(document.querySelector('a.item-dialog-cover-link')).not.toBeNull(),
    )
    const link = document.querySelector<HTMLAnchorElement>('a.item-dialog-cover-link')!
    expect(link.href).toBe(url)
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
    expect(link.querySelector('img')).not.toBeNull()
  })

  it('does not invent source links for manual items or untrusted URLs', () => {
    expect(
      itemSourceUrl({ id: 4, name: 'Manual', mediaType: 1, mediaFormat: 2, info: null }),
    ).toBeUndefined()
    const game = sources[2]![0]
    for (const sourceUrl of [
      'javascript:alert(1)',
      'https://www.igdb.com.evil.test/games/example',
      undefined,
    ]) {
      expect(
        itemSourceUrl({ ...game, sourceMetadata: { ...game.sourceMetadata!, sourceUrl } }),
      ).toBeUndefined()
    }
  })
})

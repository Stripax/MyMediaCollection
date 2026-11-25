import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import BggExpansionDetails from '../BggExpansionDetails.vue'
import CollectionTable from '../CollectionTable.vue'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'

const requiredGames = [
  { bggId: 13, name: 'Base game', sourceUrl: 'javascript:alert(1)' },
  { bggId: 18, name: 'Required expansion' },
]

describe('BGG expansion details', () => {
  it('shows all required games with ID-based links and follows UI language changes', async () => {
    const i18n = createI18n({ legacy: false, locale: 'fi', messages: { fi, en } })
    const wrapper = mount(BggExpansionDetails, {
      props: { isExpansion: true, requiredGames },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain(fi.bgg.expansion)
    expect(wrapper.text()).toContain(fi.bgg.requiredGames)
    const links = wrapper.findAll('a')
    expect(links.map((link) => link.text())).toEqual(['Base game', 'Required expansion'])
    expect(links.map((link) => link.attributes('href'))).toEqual([
      'https://boardgamegeek.com/boardgame/13',
      'https://boardgamegeek.com/boardgame/18',
    ])
    for (const link of links) {
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toBe('noopener noreferrer')
    }
    i18n.global.locale.value = 'en'
    await nextTick()
    expect(wrapper.text()).toContain(en.bgg.expansion)
    expect(wrapper.text()).toContain(en.bgg.requiredGames)
    wrapper.unmount()
  })

  it.each([false, null, undefined])(
    'does not infer requirements for a base or unknown game: %s',
    (isExpansion) => {
      const wrapper = mount(BggExpansionDetails, {
        props: { isExpansion, requiredGames },
        global: { plugins: [createI18n({ legacy: false, locale: 'fi', messages: { fi, en } })] },
      })
      expect(wrapper.findAll('a')).toHaveLength(0)
      expect(wrapper.text()).toContain(
        isExpansion === false ? fi.bgg.baseGame : fi.sourceMetadata.unknown,
      )
      wrapper.unmount()
    },
  )

  it('handles missing required games without claiming independent play', () => {
    const wrapper = mount(BggExpansionDetails, {
      props: { isExpansion: true },
      global: { plugins: [createI18n({ legacy: false, locale: 'fi', messages: { fi, en } })] },
    })
    expect(wrapper.text()).toContain(fi.bgg.requiredGamesUnknown)
    wrapper.unmount()
  })

  it.each(['all', 'boardGames'] as const)(
    'marks only known BGG expansions in the %s table',
    (category) => {
      const source = {
        source: 'BGG' as const,
        title: 'Expansion',
        overview: '',
        originalTitle: null,
        releaseDate: null,
        language: null,
        fetchedAt: null,
        platforms: [],
        requiredGames,
      }
      const base = { name: 'Game', mediaType: 4, mediaFormat: 5, info: null }
      const wrapper = mount(CollectionTable, {
        props: {
          category,
          loading: false,
          error: false,
          items: [
            { ...base, id: 1, sourceMetadata: { ...source, isExpansion: true } },
            { ...base, id: 2, sourceMetadata: { ...source, isExpansion: false } },
            { ...base, id: 3, sourceMetadata: { ...source, isExpansion: null } },
            { ...base, id: 4 },
          ],
        },
        global: {
          plugins: [createI18n({ legacy: false, locale: 'fi', messages: { fi, en } })],
          stubs: {
            CollectionItemDialog: true,
            DeleteCollectionItemDialog: true,
            TmdbImportDialog: true,
            IgdbImportDialog: true,
            BggImportDialog: true,
          },
        },
      })
      expect(wrapper.findAll('.bgg-expansion-badge')).toHaveLength(1)
      expect(wrapper.get('.bgg-expansion-badge').text()).toBe(fi.bgg.expansion)
      expect(wrapper.findAll('.bgg-base-game-badge')).toHaveLength(2)
      expect(wrapper.get('.bgg-base-game-badge').text()).toBe(fi.bgg.baseGame)
      const required = wrapper.findAll('.bgg-required-game-badge')
      expect(required.map((link) => link.text())).toEqual(['Base game', 'Required expansion'])
      expect(required.map((link) => link.attributes('href'))).toEqual([
        'https://boardgamegeek.com/boardgame/13',
        'https://boardgamegeek.com/boardgame/18',
      ])
      expect(
        required.every(
          (link) =>
            link.attributes('target') === '_blank' &&
            link.attributes('rel') === 'noopener noreferrer',
        ),
      ).toBe(true)
      wrapper.unmount()
    },
  )
})

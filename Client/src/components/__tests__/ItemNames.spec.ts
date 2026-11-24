import { describe, expect, it } from 'vitest'
import { displayItemName, searchableItemNames } from '../../models/itemNames'
import type { CollectionItem } from '../../models/collection'

const movie: CollectionItem = {
  id: 1,
  name: 'Tappajahai',
  mediaType: 1,
  mediaFormat: 2,
  info: null,
  tmdbId: 578,
  isNameCustom: false,
  localizedTitles: { fi: 'Tappajahai', en: 'Jaws' },
  sourceMetadata: {
    source: 'TMDB',
    title: 'Tappajahai',
    originalTitle: 'Jaws',
    overview: '',
    releaseDate: null,
    language: 'fi-FI',
    platforms: [],
    fetchedAt: null,
  },
}

describe('Collection item display names', () => {
  it('uses the selected language for TMDB movie and TV names', () => {
    for (const mediaType of [1, 2]) {
      expect(displayItemName({ ...movie, mediaType }, 'fi')).toBe('Tappajahai')
      expect(displayItemName({ ...movie, mediaType }, 'en')).toBe('Jaws')
    }
  })
  it('preserves manually added and user-renamed names', () => {
    expect(displayItemName({ ...movie, isNameCustom: true, name: 'My copy' }, 'en')).toBe('My copy')
    expect(displayItemName({ ...movie, tmdbId: null, name: 'Manual copy' }, 'en')).toBe(
      'Manual copy',
    )
    expect(displayItemName({ ...movie, isNameCustom: undefined }, 'en')).toBe('Tappajahai')
    expect(displayItemName({ ...movie, mediaType: 3, name: 'Game' }, 'en')).toBe('Game')
  })
  it('falls back to the original title when the selected translation is missing', () => {
    expect(displayItemName({ ...movie, localizedTitles: { fi: 'Tappajahai' } }, 'en')).toBe('Jaws')
    expect(displayItemName({ ...movie, localizedTitles: null, sourceMetadata: null }, 'en')).toBe(
      'Tappajahai',
    )
    expect(searchableItemNames(movie)).toContain('Tappajahai')
    expect(searchableItemNames(movie)).toContain('Jaws')
    expect(searchableItemNames({ ...movie, tmdbId: null })).toEqual(['Tappajahai'])
  })
})

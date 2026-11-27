import { computed, reactive, watch } from 'vue'
import {
  boardGameKind,
  hasIndividualSeasons,
  itemVersions,
  versionFormats,
  mediaCategories,
  type CollectionCategory,
  type CollectionItem,
} from '../models/collection'

type ValueFilter = number | '' | 'unknown'
export interface CollectionFilters {
  category: number | ''
  format: ValueFilter
  platform: ValueFilter
  store: number | '' | 'none'
  copyType: '' | 'physical' | 'digital' | 'unknown'
  gameType: ValueFilter
  boardKind: ValueFilter
  collectionType: '' | 'single' | 'collection' | 'completeBox'
}

function defaults(): CollectionFilters {
  return {
    category: '',
    format: '',
    platform: '',
    store: '',
    copyType: '',
    gameType: '',
    boardKind: '',
    collectionType: '',
  }
}

export function useCollectionFilters(category: () => CollectionCategory) {
  const filters = reactive(defaults())
  const mediaType = computed(() =>
    category() === 'all'
      ? filters.category
      : (mediaCategories.find((entry) => entry.id === category())?.value ?? ''),
  )
  const active = computed(() => Object.values(filters).some((value) => value !== ''))
  function reset() {
    Object.assign(filters, defaults())
  }
  watch(category, reset, { flush: 'sync' })
  watch(
    mediaType,
    () => {
      Object.assign(filters, { ...defaults(), category: filters.category })
    },
    { flush: 'sync' },
  )

  function valueMatches(value: number | null | undefined, filter: ValueFilter) {
    return filter === '' || (filter === 'unknown' ? value == null : value === filter)
  }

  function matches(item: CollectionItem) {
    return itemVersions(item).some((version) =>
      matchesVersion({ ...item, ...version, id: item.id }),
    )
  }

  function matchesVersion(item: CollectionItem) {
    if (mediaType.value !== '' && item.mediaType !== mediaType.value) return false
    if (filters.format !== '') {
      if (item.mediaType !== 1 && item.mediaType !== 2) return false
      const formats = versionFormats(item)
      if (!formats.some((format) => valueMatches(format, filters.format))) return false
    }
    if (filters.collectionType !== '') {
      if (item.mediaType === 2) {
        const matchesType =
          filters.collectionType === 'completeBox'
            ? !!item.isCompleteBox
            : filters.collectionType === 'single' && hasIndividualSeasons(item)
        if (item.isCollection || !matchesType) return false
      } else if (item.mediaType === 1) {
        if (
          filters.collectionType === 'completeBox' ||
          !!item.isCollection !== (filters.collectionType === 'collection')
        )
          return false
      } else return false
    }
    if (
      filters.platform !== '' &&
      (item.mediaType !== 3 || !valueMatches(item.platform, filters.platform))
    )
      return false
    if (filters.store !== '') {
      const store = item.isPhysical ? null : item.store
      if (
        item.mediaType !== 3 ||
        (filters.store === 'none' ? store != null : store !== filters.store)
      )
        return false
    }
    if (
      filters.copyType !== '' &&
      (item.mediaType !== 3 ||
        (filters.copyType === 'unknown'
          ? item.isPhysical != null
          : item.isPhysical !== (filters.copyType === 'physical')))
    )
      return false
    if (
      filters.gameType !== '' &&
      (item.mediaType !== 4 || !valueMatches(item.mediaFormat, filters.gameType))
    )
      return false
    if (
      filters.boardKind !== '' &&
      (item.mediaType !== 4 || !valueMatches(boardGameKind(item), filters.boardKind))
    )
      return false
    return true
  }
  return { filters, mediaType, active, reset, matches }
}

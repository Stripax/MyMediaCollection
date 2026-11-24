import type { CollectionItem } from './collection'

function hasTmdbNames(item: CollectionItem) {
  return !!item.tmdbId && (item.mediaType === 1 || item.mediaType === 2)
}

export function displayItemName(item: CollectionItem, locale: string) {
  if (!hasTmdbNames(item) || item.isNameCustom !== false) return item.name
  const language = locale.startsWith('fi') ? 'fi' : 'en'
  return (
    item.localizedTitles?.[language]?.trim() ||
    item.sourceMetadata?.originalTitle?.trim() ||
    item.localizedTitles?.[language === 'fi' ? 'en' : 'fi']?.trim() ||
    item.name
  )
}

export function searchableItemNames(item: CollectionItem) {
  return hasTmdbNames(item)
    ? [
        item.name,
        ...Object.values(item.localizedTitles ?? {}),
        item.sourceMetadata?.originalTitle ?? '',
      ]
    : [item.name]
}

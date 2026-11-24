import type { CollectionItem } from './collection'

export function itemSourceUrl(item: CollectionItem): string | undefined {
  if (
    (item.mediaType === 1 || item.mediaType === 2) &&
    Number.isSafeInteger(item.tmdbId) &&
    item.tmdbId! > 0
  ) {
    return `https://www.themoviedb.org/${item.mediaType === 1 ? 'movie' : 'tv'}/${item.tmdbId}`
  }
  if (item.mediaType === 3) {
    const url = item.sourceMetadata?.sourceUrl
    if (url && /^https:\/\/www\.igdb\.com\/games\/[a-zA-Z0-9-]+\/?$/.test(url)) return url
  }
}

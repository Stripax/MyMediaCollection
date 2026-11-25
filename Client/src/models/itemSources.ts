import type { CollectionItem } from './collection'
import { posterUrl } from './tmdb'
import { igdbCoverUrl } from './igdb'
import { bggImageUrl } from './bgg'

export function itemCoverUrl(item: CollectionItem): string | null {
  return item.mediaType === 4
    ? bggImageUrl(item.bggImageUrl)
    : item.mediaType === 3
      ? igdbCoverUrl(item.coverImageId)
      : posterUrl(item.posterPath)
}

export function itemSourceName(item: CollectionItem): 'TMDB' | 'IGDB' | 'BGG' {
  return item.mediaType === 4 ? 'BGG' : item.mediaType === 3 ? 'IGDB' : 'TMDB'
}

export function itemSourceTooltip(item: CollectionItem): string {
  return item.mediaType === 4
    ? 'sourceMetadata.openBgg'
    : item.mediaType === 3
      ? 'sourceMetadata.openIgdb'
      : 'sourceMetadata.openTmdb'
}

export function itemSourceUrl(item: CollectionItem): string | undefined {
  if (item.mediaType === 4 && Number.isSafeInteger(item.bggId) && item.bggId! > 0)
    return `https://boardgamegeek.com/boardgame/${item.bggId}`
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

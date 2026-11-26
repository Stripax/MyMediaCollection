export const mediaCategories = [
  { id: 'movies', value: 1, label: 'sidebar.movies' },
  { id: 'tvSeries', value: 2, label: 'sidebar.tvSeries' },
  { id: 'videoGames', value: 3, label: 'sidebar.videoGames' },
  { id: 'boardGames', value: 4, label: 'sidebar.boardGames' },
] as const

export const otherOption = 99

export const mediaFormats = [
  { value: 1, label: 'DVD' },
  { value: 2, label: 'Blu-ray' },
  { value: 3, label: '4K UHD Blu-ray' },
  { value: otherOption, label: 'Other' },
] as const

export type CollectionCategory = 'all' | (typeof mediaCategories)[number]['id']

export const boardGameFormats = [
  { value: 4, label: 'gameTypes.boardGame' },
  { value: 5, label: 'gameTypes.cardGame' },
  { value: otherOption, label: 'gameTypes.otherGame' },
] as const

// Values match the backend GamePlatform enum. Never renumber saved values.
export const pcPlatform = 26

export const gamePlatforms = [
  { value: 1, label: 'Xbox' },
  { value: 2, label: 'Xbox 360' },
  { value: 3, label: 'Xbox One' },
  { value: 4, label: 'Xbox Series S/X' },
  { value: 5, label: 'PlayStation' },
  { value: 6, label: 'PlayStation 2' },
  { value: 7, label: 'PlayStation 3' },
  { value: 8, label: 'PlayStation 4' },
  { value: 9, label: 'PlayStation 5' },
  { value: 10, label: 'PSP' },
  { value: 11, label: 'PlayStation Vita' },
  { value: 12, label: 'Nintendo Entertainment System (NES)' },
  { value: 13, label: 'Super Nintendo (SNES)' },
  { value: 14, label: 'Nintendo 64' },
  { value: 15, label: 'Nintendo GameCube' },
  { value: 16, label: 'Nintendo Wii' },
  { value: 17, label: 'Nintendo Wii U' },
  { value: 18, label: 'Nintendo Switch' },
  { value: 19, label: 'Game Boy' },
  { value: 20, label: 'Game Boy Advance' },
  { value: 21, label: 'Nintendo DS' },
  { value: 22, label: 'Nintendo 3DS' },
  { value: 23, label: 'Sega Mega Drive' },
  { value: 24, label: 'Sega Dreamcast' },
  { value: 25, label: 'Nintendo Switch 2' },
  { value: pcPlatform, label: 'PC' },
  { value: otherOption, label: 'Other' },
] as const

// Values match the backend GameStore enum.
export const gameStores = [
  { value: 1, label: 'Steam' },
  { value: 2, label: 'GOG' },
  { value: 3, label: 'Epic Games Store' },
  { value: 4, label: 'Microsoft Store' },
  { value: 5, label: 'EA app' },
  { value: 6, label: 'Ubisoft Store' },
  { value: 7, label: 'Battle.net' },
  { value: 8, label: 'itch.io' },
  { value: 9, label: 'Xbox Store' },
  { value: 10, label: 'PlayStation Store' },
  { value: otherOption, label: 'Other' },
] as const

export function gameStoreOptions(platform: number | '' | null | undefined) {
  if (platform == null || platform === '') return []
  if (platform === otherOption) return gameStores
  return gameStores.filter(
    (store) =>
      store.value === otherOption ||
      (platform >= 1 && platform <= 4
        ? store.value === 9
        : platform >= 5 && platform <= 11
          ? store.value === 10
          : platform === pcPlatform && store.value >= 1 && store.value <= 8),
  )
}

export interface OwnedSeason {
  seasonNumber: number
  mediaFormat: number
}

export interface TmdbSeason {
  seasonNumber: number
  name: string
  episodeCount: number | null
}

export interface CollectionSourceMetadata {
  source: 'TMDB' | 'IGDB' | 'BGG'
  sourceUrl?: string | null
  title: string
  originalTitle: string | null
  overview: string
  localizedOverviews?: Partial<Record<'fi' | 'en', string>> | null
  releaseDate: string | null
  yearPublished?: number | null
  minPlayers?: number | null
  maxPlayers?: number | null
  playingTime?: number | null
  minAge?: number | null
  isExpansion?: boolean | null
  requiredGames?: import('./bgg').BggGameReference[]
  language: string | null
  platforms: string[]
  fetchedAt: string | null
  numberOfSeasons?: number | null
  numberOfEpisodes?: number | null
  seasons?: TmdbSeason[]
}

export interface CollectionItem {
  id: number
  name: string
  isNameCustom?: boolean
  localizedTitles?: Partial<Record<'fi' | 'en', string>> | null
  mediaType: number
  boardGameKind?: number | null
  baseGames?: BoardGameReference[]
  mediaFormat: number | null
  platform?: number | null
  store?: number | null
  isPhysical?: boolean | null
  isCompleteBox?: boolean
  isCollection?: boolean
  collectionContents?: CollectionContent[]
  ownedSeasons?: OwnedSeason[]
  info: string | null
  createdAt?: string | null
  updatedAt?: string | null
  userId?: string | null
  tmdbMetadataId?: number | null
  tmdbId?: number | null
  posterPath?: string | null
  igdbMetadataId?: number | null
  igdbId?: number | null
  coverImageId?: string | null
  bggMetadataId?: number | null
  bggId?: number | null
  bggImageUrl?: string | null
  sourceMetadata?: CollectionSourceMetadata | null
}

export interface CollectionContent {
  name: string
  tmdbId?: number | null
  posterPath?: string | null
  sourceMetadata?: CollectionSourceMetadata | null
}

export interface BoardGameReference {
  collectionItemId?: number | null
  bggId?: number | null
  name: string
}

export function boardGameKind(item: CollectionItem): number | undefined {
  if (item.mediaType !== 4) return undefined
  return (
    item.boardGameKind ??
    (item.sourceMetadata?.isExpansion === true
      ? 2
      : item.sourceMetadata?.isExpansion === false
        ? 1
        : !item.bggId && !item.sourceMetadata
          ? 1
          : undefined)
  )
}

export function boardGameParents(item: CollectionItem): BoardGameReference[] {
  if (boardGameKind(item) !== 2 && boardGameKind(item) !== 99) return []
  return item.baseGames ?? item.sourceMetadata?.requiredGames ?? []
}

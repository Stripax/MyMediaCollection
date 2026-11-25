export interface BggResult {
  bggId: number
  title: string
  overview: string
  yearPublished: number | null
  releaseDate?: string | null
  imageUrl: string | null
  sourceUrl: string
  minPlayers: number | null
  maxPlayers: number | null
  playingTime: number | null
  minAge: number | null
  isExpansion?: boolean | null
  requiredGames?: BggGameReference[]
}

export interface BggGameReference {
  bggId: number
  name: string
  sourceUrl?: string
}

export function bggImageUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      ['cf.geekdo-images.com', 'images.geekdo.com'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.href
      : null
  } catch {
    return null
  }
}

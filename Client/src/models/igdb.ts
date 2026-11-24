export interface IgdbResult {
  igdbId: number
  title: string
  overview: string
  releaseDate: string | null
  coverImageId: string | null
  sourceUrl?: string | null
  platforms: string[]
}

export function igdbCoverUrl(imageId: string | null | undefined) {
  return imageId && /^[A-Za-z0-9_-]+$/.test(imageId)
    ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`
    : null
}

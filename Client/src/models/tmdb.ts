export interface TmdbResult {
  tmdbId: number
  mediaType: number
  language: string
  title: string
  originalTitle: string
  overview: string
  releaseDate: string | null
  posterPath: string | null
}

export interface TmdbSearchPage {
  page: number
  totalPages: number
  results: TmdbResult[]
}

export function posterUrl(path: string | null | undefined) {
  return path && /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(path)
    ? `https://image.tmdb.org/t/p/w185${path}`
    : null
}

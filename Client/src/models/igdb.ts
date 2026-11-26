import { gamePlatforms, otherOption } from './collection'

export interface IgdbResult {
  igdbId: number
  title: string
  overview: string
  releaseDate: string | null
  coverImageId: string | null
  sourceUrl?: string | null
  platforms: string[]
}

// Match provider names to our saved enum values; never persist provider IDs as enum values.
const platformAliases: Record<string, number> = {
  'Xbox Series X|S': 4,
  'Xbox Series X/S': 4,
  'PlayStation Portable': 10,
  'Nintendo NES': 12,
  'Nintendo Entertainment System': 12,
  'Nintendo Entertainment System (NES)': 12,
  'Super Nintendo Entertainment System': 13,
  'Super Nintendo Entertainment System (SNES)': 13,
  'Super Famicom': 13,
  GameCube: 15,
  Wii: 16,
  'Wii U': 17,
  'Sega Mega Drive/Genesis': 23,
  'Sega Genesis': 23,
  Dreamcast: 24,
  'PC (Microsoft Windows)': 26,
}
const normalizePlatform = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const platformValues = new Map([
  ...gamePlatforms.map((platform) => [normalizePlatform(platform.label), platform.value] as const),
  ...Object.entries(platformAliases).map(
    ([name, value]) => [normalizePlatform(name), value] as const,
  ),
])

export function igdbPlatformOptions(platforms?: readonly string[] | null) {
  const names = platforms?.map((name) => name.trim()).filter(Boolean) ?? []
  if (!names.length) return gamePlatforms
  const values = new Set(names.map((name) => platformValues.get(normalizePlatform(name))))
  return gamePlatforms.filter(
    (platform) => values.has(platform.value) || platform.value === otherOption,
  )
}

export function igdbCoverUrl(imageId: string | null | undefined) {
  return imageId && /^[A-Za-z0-9_-]+$/.test(imageId)
    ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`
    : null
}

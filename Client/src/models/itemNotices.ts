import { mediaCategories } from './collection'

export function itemNoticeKey(action: 'saved' | 'updated' | 'deleted', mediaType: number) {
  const category = mediaCategories.find((category) => category.value === mediaType)?.id ?? 'all'
  return `collection.notifications.${action}.${category}`
}

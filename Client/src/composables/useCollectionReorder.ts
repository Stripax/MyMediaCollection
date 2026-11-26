import { nextTick, ref, type Ref } from 'vue'

export function useCollectionReorder<T>(items: Ref<T[]>, changed?: () => void) {
  const list = ref<HTMLElement | null>(null)
  const draggedIndex = ref<number | null>(null)
  const dropIndex = ref<number | null>(null)

  function end() {
    draggedIndex.value = null
    dropIndex.value = null
  }

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= items.value.length || to >= items.value.length)
      return
    const reordered = [...items.value]
    const entry = reordered.splice(from, 1)[0]!
    reordered.splice(to, 0, entry)
    items.value = reordered
    changed?.()
    void nextTick(() =>
      list.value
        ?.querySelector<HTMLElement>(`[data-collection-index="${to}"] .collection-drag-handle`)
        ?.focus(),
    )
  }

  function start(index: number, event: DragEvent) {
    if (items.value.length < 2) {
      event.preventDefault()
      return
    }
    draggedIndex.value = index
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(index))
      const row = (event.currentTarget as HTMLElement | null)?.closest<HTMLElement>(
        '[data-collection-index]',
      )
      if (row) event.dataTransfer.setDragImage?.(row, 20, row.offsetHeight / 2)
    }
  }

  function over(index: number, event: DragEvent) {
    if (draggedIndex.value === null) return
    event.preventDefault()
    dropIndex.value = index
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  function drop(index: number, event: DragEvent) {
    if (draggedIndex.value === null) return
    event.preventDefault()
    move(draggedIndex.value, index)
    end()
  }

  return { list, draggedIndex, dropIndex, start, over, drop, end, move }
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import CollectionTable from '../CollectionTable.vue'
import type { CollectionItem } from '../../models/collection'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'

let wrapper: VueWrapper | undefined
let styles: HTMLStyleElement
const original: CollectionItem = {
  id: 1,
  name: 'Alkuperäinen',
  mediaType: 1,
  mediaFormat: 1,
  info: null,
}
const added: CollectionItem = { ...original, id: 2, name: 'Lisätty' }

beforeEach(() => {
  styles = document.createElement('style')
  styles.textContent = `
    .collection-row-enter-active { transition-property: opacity; transition-duration: 0.32s; }
    .collection-row-leave-active { transition-property: opacity; transition-duration: 0.32s; }
    .collection-row-move { transition-property: transform; transition-duration: 0.32s; }
  `
  document.head.append(styles)
})

afterEach(() => {
  wrapper?.unmount()
  styles.remove()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function mountTable() {
  wrapper = mount(CollectionTable, {
    attachTo: document.body,
    props: { items: [original], category: 'all', loading: false, error: false },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'fi', messages: { en, fi } })],
      stubs: { 'transition-group': false },
    },
  })
  return wrapper
}

describe('Vue table row transitions', () => {
  it('highlights only an updated existing row and restarts the highlight on another edit', async () => {
    vi.useFakeTimers()
    const table = mountTable()
    const row = table.get('tbody tr').element
    expect(row.classList.contains('collection-row-updated')).toBe(false)
    const renamed = { ...original, name: 'Muokattu', updatedAt: '2026-11-26T12:00:00Z' }
    await table.setProps({ items: [renamed] })
    expect(table.get('tbody tr').element).toBe(row)
    expect(row.classList.contains('collection-row-updated')).toBe(true)
    expect(row.classList.contains('collection-row-enter-active')).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    const changed = { ...renamed, info: 'Lisätieto' }
    await table.setProps({ items: [changed] })
    await vi.advanceTimersByTimeAsync(1799)
    expect(row.classList.contains('collection-row-updated')).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(row.classList.contains('collection-row-updated')).toBe(false)
    await table.setProps({ items: [{ ...changed, posterPath: '/cached-cover.jpg' }] })
    expect(row.classList.contains('collection-row-updated')).toBe(false)
    await table.setProps({ items: [{ ...changed, updatedAt: '2026-11-26T12:01:00Z' }] })
    expect(row.classList.contains('collection-row-updated')).toBe(true)
    table.unmount()
    expect(row.classList.contains('collection-row-updated')).toBe(false)
  })

  it('animates the existing row down while the new row enters at the top', async () => {
    const table = mountTable()
    const existing = table.get('tbody tr').element as HTMLTableRowElement
    vi.spyOn(existing, 'getBoundingClientRect').mockImplementation(
      () =>
        new DOMRect(0, existing.parentElement?.firstElementChild === existing ? 0 : 80, 800, 80),
    )
    await table.setProps({ items: [added, original] })
    expect(table.findAll('tbody tr')[1]!.element).toBe(existing)
    expect(table.findAll('tbody tr')[0]!.classes()).toContain('collection-row-enter-active')
    expect(table.find('.collection-row-updated').exists()).toBe(false)
    expect(existing.classList.contains('collection-row-move')).toBe(true)
    const moveEnd = new Event('transitionend', { bubbles: true })
    Object.defineProperty(moveEnd, 'propertyName', { value: 'transform' })
    existing.dispatchEvent(moveEnd)
    await vi.waitFor(() => expect(table.find('.collection-row-enter-active').exists()).toBe(false))
    expect(table.findAll('tbody .collection-name-button').map((button) => button.text())).toEqual([
      added.name,
      original.name,
    ])
  })

  it.each([false, true])(
    'keeps the departing row in flow and moves the next row only after removal (reduced motion: %s)',
    async (reducedMotion) => {
      vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: reducedMotion }))
      const table = mountTable()
      await table.setProps({ items: [original, added] })
      await vi.waitFor(() =>
        expect(table.find('.collection-row-enter-active').exists()).toBe(false),
      )
      const departing = table.findAll('tbody tr')[0]!.element as HTMLTableRowElement
      const remaining = table.findAll('tbody tr')[1]!.element as HTMLTableRowElement
      vi.spyOn(remaining, 'getBoundingClientRect').mockImplementation(
        () => new DOMRect(0, departing.isConnected ? 80 : 0, 800, 80),
      )
      const cancel = vi.fn()
      const animate = vi.fn().mockReturnValue({ cancel, onfinish: null })
      Object.defineProperty(remaining, 'animate', { value: animate, configurable: true })
      await table.setProps({ items: [added] })
      expect(departing.isConnected).toBe(true)
      expect(departing.classList.contains('collection-row-leave-active')).toBe(true)
      expect(departing.style.position).toBe('')
      expect(animate).not.toHaveBeenCalled()
      await vi.waitFor(() => expect(departing.isConnected).toBe(false))
      if (reducedMotion) expect(animate).not.toHaveBeenCalled()
      else {
        expect(animate).toHaveBeenCalledWith(
          [{ transform: 'translateY(80px)' }, { transform: 'translateY(0)' }],
          expect.objectContaining({ duration: 240 }),
        )
        table.unmount()
        expect(cancel).toHaveBeenCalled()
      }
    },
  )

  it('slides the old category out before switching columns and sliding the new category in', async () => {
    const table = mountTable()
    const game: CollectionItem = {
      ...original,
      id: 3,
      name: 'Peli',
      mediaType: 3,
      mediaFormat: null,
      platform: 9,
    }
    await table.setProps({ items: [original, game] })
    await vi.waitFor(() => expect(table.find('.collection-row-enter-active').exists()).toBe(false))
    const previousBody = table.get('tbody').element
    const previousRows = table.findAll('tbody tr').map((row) => row.element)
    await table.setProps({ category: 'videoGames' })
    expect(table.findAll('.collection-row-leave-active')).toHaveLength(2)
    expect(table.get('table').attributes('data-category')).toBe('all')
    expect(table.find('th.collection-category').exists()).toBe(true)
    expect(table.find('.collection-empty').exists()).toBe(false)
    for (const row of previousRows) {
      expect(row.getAttribute('aria-hidden')).toBe('true')
      expect((row as HTMLTableRowElement).inert).toBe(true)
    }
    await vi.waitFor(() =>
      expect(table.get('table').attributes('data-category')).toBe('videoGames'),
    )
    expect(previousBody.isConnected).toBe(true)
    expect(table.findAll('tbody')).toHaveLength(1)
    expect(table.get('tbody .collection-name-button').text()).toBe('Peli')
    expect(table.get('tbody tr').classes()).toContain('collection-row-enter-active')
    expect(table.find('th.collection-copy-type').exists()).toBe(true)
    expect(previousRows.every((row) => !row.isConnected)).toBe(true)
    await table.setProps({ category: 'movies' })
    await vi.waitFor(() => expect(table.get('table').attributes('data-category')).toBe('movies'))
    expect(table.get('tbody .collection-name-button').text()).toBe(original.name)
    expect(table.findAll('thead th')).toHaveLength(2)
  })

  it('finishes a rapid category change with only the latest category rows and columns', async () => {
    const table = mountTable()
    const game: CollectionItem = {
      ...original,
      id: 3,
      name: 'Peli',
      mediaType: 3,
      mediaFormat: null,
      platform: 9,
    }
    const series: CollectionItem = { ...original, id: 4, name: 'Sarja', mediaType: 2 }
    await table.setProps({ items: [original, game, series] })
    await vi.waitFor(() => expect(table.find('.collection-row-enter-active').exists()).toBe(false))
    await table.setProps({ category: 'movies' })
    await table.setProps({ category: 'videoGames' })
    await table.setProps({ category: 'tvSeries' })
    await vi.waitFor(() => expect(table.get('table').attributes('data-category')).toBe('tvSeries'))
    expect(table.findAll('tbody tr')).toHaveLength(1)
    expect(table.get('tbody .collection-name-button').text()).toBe('Sarja')
    expect(table.findAll('thead th')).toHaveLength(2)
    expect(table.find('.collection-row-leave-active').exists()).toBe(false)
    await table.setProps({ category: 'boardGames' })
    await vi.waitFor(() =>
      expect(table.get('table').attributes('data-category')).toBe('boardGames'),
    )
    expect(table.get('.collection-empty').text()).toBe(fi.collection.emptyCategory)
    await table.setProps({ category: 'movies' })
    await vi.waitFor(() => expect(table.get('table').attributes('data-category')).toBe('movies'))
    expect(table.get('tbody .collection-name-button').text()).toBe(original.name)
  })

  it('animates insertions and deletions while preserving unchanged rows and the empty state', async () => {
    const table = mountTable()
    const originalRow = table.get('tbody tr').element
    await table.setProps({ items: [added, { ...original }] })
    expect(table.findAll('tbody tr')[1]!.element).toBe(originalRow)
    expect(table.findAll('tbody tr')[0]!.classes()).toContain('collection-row-enter-active')
    await vi.waitFor(() => expect(table.find('.collection-row-enter-active').exists()).toBe(false))

    await table.setProps({ items: [added] })
    expect(originalRow.isConnected).toBe(true)
    expect(originalRow.classList.contains('collection-row-leave-active')).toBe(true)
    expect(originalRow.getAttribute('aria-hidden')).toBe('true')
    expect((originalRow as HTMLTableRowElement).inert).toBe(true)
    await vi.waitFor(() => expect(originalRow.isConnected).toBe(false))
    expect(table.findAll('tbody tr')).toHaveLength(1)
    expect(table.get('tbody .collection-name-button').text()).toBe(added.name)

    const lastRow = table.get('tbody tr').element
    await table.setProps({ items: [] })
    expect(lastRow.classList.contains('collection-row-leave-active')).toBe(true)
    expect(table.get('.collection-empty').text()).toBe(fi.collection.empty)
    await vi.waitFor(() => expect(lastRow.isConnected).toBe(false))
    expect(table.findAll('tbody')).toHaveLength(1)
    expect(table.findAll('tbody tr')).toHaveLength(1)
    expect(table.get('.collection-empty').attributes('colspan')).toBe('3')
  })

  it('restores a usable row if a filter change brings it back before the exit finishes', async () => {
    const table = mountTable()
    await table.setProps({ items: [] })
    expect(table.find('.collection-row-leave-active').exists()).toBe(true)
    await table.setProps({ items: [{ ...original }] })
    await vi.waitFor(() => expect(table.find('.collection-row-leave-active').exists()).toBe(false))
    const row = table.get('tbody tr')
    expect(row.text()).toContain(original.name)
    expect(row.attributes('aria-hidden')).toBeUndefined()
    expect((row.element as HTMLTableRowElement).inert).not.toBe(true)
    expect((row.element as HTMLElement).style.position).toBe('')
    expect(row.findAll('button')).toHaveLength(5)
  })
})

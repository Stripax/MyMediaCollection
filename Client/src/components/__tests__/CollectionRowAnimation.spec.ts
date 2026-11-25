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
    .collection-row-enter-active { transition-property: opacity; transition-duration: 0.22s; }
    .collection-row-leave-active { transition-property: opacity; transition-duration: 0.18s; }
  `
  document.head.append(styles)
})

afterEach(() => {
  wrapper?.unmount()
  styles.remove()
  document.body.innerHTML = ''
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
    expect(table.get('.collection-empty').attributes('colspan')).toBe('5')
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
    expect(row.findAll('button')).toHaveLength(3)
  })
})

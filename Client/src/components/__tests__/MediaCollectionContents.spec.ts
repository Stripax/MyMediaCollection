import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import MediaCollectionContents from '../MediaCollectionContents.vue'
import type { CollectionContent } from '../../models/collection'
import fi from '../../lang/fi.json'
import en from '../../lang/en.json'

let wrapper: VueWrapper | undefined
let styles: HTMLStyleElement | undefined
afterEach(() => {
  wrapper?.unmount()
  styles?.remove()
  document.body.innerHTML = ''
})

describe('Collection contents reorder animation', () => {
  it('keeps the same input rows when renamed and animates their movement when reordered', async () => {
    styles = document.createElement('style')
    styles.textContent =
      '.collection-content-move { transition-property: transform; transition-duration: 0.26s; }'
    document.head.append(styles)
    wrapper = mount(MediaCollectionContents, {
      props: {
        modelValue: [
          { name: 'First', tmdbId: 701 },
          { name: 'Second', tmdbId: 702 },
        ],
        'onUpdate:modelValue': (value: CollectionContent[]) =>
          wrapper!.setProps({ modelValue: value }),
      },
      attachTo: document.body,
      global: {
        plugins: [createI18n({ legacy: false, locale: 'fi', messages: { fi, en } })],
        stubs: { 'transition-group': false },
      },
    })
    const first = wrapper.findAll('.media-collection-entry')[0]!.element as HTMLElement
    const second = wrapper.findAll('.media-collection-entry')[1]!.element as HTMLElement
    const input = wrapper.get('input[name="CollectionContent-0"]').element as HTMLInputElement
    await wrapper.findAll('.collection-drag-handle')[1]!.trigger('click')
    const inspections = wrapper.emitted('inspect')!
    expect(inspections[inspections.length - 1]![0]).toMatchObject({ name: 'Second', tmdbId: 702 })
    expect(wrapper.findAll('.media-collection-entry').map((row) => row.element)).toEqual([
      first,
      second,
    ])
    input.focus()
    expect(wrapper.find('.item-form-field > span').exists()).toBe(false)
    expect(input.getAttribute('aria-label')).toBe('Kohteen 1 nimi')
    await wrapper.get('input[name="CollectionContent-0"]').setValue('First renamed')
    expect(wrapper.findAll('.media-collection-entry')[0]!.element).toBe(first)
    expect(document.activeElement).toBe(input)
    for (const row of [first, second]) {
      row.getBoundingClientRect = () =>
        new DOMRect(0, Number(row.dataset.collectionIndex) * 80, 500, 80)
    }
    await wrapper.findAll('.collection-drag-handle')[0]!.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.findAll('.media-collection-entry').map((row) => row.element)).toEqual([
      second,
      first,
    ])
    expect(first.classList.contains('collection-content-move')).toBe(true)
    expect(second.classList.contains('collection-content-move')).toBe(true)
    expect(wrapper.get('input[name="CollectionContent-1"]').element).toBe(input)
    expect(input.value).toBe('First renamed')
    const updates = wrapper.emitted('update:modelValue')!
    const reordered = updates[updates.length - 1]![0] as CollectionContent[]
    expect(reordered.map((entry) => entry.tmdbId)).toEqual([702, 701])
    for (const row of [first, second]) {
      const event = new Event('transitionend', { bubbles: true })
      Object.defineProperty(event, 'propertyName', { value: 'transform' })
      row.dispatchEvent(event)
      expect(row.classList.contains('collection-content-move')).toBe(false)
    }
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import CollectionItemDialog from '../CollectionItemDialog.vue'
import DeleteCollectionItemDialog from '../DeleteCollectionItemDialog.vue'
import { useSnackbar } from '../../composables/useSnackbar'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'

let wrapper: VueWrapper | undefined
let styles: HTMLStyleElement

beforeEach(() => {
  // jsdom does not load the imported stylesheet; use actual transition durations.
  styles = document.createElement('style')
  styles.textContent = `
    .item-modal-enter-active { transition-property: opacity; transition-duration: 0.22s; }
    .item-modal-leave-active { transition-property: opacity; transition-duration: 0.16s; }
  `
  document.head.append(styles)
})

afterEach(() => {
  wrapper?.unmount()
  useSnackbar().dismiss()
  styles.remove()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const globalOptions = () => ({
  plugins: [createI18n({ legacy: false, locale: 'fi', messages: { en, fi } })],
  stubs: { transition: false },
})

describe('Vue dialog transitions', () => {
  it('keeps the form visible through its exit transition and restores focus after cancelling', async () => {
    wrapper = mount(CollectionItemDialog, { attachTo: document.body, global: globalOptions() })
    const trigger = wrapper.get('button')
    await trigger.trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
    const panel = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
    const layer = panel.element.closest<HTMLElement>('.item-dialog-layer')!
    await vi.waitFor(() => expect(layer.classList.contains('item-modal-enter-active')).toBe(false))
    await panel.get('.item-dialog-cancel').trigger('click')
    expect(layer.classList.contains('item-modal-leave-active')).toBe(true)
    expect(layer.style.display).not.toBe('none')
    expect(panel.element.hidden).toBe(false)
    expect(layer.hasAttribute('inert')).toBe(true)
    expect(layer.getAttribute('aria-hidden')).toBe('true')
    await vi.waitFor(() => expect(layer.style.display).toBe('none'))
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger.element))
  })

  it('emits the deletion only after the confirmation has finished animating out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    wrapper = mount(DeleteCollectionItemDialog, {
      attachTo: document.body,
      props: { item: { id: 1, name: 'Kohde', mediaType: 1, mediaFormat: 1, info: null } },
      global: globalOptions(),
    })
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).not.toBeNull())
    const panel = new DOMWrapper(document.querySelector<HTMLElement>('[role="alertdialog"]')!)
    const layer = panel.element.closest<HTMLElement>('.item-dialog-layer')!
    await vi.waitFor(() => expect(layer.classList.contains('item-modal-enter-active')).toBe(false))
    await panel.get('.collection-delete-confirm').trigger('click')
    await vi.waitFor(() => expect(layer.classList.contains('item-modal-leave-active')).toBe(true))
    expect(wrapper.emitted('deleted')).toBeUndefined()
    expect(layer.style.display).not.toBe('none')
    expect(panel.element.hidden).toBe(false)
    await vi.waitFor(() => expect(layer.style.display).toBe('none'))
    expect(wrapper.emitted('deleted')).toHaveLength(1)
  })
})

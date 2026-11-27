import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import SelectControl from '../SelectControl.vue'
import CollectionItemDialog from '../CollectionItemDialog.vue'
import { createI18n } from 'vue-i18n'
import fi from '../../lang/fi.json'
import en from '../../lang/en.json'

let wrapper: VueWrapper | undefined
const originalScrollTo = HTMLElement.prototype.scrollTo
beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
function setup() {
  const value = ref<number | ''>(1)
  const disabled = ref(false)
  const extra = ref(true)
  const label = ref('Format')
  const changed = vi.fn()
  wrapper = mount(
    defineComponent({
      components: { SelectControl },
      setup: () => ({ value, disabled, extra, label, changed }),
      template:
        '<form><label><span>{{label}}</span><SelectControl><select v-model.number="value" name="Format" required :disabled="disabled" @change="changed"><option value="" disabled>Choose</option><option :value="1">DVD</option><option :value="2">Blu-ray</option><option v-if="extra" :value="99">Other</option></select></SelectControl></label></form>',
    }),
    { attachTo: document.body, global: { stubs: { transition: false } } },
  )
  return { value, disabled, extra, label, changed }
}
afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  HTMLElement.prototype.scrollTo = originalScrollTo
})
async function list() {
  await vi.waitFor(() => expect(wrapper!.find('.select-control-trigger').exists()).toBe(true))
  await wrapper!.get('.select-control-trigger').trigger('click')
  await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull())
  return new DOMWrapper(document.querySelector<HTMLElement>('[role="listbox"]')!)
}
describe('Animated select control', () => {
  it('displays an empty placeholder and forwards required-field validation to the visible trigger', async () => {
    const { value } = setup()
    value.value = ''
    await vi.waitFor(() => expect(wrapper!.get('.select-control-trigger').text()).toBe('Choose'))
    const native = wrapper!.get('select').element as HTMLSelectElement
    expect(native.checkValidity()).toBe(false)
    await vi.waitFor(() =>
      expect(wrapper!.get('.select-control-trigger').attributes('aria-invalid')).toBe('true'),
    )
    expect(document.activeElement).toBe(wrapper!.get('.select-control-trigger').element)
    value.value = 2
    await vi.waitFor(() => expect(wrapper!.get('.select-control-trigger').text()).toBe('Blu-ray'))
    expect(native.checkValidity()).toBe(true)
    await vi.waitFor(() =>
      expect(wrapper!.get('.select-control-trigger').attributes('aria-invalid')).not.toBe('true'),
    )
  })

  it('keeps its parent dialog open when selecting, cancelling or clicking outside the options list', async () => {
    wrapper = mount(CollectionItemDialog, {
      props: { category: 'movies' },
      attachTo: document.body,
      global: {
        plugins: [createI18n({ legacy: false, locale: 'fi', messages: { fi, en } })],
        stubs: { transition: false },
      },
    })
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
    const dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
    const native = dialog.get('select[name="MediaFormat"]')
    const trigger = new DOMWrapper(
      native.element
        .closest('.select-control')!
        .querySelector<HTMLButtonElement>('.select-control-trigger')!,
    )
    await trigger.trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull())
    let popup = new DOMWrapper(document.querySelector<HTMLElement>('[role="listbox"]')!)
    await popup.get('[data-value="2"]').trigger('click')
    await vi.waitFor(() => expect((native.element as HTMLSelectElement).value).toBe('2'))
    expect(dialog.attributes('data-state')).toBe('open')
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).toBeNull())
    await trigger.trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull())
    popup = new DOMWrapper(document.querySelector<HTMLElement>('[role="listbox"]')!)
    await vi.waitFor(() => expect(document.activeElement).toBe(popup.element))
    await popup.trigger('keydown', { key: 'Escape' })
    await vi.waitFor(() => expect(trigger.attributes('aria-expanded')).toBe('false'))
    expect(dialog.attributes('data-state')).toBe('open')
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).toBeNull())
    await trigger.trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull())
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('listbox'))
    await dialog
      .get('input[name="Name"]')
      .trigger('pointerdown', { button: 0, pointerType: 'mouse' })
    await dialog.get('input[name="Name"]').trigger('pointerup', { button: 0, pointerType: 'mouse' })
    await dialog.get('input[name="Name"]').trigger('click')
    await vi.waitFor(() => expect(trigger.attributes('aria-expanded')).toBe('false'))
    expect(dialog.attributes('data-state')).toBe('open')
  })

  it('selects options through the visible list while preserving numeric values and native form data', async () => {
    const { value, changed } = setup()
    await vi.waitFor(() => expect(wrapper!.get('.select-control-trigger').text()).toBe('DVD'))
    const popup = await list()
    expect(wrapper!.get('.select-control-trigger').attributes('aria-label')).toBe('Format')
    expect(popup.findAll('[role="option"]')).toHaveLength(4)
    expect(popup.get('[data-value=""]').attributes('aria-disabled')).toBe('true')
    await popup.get('[data-value="2"]').trigger('click')
    await vi.waitFor(() => expect(value.value).toBe(2))
    expect(changed).toHaveBeenCalledTimes(1)
    expect(wrapper!.get('.select-control-trigger').text()).toBe('Blu-ray')
    expect(new FormData(wrapper!.get('form').element as HTMLFormElement).get('Format')).toBe('2')
    expect(wrapper!.get('.select-control-trigger').attributes('aria-expanded')).toBe('false')
  })
  it('fades out on Escape without changing selection and responds to live options and disabled state', async () => {
    const { value, disabled, extra, label } = setup()
    const popup = await list()
    const positioner = popup.element.parentElement!
    positioner.style.transitionProperty = 'opacity'
    positioner.style.transitionDuration = '0.18s'
    await popup.trigger('keydown', { key: 'Escape' })
    await vi.waitFor(() =>
      expect(positioner.classList.contains('select-options-leave-active')).toBe(true),
    )
    expect(value.value).toBe(1)
    await vi.waitFor(() =>
      expect(positioner.classList.contains('select-options-leave-to')).toBe(true),
    )
    positioner.dispatchEvent(new Event('transitionend', { bubbles: true }))
    await vi.waitFor(() => expect(positioner.isConnected).toBe(false))
    extra.value = false
    label.value = 'Formaatti'
    await vi.waitFor(() =>
      expect(wrapper!.get('.select-control-trigger').attributes('aria-label')).toBe('Formaatti'),
    )
    const next = await list()
    expect(next.find('[data-value="99"]').exists()).toBe(false)
    disabled.value = true
    await vi.waitFor(() =>
      expect((wrapper!.get('.select-control-trigger').element as HTMLButtonElement).disabled).toBe(
        true,
      ),
    )
    expect(wrapper!.get('.select-control-trigger').attributes('aria-expanded')).toBe('false')
  })
  it('supports keyboard selection and resets its displayed value when the native model changes', async () => {
    const { value } = setup()
    await vi.waitFor(() => expect(wrapper!.find('.select-control-trigger').exists()).toBe(true))
    ;(wrapper!.get('.select-control-trigger').element as HTMLButtonElement).focus()
    await wrapper!.get('.select-control-trigger').trigger('keydown', { key: 'Enter' })
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull())
    const popup = new DOMWrapper(document.querySelector<HTMLElement>('[role="listbox"]')!)
    await vi.waitFor(() => expect(document.activeElement).toBe(popup.element))
    await popup.trigger('keydown', { key: 'ArrowDown' })
    await popup.trigger('keydown', { key: 'Enter' })
    await vi.waitFor(() => expect(value.value).toBe(2))
    value.value = 1
    await vi.waitFor(() => expect(wrapper!.get('.select-control-trigger').text()).toBe('DVD'))
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import CollectionItemDialog from '../CollectionItemDialog.vue'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'

let wrapper: VueWrapper | undefined

async function openForm(locale = 'fi') {
  wrapper = mount(CollectionItemDialog, {
    attachTo: document.body,
    global: {
      plugins: [createI18n({ legacy: false, locale, messages: { en, fi } })],
    },
  })
  await wrapper.get('button').trigger('click')
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
  return new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
}

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('Collection item dialog', () => {
  it.each(['fi', 'en'])('opens a translated form with enum values in %s', async (locale) => {
    const dialog = await openForm(locale)
    const labels = locale === 'fi' ? fi : en
    expect(dialog.text()).toContain(labels.itemForm.title)
    expect(dialog.findAll('label > span').map((label) => label.text())).toEqual([
      labels.itemForm.category,
      labels.itemForm.name,
      labels.itemForm.mediaFormat,
      labels.itemForm.info,
    ])
    expect(
      dialog.findAll('select[name="MediaType"] option').map((option) => option.attributes('value')),
    ).toEqual(['1', '2', '3', '4'])
    expect(
      dialog
        .findAll('select[name="MediaFormat"] option')
        .map((option) => [option.attributes('value'), option.text()]),
    ).toEqual([
      ['1', 'DVD'],
      ['2', 'Blu-ray'],
      ['3', '4K UHD Blu-ray'],
    ])

    await dialog.get('select[name="MediaType"]').setValue('2')
    await dialog.get('input[name="Name"]').setValue('Test collection item')
    await dialog.get('select[name="MediaFormat"]').setValue('3')
    await dialog.get('textarea[name="Info"]').setValue('First line\nSecond line')
    expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe(
      'Test collection item',
    )
    expect((dialog.get('textarea[name="Info"]').element as HTMLTextAreaElement).value).toBe(
      'First line\nSecond line',
    )
    expect((dialog.get('select[name="MediaType"]').element as HTMLSelectElement).value).toBe('2')
    expect((dialog.get('select[name="MediaFormat"]').element as HTMLSelectElement).value).toBe('3')

    await dialog.get('button').trigger('click')
    await vi.waitFor(() => expect(wrapper!.get('button').attributes('aria-expanded')).toBe('false'))
  })

  it('posts numeric enums once, then closes and confirms a successful save', async () => {
    let finish!: (response: Response) => void
    const request = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    vi.stubGlobal('fetch', request)
    const dialog = await openForm()
    await dialog.get('input[name="Name"]').setValue('  Elokuva  ')
    await dialog.get('select[name="MediaType"]').setValue('2')
    await dialog.get('select[name="MediaFormat"]').setValue('3')
    await dialog.get('textarea[name="Info"]').setValue('Lisätiedot')
    await dialog.get('form').trigger('submit')
    await dialog.get('form').trigger('submit')
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ MediaType: 2, Name: 'Elokuva', MediaFormat: 3, Info: 'Lisätiedot' }),
    })
    expect(dialog.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    finish(new Response('{}', { status: 201 }))
    await vi.waitFor(() => expect(wrapper!.get('[role="status"]').text()).toBe(fi.itemForm.saved))
    expect(wrapper!.get('button').attributes('aria-expanded')).toBe('false')
  })

  it.each([400, 503, 'network'])(
    'keeps input and allows retry after a %s failure',
    async (failure) => {
      const request = vi.fn()
      if (failure === 'network') request.mockRejectedValueOnce(new TypeError('Offline'))
      else request.mockResolvedValueOnce(new Response('{}', { status: failure as number }))
      request.mockResolvedValueOnce(new Response('{}', { status: 201 }))
      vi.stubGlobal('fetch', request)
      const dialog = await openForm()
      await dialog.get('input[name="Name"]').setValue('Säilytä nimi')
      await dialog.get('form').trigger('submit')
      await vi.waitFor(() =>
        expect(dialog.get('[role="alert"]').text()).toBe(
          failure === 400 ? fi.itemForm.validationError : fi.itemForm.saveError,
        ),
      )
      expect((dialog.get('input[name="Name"]').element as HTMLInputElement).value).toBe(
        'Säilytä nimi',
      )
      expect(dialog.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
      await dialog.get('form').trigger('submit')
      await vi.waitFor(() => expect(wrapper!.find('[role="status"]').exists()).toBe(true))
      expect(request).toHaveBeenCalledTimes(2)
    },
  )

  it('rejects whitespace-only names before sending a request', async () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    const dialog = await openForm()
    await dialog.get('input[name="Name"]').setValue('   ')
    await dialog.get('form').trigger('submit')
    expect(dialog.get('[role="alert"]').text()).toBe(fi.itemForm.nameRequired)
    expect(request).not.toHaveBeenCalled()
  })
})

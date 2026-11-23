import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import DeleteCollectionItemDialog from '../DeleteCollectionItemDialog.vue'
import { useSnackbar } from '../../composables/useSnackbar'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'

let wrapper: VueWrapper | undefined

async function openConfirmation() {
  wrapper = mount(DeleteCollectionItemDialog, {
    attachTo: document.body,
    props: {
      item: { id: 19, name: 'Poistettava kohde', mediaType: 1, mediaFormat: 2, info: null },
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'fi', messages: { en, fi } })],
      stubs: { transition: false },
    },
  })
  await wrapper.get('button').trigger('click')
  await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).not.toBeNull())
  return new DOMWrapper(document.querySelector<HTMLElement>('[role="alertdialog"]')!)
}

afterEach(() => {
  wrapper?.unmount()
  useSnackbar().dismiss()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('Delete confirmation', () => {
  it.each([404, 503, 'network'])(
    'keeps the item after a %s error and permits retry',
    async (failure) => {
      const request = vi.fn()
      if (failure === 'network') request.mockRejectedValueOnce(new TypeError('Offline'))
      else request.mockResolvedValueOnce(new Response('{}', { status: failure as number }))
      request.mockResolvedValueOnce(new Response(null, { status: 204 }))
      vi.stubGlobal('fetch', request)
      const dialog = await openConfirmation()
      expect(request).not.toHaveBeenCalled()
      await dialog.get('.collection-delete-confirm').trigger('click')
      await vi.waitFor(() =>
        expect(dialog.get('[role="alert"]').text()).toBe(
          failure === 404 ? fi.itemForm.notFound : fi.collection.deleteError,
        ),
      )
      expect(wrapper!.emitted('deleted')).toBeUndefined()
      expect(useSnackbar().notice.value).toMatchObject({
        type: 'error',
        messageKey: failure === 404 ? 'itemForm.notFound' : 'collection.deleteError',
      })
      expect(wrapper!.get('button').attributes('aria-expanded')).toBe('true')
      await dialog.get('.collection-delete-confirm').trigger('click')
      await vi.waitFor(() => expect(wrapper!.emitted('deleted')).toHaveLength(1))
      expect(request).toHaveBeenLastCalledWith('/api/collection/19', { method: 'DELETE' })
    },
  )

  it('prevents repeated deletion and dismissal while the request is pending', async () => {
    let finish!: (response: Response) => void
    const request = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    vi.stubGlobal('fetch', request)
    const dialog = await openConfirmation()
    const confirm = dialog.get('.collection-delete-confirm')
    await confirm.trigger('click')
    await confirm.trigger('click')
    expect(request).toHaveBeenCalledTimes(1)
    expect(confirm.attributes('disabled')).toBeDefined()
    expect(dialog.get('button').attributes('disabled')).toBeDefined()
    await dialog.trigger('keydown', { key: 'Escape' })
    expect(wrapper!.get('button').attributes('aria-expanded')).toBe('true')
    finish(new Response(null, { status: 204 }))
    await vi.waitFor(() => expect(wrapper!.emitted('deleted')).toHaveLength(1))
    expect(wrapper!.get('button').attributes('aria-expanded')).toBe('false')
  })
})

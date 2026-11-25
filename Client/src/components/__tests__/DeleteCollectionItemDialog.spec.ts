import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import DeleteCollectionItemDialog from '../DeleteCollectionItemDialog.vue'
import { useSnackbar } from '../../composables/useSnackbar'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'

let wrapper: VueWrapper | undefined

async function openConfirmation(locale = 'fi') {
  wrapper = mount(DeleteCollectionItemDialog, {
    attachTo: document.body,
    props: {
      item: { id: 19, name: 'Poistettava kohde', mediaType: 1, mediaFormat: 2, info: null },
    },
    global: {
      plugins: [createI18n({ legacy: false, locale, messages: { en, fi } })],
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
  it.each([
    ['fi', 1, 'movies'],
    ['en', 1, 'movies'],
    ['fi', 2, 'tvSeries'],
    ['en', 2, 'tvSeries'],
    ['fi', 3, 'videoGames'],
    ['en', 3, 'videoGames'],
    ['fi', 4, 'boardGames'],
    ['en', 4, 'boardGames'],
  ] as const)(
    'shows category-specific confirmation in %s for %s',
    async (locale, mediaType, category) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
      const dialog = await openConfirmation(locale)
      await wrapper!.setProps({
        item: {
          id: 19,
          name: 'Example title',
          mediaType,
          mediaFormat: mediaType === 4 ? 4 : 2,
          info: null,
        },
      })
      const labels = locale === 'fi' ? fi : en
      expect(dialog.get('.item-dialog-title').text()).toBe(labels.collection.deleteTitles[category])
      expect(dialog.get('.item-dialog-description').text()).toBe(
        labels.collection.deleteConfirmations[category].replace('{name}', 'Example title'),
      )
      await dialog.get('.collection-delete-confirm').trigger('click')
      await vi.waitFor(() =>
        expect(useSnackbar().notice.value).toMatchObject({
          messageKey: `collection.notifications.deleted.${category}`,
          params: { name: 'Example title' },
        }),
      )
    },
  )
  it.each(['fi', 'en'])(
    'uses the displayed item name in the deletion notice in %s',
    async (locale) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
      const dialog = await openConfirmation(locale)
      await wrapper!.setProps({
        item: {
          id: 19,
          name: 'Tappajahai',
          mediaType: 1,
          mediaFormat: 2,
          info: null,
          tmdbId: 578,
          isNameCustom: false,
          localizedTitles: { fi: 'Tappajahai', en: 'Jaws' },
        },
      })
      await dialog.get('.collection-delete-confirm').trigger('click')
      await vi.waitFor(() =>
        expect(useSnackbar().notice.value).toMatchObject({
          messageKey: 'collection.notifications.deleted.movies',
          params: { name: locale === 'fi' ? 'Tappajahai' : 'Jaws' },
        }),
      )
    },
  )
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

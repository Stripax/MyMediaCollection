import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import VersionHistoryDialog from '../VersionHistoryDialog.vue'
import { useSnackbar } from '../../composables/useSnackbar'
import fi from '../../lang/fi.json'
import en from '../../lang/en.json'

const first = {
  id: 1,
  versionNumber: '1.0.0',
  description: 'First release\n<b>Plain text</b>',
  createdAt: '2026-11-01T12:00:00Z',
  userId: null,
}
const latest = { ...first, id: 2, versionNumber: '1.1.0', description: 'New features' }
let wrapper: VueWrapper | undefined
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

async function setup(locale = 'fi') {
  wrapper = mount(VersionHistoryDialog, {
    attachTo: document.body,
    global: {
      plugins: [createI18n({ legacy: false, locale, messages: { fi, en } })],
      stubs: { transition: false },
    },
  })
  await flushPromises()
  return wrapper
}
async function openDialog() {
  await wrapper!.get('.version-history-link').trigger('click')
  await flushPromises()
  return new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"]')!)
}
afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  useSnackbar().dismiss()
  vi.unstubAllGlobals()
})

describe('Version history', () => {
  it.each(['fi', 'en'])(
    'shows latest version, separated history and requires both nonempty fields in %s',
    async (locale) => {
      const request = vi.fn(async () => json([latest, first]))
      vi.stubGlobal('fetch', request)
      const app = await setup(locale)
      const labels = locale === 'fi' ? fi : en
      expect(app.get('.version-history-link').text()).toBe('1.1.0')
      const dialog = await openDialog()
      expect(dialog.get('.item-dialog-title').text()).toBe(labels.versionHistory.title)
      expect(dialog.get('.version-history-save').text()).toBe(labels.versionHistory.save)
      expect(
        dialog.findAll('.version-history-entry-heading h4').map((entry) => entry.text()),
      ).toEqual(['1.1.0', '1.0.0'])
      expect(dialog.findAll('.version-history-list hr')).toHaveLength(1)
      expect(dialog.find('.version-history-list b').exists()).toBe(false)
      expect(dialog.findAll('.version-history-description')[1]!.text()).toContain(
        '<b>Plain text</b>',
      )
      const save = dialog.get('.version-history-save')
      expect(save.attributes('disabled')).toBeDefined()
      await dialog.get('input[name="VersionNumber"]').setValue('1.2.0')
      expect(save.attributes('disabled')).toBeDefined()
      await dialog.get('textarea').setValue('   ')
      expect(save.attributes('disabled')).toBeDefined()
      await dialog.get('textarea').setValue('Changes')
      expect(save.attributes('disabled')).toBeUndefined()
      await dialog.get('.item-dialog-cancel').trigger('click')
      await vi.waitFor(() => expect(dialog.attributes('data-state')).toBe('closed'))
      expect(request).toHaveBeenCalledTimes(2)
      expect(request).toHaveBeenLastCalledWith('/api/version-history', {
        signal: expect.anything(),
      })
    },
  )

  it('saves trimmed fields, updates the displayed version immediately and retains the history on reopen', async () => {
    let history = [latest, first]
    const saved = {
      ...latest,
      id: 3,
      versionNumber: '1.2.0',
      description: 'New release\nSecond line',
    }
    const request = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        history = [saved, ...history]
        return json(saved, 201)
      }
      return json(history)
    })
    vi.stubGlobal('fetch', request)
    const app = await setup()
    const dialog = await openDialog()
    await dialog.get('input').setValue(' 1.2.0 ')
    await dialog.get('textarea').setValue(' New release\nSecond line ')
    await dialog.get('form').trigger('submit')
    await vi.waitFor(() =>
      expect(useSnackbar().notice.value?.messageKey).toBe('versionHistory.saved'),
    )
    expect(app.get('.version-history-link').text()).toBe('1.2.0')
    expect(request).toHaveBeenLastCalledWith('/api/version-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionNumber: '1.2.0', description: 'New release\nSecond line' }),
    })
    await vi.waitFor(() =>
      expect(app.get('.version-history-link').attributes('disabled')).toBeUndefined(),
    )
    const reopened = await openDialog()
    expect(
      reopened.findAll('.version-history-entry-heading h4').map((entry) => entry.text()),
    ).toEqual(['1.2.0', '1.1.0', '1.0.0'])
    expect((reopened.get('input').element as HTMLInputElement).value).toBe('')
    expect((reopened.get('textarea').element as HTMLTextAreaElement).value).toBe('')
  })

  it('retains the form and current version on duplicate or failed saves', async () => {
    const request = vi.fn(async (_url: string, options?: RequestInit) =>
      options?.method === 'POST' ? json({ code: 'version_exists' }, 409) : json([latest, first]),
    )
    vi.stubGlobal('fetch', request)
    const app = await setup()
    const dialog = await openDialog()
    await dialog.get('input').setValue('1.1.0')
    await dialog.get('textarea').setValue('Keep this draft')
    await dialog.get('form').trigger('submit')
    await vi.waitFor(() =>
      expect(dialog.get('.item-form-error').text()).toBe(fi.versionHistory.duplicate),
    )
    expect(dialog.attributes('data-state')).toBe('open')
    expect(app.get('.version-history-link').text()).toBe('1.1.0')
    expect((dialog.get('textarea').element as HTMLTextAreaElement).value).toBe('Keep this draft')
    request.mockImplementation(async () => {
      throw new Error('Offline')
    })
    await dialog.get('form').trigger('submit')
    await vi.waitFor(() =>
      expect(dialog.get('.item-form-error').text()).toBe(fi.versionHistory.saveError),
    )
    expect((dialog.get('textarea').element as HTMLTextAreaElement).value).toBe('Keep this draft')
  })

  it('shows an empty fallback and lets users retry a failed history load', async () => {
    const request = vi.fn(async () => json({}, 503))
    vi.stubGlobal('fetch', request)
    const app = await setup('en')
    expect(app.get('.version-history-link').text()).toBe(en.versionHistory.title)
    const dialog = await openDialog()
    expect(dialog.get('[role="alert"]').text()).toBe(en.versionHistory.loadError)
    request.mockImplementation(async () => json([latest, first]))
    await dialog.get('.version-history-section button').trigger('click')
    await flushPromises()
    expect(dialog.find('[role="alert"]').exists()).toBe(false)
    expect(app.get('.version-history-link').text()).toBe('1.1.0')
  })
})

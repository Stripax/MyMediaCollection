import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import SideBar from '../SideBar.vue'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'

function mountSideBar(locale = 'fi') {
  return mount(SideBar, {
    attachTo: document.body,
    global: {
      plugins: [createI18n({ legacy: false, locale, messages: { en, fi } })],
    },
  })
}

describe('SideBar', () => {
  it('hides the categories and keeps a button available to reopen them', async () => {
    const sidebar = mountSideBar()
    const toggle = sidebar.get('.side-bar-toggle')
    expect(sidebar.get('nav').isVisible()).toBe(true)
    expect(sidebar.findAll('.side-bar-category')).toHaveLength(5)

    await toggle.trigger('click')
    expect(sidebar.get('nav').isVisible()).toBe(false)
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-label')).toBe(fi.sidebar.show)
    expect(toggle.isVisible()).toBe(true)

    await toggle.trigger('click')
    expect(sidebar.get('nav').isVisible()).toBe(true)
    expect(toggle.attributes('aria-expanded')).toBe('true')
    sidebar.unmount()
  })

  it('selects one category and preserves the selection while hidden', async () => {
    const sidebar = mountSideBar('en')
    const categories = sidebar.findAll('.side-bar-category')
    expect(categories[0]!.attributes('aria-pressed')).toBe('true')
    expect(categories[1]!.text()).toBe(en.sidebar.movies)

    await categories[1]!.trigger('click')
    expect(sidebar.emitted('update:modelValue')?.[0]).toEqual(['movies'])
    expect(categories[1]!.attributes('aria-pressed')).toBe('true')
    expect(categories[0]!.attributes('aria-pressed')).toBe('false')
    await sidebar.get('.side-bar-toggle').trigger('click')
    await sidebar.get('.side-bar-toggle').trigger('click')
    expect(categories[1]!.attributes('aria-pressed')).toBe('true')
    sidebar.unmount()
  })
})

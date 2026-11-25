import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import SideBar from '../SideBar.vue'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'

const mounted: VueWrapper[] = []
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
})

function mountSideBar(locale = 'fi') {
  const wrapper = mount(SideBar, {
    attachTo: document.body,
    global: {
      plugins: [createI18n({ legacy: false, locale, messages: { en, fi } })],
    },
  })
  mounted.push(wrapper)
  return wrapper
}

describe('SideBar', () => {
  it('shows hover-only tooltips for the current sidebar state', async () => {
    const sidebar = mountSideBar()
    const tooltip = sidebar.get('.side-bar-toggle-tooltip')
    const toggle = sidebar.get('.side-bar-toggle')
    expect(sidebar.find('[role="tooltip"]').exists()).toBe(false)
    expect(toggle.attributes('title')).toBeUndefined()
    await tooltip.trigger('mouseenter')
    expect(sidebar.get('[role="tooltip"]').text()).toBe(fi.sidebar.show)
    expect(toggle.attributes('aria-describedby')).toBe(
      sidebar.get('[role="tooltip"]').attributes('id'),
    )
    await tooltip.trigger('mouseleave')
    await toggle.trigger('focus')
    expect(sidebar.find('[role="tooltip"]').exists()).toBe(false)
    await toggle.trigger('click')
    await tooltip.trigger('mouseenter')
    expect(sidebar.get('[role="tooltip"]').text()).toBe(fi.sidebar.hide)
    await tooltip.trigger('mouseleave')
    expect(sidebar.find('[role="tooltip"]').exists()).toBe(false)
  })
  it('hides the categories and keeps a button available to reopen them', async () => {
    const sidebar = mountSideBar()
    const toggle = sidebar.get('.side-bar-toggle')
    expect(sidebar.get('nav').isVisible()).toBe(false)
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(sidebar.get('nav').attributes('inert')).toBeDefined()
    expect(sidebar.findAll('.side-bar-category')).toHaveLength(5)

    await toggle.trigger('click')
    expect(sidebar.get('nav').isVisible()).toBe(true)
    await toggle.trigger('click')
    expect(sidebar.get('nav').isVisible()).toBe(false)
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-label')).toBe(fi.sidebar.show)
    expect(toggle.isVisible()).toBe(true)

    await toggle.trigger('click')
    expect(sidebar.get('nav').isVisible()).toBe(true)
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })

  it('selects one category and preserves the selection while hidden', async () => {
    const sidebar = mountSideBar('en')
    const categories = sidebar.findAll('.side-bar-category')
    expect(categories[0]!.attributes('aria-pressed')).toBe('true')
    expect(categories[1]!.text()).toBe(en.sidebar.movies)
    await sidebar.get('.side-bar-toggle').trigger('click')
    await categories[1]!.trigger('click')
    expect(sidebar.emitted('update:modelValue')?.[0]).toEqual(['movies'])
    expect(categories[1]!.attributes('aria-pressed')).toBe('true')
    expect(categories[0]!.attributes('aria-pressed')).toBe('false')
    expect(sidebar.get('nav').isVisible()).toBe(false)
    expect(sidebar.get('.side-bar-toggle').attributes('aria-expanded')).toBe('false')
    await sidebar.get('.side-bar-toggle').trigger('click')
    await sidebar.get('.side-bar-toggle').trigger('click')
    expect(categories[1]!.attributes('aria-pressed')).toBe('true')
  })

  it('closes on outside pointer or keyboard clicks without taking focus from the target', async () => {
    const sidebar = mountSideBar()
    const toggle = sidebar.get('.side-bar-toggle')
    const outside = document.createElement('button')
    document.body.append(outside)
    await toggle.trigger('click')
    await sidebar.get('.side-bar-title').trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    outside.focus()
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(outside)
    await toggle.trigger('click')
    outside.focus()
    outside.click()
    await nextTick()
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(outside)
  })

  it('closes with Escape and returns focus to the opening arrow', async () => {
    const sidebar = mountSideBar()
    const toggle = sidebar.get('.side-bar-toggle')
    await toggle.trigger('click')
    await sidebar.get('.side-bar-category').trigger('keydown', { key: 'Escape' })
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggle.element)
  })
})

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import MockIdentitySwitcher from '@/mock/MockIdentitySwitcher.vue'

vi.mock('@/mock/env', () => ({
  mockEnabled: () => true,
  mockSwitcherEnabled: () => true,
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('mock 身份浮标', () => {
  it('拖动后写入位置，并且不会误触展开面板', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(800)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600)
    const wrapper = mount(MockIdentitySwitcher, { attachTo: document.body })
    const root = wrapper.get('.mock-switch')
    vi.spyOn(root.element, 'getBoundingClientRect').mockReturnValue({
      x: 12,
      y: 12,
      left: 12,
      top: 12,
      right: 112,
      bottom: 42,
      width: 100,
      height: 30,
      toJSON: () => ({}),
    })

    const fab = wrapper.get('.mock-switch__fab')
    const pointer = (type: string, clientX: number, clientY: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX, clientY })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      fab.element.dispatchEvent(event)
    }
    pointer('pointerdown', 20, 20)
    pointer('pointermove', 220, 180)
    pointer('pointerup', 220, 180)
    fab.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(root.attributes('style')).toContain('left: 212px')
    expect(root.attributes('style')).toContain('top: 172px')
    expect(wrapper.find('.mock-switch__panel').exists()).toBe(false)

    await fab.trigger('click')
    expect(wrapper.find('.mock-switch__panel').exists()).toBe(true)
    wrapper.unmount()
  })
})

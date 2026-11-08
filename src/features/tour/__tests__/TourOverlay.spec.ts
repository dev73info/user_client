import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import TourOverlay from '../TourOverlay.vue'
import { useTour } from '../useTour'

/** 引导浮层：渲染、按钮、键盘与「未激活不渲染」。音频与系统语音都换成替身。 */
class FakeAudio {
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  src = ''

  constructor(src: string) {
    this.src = src
  }

  play() {
    return Promise.resolve()
  }

  pause() {
    /* 空实现 */
  }

  removeAttribute() {
    /* 空实现 */
  }

  load() {
    /* 空实现 */
  }
}

const tour = useTour()
let wrapper: ReturnType<typeof mount> | null = null

beforeEach(() => {
  vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio)
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] },
  })
  tour.dismiss()
  window.localStorage.clear()
  tour.setVoice(true)
  tour.state.index = 0
})

afterEach(() => {
  tour.dismiss()
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function mountOverlay() {
  wrapper = mount(TourOverlay, {
    global: { stubs: { teleport: true } },
  })
  return wrapper
}

describe('TourOverlay', () => {
  it('未激活时不渲染任何浮层', () => {
    const view = mountOverlay()
    expect(view.find('.tour').exists()).toBe(false)
  })

  it('渲染当前步骤的标题、正文、进度与圆点', async () => {
    const view = mountOverlay()
    tour.start('basic')
    await nextTick()

    expect(view.find('.tour__title').text()).toBe('欢迎来到工作台')
    expect(view.find('.tour__body').text()).toContain('需求方工作台')
    expect(view.find('.tour__progress').text()).toContain('第 1 / 9 步')
    expect(view.findAll('.tour__dot')).toHaveLength(9)
    expect(view.find('.tour__nav-btn--primary').text()).toBe('下一步')
    expect(view.findAll('.tour__nav-btn')).toHaveLength(1)
    expect(view.find('[role="dialog"]').attributes('aria-modal')).toBe('true')
  })

  it('下一步 / 上一步在步骤间切换，第一步没有上一步', async () => {
    const view = mountOverlay()
    tour.start('basic')
    await nextTick()

    const prevButtons = () => view.findAll('button').filter((item) => item.text() === '上一步')
    expect(prevButtons()).toHaveLength(0)

    await view.find('.tour__nav-btn--primary').trigger('click')
    expect(tour.state.index).toBe(1)
    expect(view.find('.tour__title').text()).toBe('左侧图标栏')
    expect(prevButtons()).toHaveLength(1)

    await prevButtons()[0]!.trigger('click')
    expect(tour.state.index).toBe(0)
    expect(view.find('.tour__title').text()).toBe('欢迎来到工作台')
  })

  it('最后一步显示完成，点击后关闭并记录已看过', async () => {
    const view = mountOverlay()
    tour.start('basic')
    tour.state.index = tour.totalSteps.value - 1
    await nextTick()

    const primary = view.find('.tour__nav-btn--primary')
    expect(primary.text()).toBe('完成')
    await primary.trigger('click')

    expect(tour.state.active).toBeNull()
    expect(window.localStorage.getItem('73info:tour:seen:basic')).toBe('1')
    expect(view.find('.tour').exists()).toBe(false)
  })

  it('方向键切换步骤，Esc 关闭', async () => {
    const view = mountOverlay()
    tour.start('basic')
    await nextTick()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await nextTick()
    expect(tour.state.index).toBe(1)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await nextTick()
    expect(tour.state.index).toBe(0)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(tour.state.active).toBeNull()
    expect(view.find('.tour').exists()).toBe(false)
  })

  it('语音开关与跳过按钮可用', async () => {
    const view = mountOverlay()
    tour.start('basic')
    await nextTick()

    const findVoice = () => view.findAll('button').find((item) => item.text().startsWith('语音'))
    expect(findVoice()).toBeTruthy()
    expect(findVoice()!.attributes('aria-pressed')).toBe('true')
    await findVoice()!.trigger('click')
    expect(window.localStorage.getItem('73info:tour:voice')).toBe('off')
    expect(findVoice()!.text()).toBe('语音：关')
    expect(findVoice()!.attributes('aria-pressed')).toBe('false')

    const skipButton = view.findAll('button').find((item) => item.text() === '跳过')
    await skipButton!.trigger('click')
    expect(tour.state.active).toBeNull()
  })
})

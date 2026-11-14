/**
 * ALTCHA 挂件组件：statechange 状态机与 reset 重建。
 *
 * 动态 `import('altcha')` 走 mock：这里只关心「挂件被创建、事件被正确翻译成 payload」，
 * 真正的 PoW 与挑战请求在浏览器里发生，不在单测里跑。
 */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CaptchaWidget from '@/components/CaptchaWidget.vue'
import { __resetAltchaLoaderForTests } from '@/shared/captcha'

vi.mock('altcha', () => ({}))
vi.mock('altcha/i18n/zh-cn', () => ({}))

let wrapper: ReturnType<typeof mount> | undefined

function mountWidget() {
  wrapper = mount(CaptchaWidget)
  return wrapper
}

function dispatchState(widget: Element, state: string, payload?: string) {
  widget.dispatchEvent(new CustomEvent('statechange', { detail: { state, payload } }))
}

/** statechange 是 CustomEvent，jsdom 下可以直接派发。 */
async function findWidget() {
  await vi.waitFor(() => {
    expect(wrapper?.find('altcha-widget').exists()).toBe(true)
  })
  return wrapper!.find('altcha-widget').element
}

describe('CaptchaWidget', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_CAPTCHA_ENABLED', 'true')
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    __resetAltchaLoaderForTests()
    vi.unstubAllEnvs()
    document.body.innerHTML = ''
  })

  it('挂载后按约定属性创建 altcha-widget', async () => {
    mountWidget()
    const widget = await findWidget()

    expect(widget.getAttribute('challenge')).toBe('/api/captcha/challenge')
    expect(widget.getAttribute('name')).toBe('altcha')
    expect(widget.getAttribute('display')).toBe('standard')
    expect(widget.getAttribute('auto')).toBe('onload')
    expect(widget.getAttribute('language')).toBe('zh-cn')
    expect(JSON.parse(widget.getAttribute('configuration') ?? '{}')).toEqual({
      hideLogo: true,
      hideFooter: true,
    })
  })

  it('verified 时把 payload 抛给调用方', async () => {
    mountWidget()
    const widget = await findWidget()

    dispatchState(widget, 'verified', 'payload-abc')

    expect(wrapper!.emitted('update:token')).toEqual([['payload-abc']])
  })

  it('expired / error 时清空 payload', async () => {
    mountWidget()
    const widget = await findWidget()

    dispatchState(widget, 'verified', 'payload-abc')
    dispatchState(widget, 'expired')
    dispatchState(widget, 'error')

    expect(wrapper!.emitted('update:token')).toEqual([['payload-abc'], [''], ['']])
  })

  it('reset 会先清空 payload，再移除旧挂件并重建一个新的', async () => {
    mountWidget()
    const first = await findWidget()

    ;(wrapper!.vm as unknown as { reset: () => void }).reset()

    expect(wrapper!.emitted('update:token')).toEqual([['']])
    await vi.waitFor(() => {
      expect(first.isConnected).toBe(false)
      expect(wrapper!.find('altcha-widget').exists()).toBe(true)
    })
    expect(wrapper!.find('altcha-widget').element).not.toBe(first)
  })

  it('开关关闭时不渲染、也不创建挂件', () => {
    vi.stubEnv('VITE_CAPTCHA_ENABLED', 'false')
    mountWidget()

    expect(wrapper!.find('.captcha-field').exists()).toBe(false)
    expect(wrapper!.find('altcha-widget').exists()).toBe(false)
  })
})

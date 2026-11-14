/**
 * 离屏取 ALTCHA payload（`fetchCaptchaPayload`）。
 *
 * 钉住的口径：开发模式自动登录打的是 `/auth/login`，后端开着人机校验时一律要 payload，
 * 所以必须在登录前自己离屏取一枚；取不到时**退回空串**而不是抛错打断启动。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetAltchaLoaderForTests, fetchCaptchaPayload } from '@/shared/captcha'

vi.mock('altcha', () => ({}))
vi.mock('altcha/i18n/zh-cn', () => ({}))

function dispatchState(widget: Element, state: string, payload?: string) {
  widget.dispatchEvent(new CustomEvent('statechange', { detail: { state, payload } }))
}

describe('fetchCaptchaPayload', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_CAPTCHA_ENABLED', 'true')
  })

  afterEach(() => {
    __resetAltchaLoaderForTests()
    vi.unstubAllEnvs()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('拿到 payload 后交回，并把离屏挂件与容器一并销毁', async () => {
    const pending = fetchCaptchaPayload()

    await vi.waitFor(() => {
      expect(document.querySelector('altcha-widget')).toBeTruthy()
    })
    const widget = document.querySelector('altcha-widget')!
    expect(widget.getAttribute('challenge')).toBe('/api/captcha/challenge')
    expect(widget.getAttribute('auto')).toBe('onload')

    dispatchState(widget, 'verified', 'payload-xyz')

    await expect(pending).resolves.toBe('payload-xyz')
    expect(document.querySelector('altcha-widget')).toBeNull()
    expect(document.body.children).toHaveLength(0)
  })

  it('挂件报错时退回空串，不抛错打断自动登录', async () => {
    const pending = fetchCaptchaPayload()

    await vi.waitFor(() => {
      expect(document.querySelector('altcha-widget')).toBeTruthy()
    })
    dispatchState(document.querySelector('altcha-widget')!, 'error')

    await expect(pending).resolves.toBe('')
  })

  it('超时未算出时退回空串', async () => {
    vi.useFakeTimers()
    const pending = fetchCaptchaPayload()

    // 先把动态 import 的微任务跑完，挂件与超时定时器才会建立。
    for (let i = 0; i < 5; i += 1) {
      await vi.advanceTimersByTimeAsync(0)
    }
    expect(document.querySelector('altcha-widget')).toBeTruthy()
    await vi.advanceTimersByTimeAsync(15_000)

    await expect(pending).resolves.toBe('')
  })

  it('开关关闭时直接返回空串，不创建挂件', async () => {
    vi.stubEnv('VITE_CAPTCHA_ENABLED', 'false')

    await expect(fetchCaptchaPayload()).resolves.toBe('')
    expect(document.querySelector('altcha-widget')).toBeNull()
  })
})

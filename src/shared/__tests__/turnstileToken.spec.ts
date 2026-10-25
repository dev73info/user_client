/**
 * 离屏取 Turnstile token（`fetchTurnstileToken`）。
 *
 * 这里钉住的是「开发模式自动登录被 403 missing_token 打死」那次故障的修复口径：
 * 自动登录打的是 `/auth/login`，后端开着 `[turnstile] enabled` 时一律要 token，
 * 所以必须在登录前自己离屏取一枚，且取不到时**退回空串**而不是抛错。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetTurnstileLoaderForTests,
  fetchTurnstileToken,
  type TurnstileApi,
} from '@/shared/turnstile'

/** 一份可编程的假 `window.turnstile`：记录 render / remove 的调用。 */
function stubTurnstileApi(overrides: Partial<TurnstileApi> = {}) {
  const rendered: { container: HTMLElement | string; options: Record<string, unknown> }[] = []
  const removed: string[] = []
  let nextId = 1

  const api: TurnstileApi = {
    render: (container, options) => {
      rendered.push({ container, options: options as unknown as Record<string, unknown> })
      return `widget-${nextId++}`
    },
    reset: () => {},
    remove: (widgetId) => {
      if (widgetId) removed.push(widgetId)
    },
    getResponse: () => undefined,
    ...overrides,
  }

  window.turnstile = api
  return { api, rendered, removed }
}

describe('fetchTurnstileToken', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '0x4AAAAAAFTIBX0wloPM7Qm4')
  })

  afterEach(() => {
    delete window.turnstile
    __resetTurnstileLoaderForTests()
    vi.unstubAllEnvs()
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('拿到 token 后把它交回，并把离屏挂件与容器一并销毁', async () => {
    const { rendered, removed } = stubTurnstileApi()

    const pending = fetchTurnstileToken('login')
    // 取 token 前要先 `await loadTurnstile()`，渲染落在下一个微任务里。
    await vi.waitFor(() => expect(rendered).toHaveLength(1))

    const options = rendered[0]!.options as {
      action: string
      sitekey: string
      callback: (token: string) => void
    }
    expect(options.action).toBe('login')
    expect(options.sitekey).toBe('0x4AAAAAAFTIBX0wloPM7Qm4')

    options.callback('token-from-cloudflare')

    await expect(pending).resolves.toBe('token-from-cloudflare')
    expect(removed).toEqual(['widget-1'])
    expect(document.body.children).toHaveLength(0)
  })

  it('官方回调报错时退回空串，不抛错打断自动登录', async () => {
    const { rendered } = stubTurnstileApi()

    const pending = fetchTurnstileToken('login')
    await vi.waitFor(() => expect(rendered).toHaveLength(1))
    const options = rendered[0]!.options as { 'error-callback': () => void }
    options['error-callback']()

    await expect(pending).resolves.toBe('')
  })

  it('超时未回调时退回空串', async () => {
    vi.useFakeTimers()
    stubTurnstileApi()

    const pending = fetchTurnstileToken('login')
    await vi.advanceTimersByTimeAsync(15_000)

    await expect(pending).resolves.toBe('')
  })

  it('没配 sitekey（挂件未启用）时直接返回空串，不去加载官方脚本', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
    const { rendered } = stubTurnstileApi()

    await expect(fetchTurnstileToken('login')).resolves.toBe('')
    expect(rendered).toHaveLength(0)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetMockEnabled, mockEnabled, resolveMockEnabled } from '@/mock/env'

/**
 * mock 开关的优先级口径。
 *
 * 这里钉住的是一组实测踩过的行为：`.env.local` 写 `VITE_MOCK=true` 时，
 * 「关闭 mock」按钮与 `?mock=0` 都必须关得掉（曾经因为先判环境变量直接 return 而关不掉）。
 */
describe('resolveMockEnabled 的优先级', () => {
  it('不允许 mock 的构建永远是关的，哪怕地址和会话都说要开', () => {
    expect(
      resolveMockEnabled({ supported: false, urlParam: '1', override: true, envFlag: true }),
    ).toBe(false)
  })

  it('地址参数压过会话覆盖与环境变量', () => {
    expect(
      resolveMockEnabled({ supported: true, urlParam: '1', override: false, envFlag: false }),
    ).toBe(true)
    expect(
      resolveMockEnabled({ supported: true, urlParam: 'true', override: false, envFlag: false }),
    ).toBe(true)
    expect(
      resolveMockEnabled({ supported: true, urlParam: '0', override: true, envFlag: true }),
    ).toBe(false)
    expect(
      resolveMockEnabled({ supported: true, urlParam: 'false', override: true, envFlag: true }),
    ).toBe(false)
  })

  it('会话覆盖压过环境变量：因此「关闭 mock」能关掉 VITE_MOCK=true 开起来的 mock', () => {
    expect(
      resolveMockEnabled({ supported: true, urlParam: '', override: false, envFlag: true }),
    ).toBe(false)
    expect(
      resolveMockEnabled({ supported: true, urlParam: '', override: true, envFlag: false }),
    ).toBe(true)
  })

  it('环境变量是兜底默认值', () => {
    expect(
      resolveMockEnabled({ supported: true, urlParam: '', override: null, envFlag: true }),
    ).toBe(true)
    expect(
      resolveMockEnabled({ supported: true, urlParam: '', override: null, envFlag: false }),
    ).toBe(false)
  })

  it('认不出来的地址参数按「没表态」处理，不误关', () => {
    expect(
      resolveMockEnabled({ supported: true, urlParam: 'yes', override: null, envFlag: true }),
    ).toBe(true)
    expect(
      resolveMockEnabled({ supported: true, urlParam: 'yes', override: false, envFlag: true }),
    ).toBe(false)
  })
})

describe('mockEnabled 读取地址与会话标记', () => {
  beforeEach(() => {
    vi.stubEnv('MODE', 'development')
    sessionStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    sessionStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('?mock=1 会记进 sessionStorage，地址参数消失后仍然开着', () => {
    window.history.replaceState({}, '', '/?mock=1')
    expect(mockEnabled()).toBe(true)

    window.history.replaceState({}, '', '/')
    expect(mockEnabled()).toBe(true)
  })

  it('?mock=0 当场关掉，并压过 VITE_MOCK=true', () => {
    vi.stubEnv('VITE_MOCK', 'true')
    expect(mockEnabled()).toBe(true)

    window.history.replaceState({}, '', '/?mock=0')
    expect(mockEnabled()).toBe(false)
  })

  it('forgetMockEnabled（面板上的「关闭 mock」）压过 VITE_MOCK=true', () => {
    vi.stubEnv('VITE_MOCK', 'true')
    expect(mockEnabled()).toBe(true)

    forgetMockEnabled()
    expect(mockEnabled()).toBe(false)
  })

  it('非 dev 构建下 address 参数不生效，也不会写会话标记', () => {
    vi.stubEnv('MODE', 'test')
    window.history.replaceState({}, '', '/?mock=1')

    expect(mockEnabled()).toBe(false)
    expect(sessionStorage.getItem('mock_enabled_73hub')).toBeNull()
  })
})

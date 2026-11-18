import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { useAccountProviderBinding } from '@/composables/useAccountProviderBinding'

const mocks = vi.hoisted(() => ({
  getBoundProviders: vi.fn(),
  getProviderBindUrl: vi.fn(),
  getProviderUnbindUrl: vi.fn(),
  getWechatBindQrUrl: vi.fn(),
  getWechatUnbindQrUrl: vi.fn(),
  getQqUnbindQrUrl: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))

const auth = reactive({ token: 'test-token', isAuthed: true })
const route = reactive({ query: {} as Record<string, string> })

vi.mock('@/api/auth', () => ({
  getBoundProviders: mocks.getBoundProviders,
  getProviderBindUrl: mocks.getProviderBindUrl,
  getProviderUnbindUrl: mocks.getProviderUnbindUrl,
  getWechatBindQrUrl: mocks.getWechatBindQrUrl,
  getWechatUnbindQrUrl: mocks.getWechatUnbindQrUrl,
  getQqUnbindQrUrl: mocks.getQqUnbindQrUrl,
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('ui_73info', () => ({
  TMessage: {
    success: mocks.success,
    error: mocks.error,
    info: mocks.info,
    warning: vi.fn(),
  },
}))

const originalLocation = window.location
const assign = vi.fn()

function stubLocation() {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      href: 'https://73info.cn/workbench/account',
      assign,
    },
  })
}

describe('账户第三方绑定', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubLocation()
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 Desktop',
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('读取失败保留明确错误，不伪装成未绑定', async () => {
    mocks.getBoundProviders.mockRejectedValue(new Error('Forbidden'))
    const result = useAccountProviderBinding()

    await result.loadBoundProviders()

    expect(result.loadError.value).toBe('加载第三方绑定状态失败')
    expect(result.boundProviders.value).toEqual([])
  })

  it('PC 端发起微信绑定时保留 state 与轮询凭据', async () => {
    mocks.getBoundProviders.mockResolvedValue({ providers: [] })
    mocks.getWechatBindQrUrl.mockResolvedValue({
      url: 'https://open.weixin.qq.com/connect/qrconnect',
      state: 'state-1',
      poll_secret: 'poll-secret',
    })
    const result = useAccountProviderBinding()
    await result.loadBoundProviders()

    await result.toggleWechatBinding()

    expect(mocks.getWechatBindQrUrl).toHaveBeenCalledWith(
      'test-token',
      'https://73info.cn/workbench/account',
    )
    expect(result.providerQr).toMatchObject({
      visible: true,
      provider: 'wechat',
      mode: 'bind',
      state: 'state-1',
      pollSecret: 'poll-secret',
    })
  })

  it('已绑定微信走扫码解绑，不再直接调解绑接口', async () => {
    mocks.getBoundProviders.mockResolvedValue({ providers: ['wechat', 'github'] })
    mocks.getWechatUnbindQrUrl.mockResolvedValue({
      url: 'https://open.weixin.qq.com/connect/qrconnect',
      state: 'unbind-state',
      poll_secret: 'unbind-secret',
    })
    const result = useAccountProviderBinding()
    await result.loadBoundProviders()

    await result.toggleWechatBinding()

    expect(mocks.getWechatUnbindQrUrl).toHaveBeenCalledWith(
      'test-token',
      'https://73info.cn/workbench/account',
    )
    expect(mocks.getWechatBindQrUrl).not.toHaveBeenCalled()
    expect(result.providerQr).toMatchObject({
      visible: true,
      provider: 'wechat',
      mode: 'unbind',
      state: 'unbind-state',
    })
  })

  it('已绑定 GitHub 先取平台解绑授权地址再整页跳转', async () => {
    mocks.getBoundProviders.mockResolvedValue({ providers: ['github'] })
    mocks.getProviderUnbindUrl.mockResolvedValue({
      url: 'https://github.com/login/oauth/authorize',
    })
    const result = useAccountProviderBinding()
    await result.loadBoundProviders()

    await result.handleProviderBinding('github')

    expect(mocks.getProviderUnbindUrl).toHaveBeenCalledWith(
      'test-token',
      'github',
      'https://73info.cn/workbench/account',
    )
    expect(assign).toHaveBeenCalledWith('https://github.com/login/oauth/authorize')
  })

  it('已绑定 QQ 走扫码解绑', async () => {
    mocks.getBoundProviders.mockResolvedValue({ providers: ['qq'] })
    mocks.getQqUnbindQrUrl.mockResolvedValue({
      url: 'https://graph.qq.com/oauth2.0/authorize',
      state: 'qq-state',
      poll_secret: 'qq-secret',
    })
    const result = useAccountProviderBinding()
    await result.loadBoundProviders()

    await result.handleProviderBinding('qq')

    expect(mocks.getQqUnbindQrUrl).toHaveBeenCalledWith(
      'test-token',
      'https://73info.cn/workbench/account',
    )
    expect(result.providerQr).toMatchObject({ visible: true, provider: 'qq', mode: 'unbind' })
  })
})

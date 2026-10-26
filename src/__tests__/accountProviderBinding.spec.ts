import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { useAccountProviderBinding } from '@/composables/useAccountProviderBinding'

const mocks = vi.hoisted(() => ({
  getBoundProviders: vi.fn(),
  getProviderBindUrl: vi.fn(),
  getWechatBindQrUrl: vi.fn(),
  unbindProvider: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))

const auth = reactive({ token: 'test-token', isAuthed: true })
const route = reactive({ query: {} as Record<string, string> })

vi.mock('@/api/auth', () => ({
  getBoundProviders: mocks.getBoundProviders,
  getProviderBindUrl: mocks.getProviderBindUrl,
  getWechatBindQrUrl: mocks.getWechatBindQrUrl,
  unbindProvider: mocks.unbindProvider,
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

describe('账户第三方绑定', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 Desktop',
      configurable: true,
    })
  })

  it('读取失败保留明确错误，不伪装成未绑定', async () => {
    mocks.getBoundProviders.mockRejectedValue(new Error('Forbidden'))
    const result = useAccountProviderBinding()

    await result.loadBoundProviders()

    expect(result.loadError.value).toBe('加载第三方绑定状态失败')
    expect(result.boundProviders.value).toEqual([])
  })

  it('PC 端发起微信绑定时保留 state 与轮询凭据', async () => {
    mocks.getWechatBindQrUrl.mockResolvedValue({
      url: 'https://open.weixin.qq.com/connect/qrconnect',
      state: 'state-1',
      poll_secret: 'poll-secret',
    })
    const result = useAccountProviderBinding()

    await result.toggleWechatBinding()

    expect(mocks.getWechatBindQrUrl).toHaveBeenCalledWith(
      'test-token',
      expect.stringContaining('http'),
    )
    expect(result.wechatBindQr).toMatchObject({
      visible: true,
      state: 'state-1',
      pollSecret: 'poll-secret',
    })
  })

  it('已绑定微信可以解绑并移除本地状态', async () => {
    mocks.getBoundProviders.mockResolvedValue({ providers: ['wechat', 'github'] })
    mocks.unbindProvider.mockResolvedValue(undefined)
    const result = useAccountProviderBinding()
    await result.loadBoundProviders()

    await result.toggleWechatBinding()

    expect(mocks.unbindProvider).toHaveBeenCalledWith('test-token', 'wechat')
    expect(result.wechatBound.value).toBe(false)
    expect(result.boundProviders.value).toEqual(['github'])
    expect(mocks.success).toHaveBeenCalledWith('微信已解除绑定')
  })
})

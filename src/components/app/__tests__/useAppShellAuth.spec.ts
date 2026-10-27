import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppShellAuth } from '@/components/app/useAppShellAuth'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  initializeSession: vi.fn(),
  hydrate: vi.fn(),
  logout: vi.fn(),
  fetchToken: vi.fn(),
  enabled: vi.fn(),
  siteKey: vi.fn(),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    token: '',
    username: '',
    login: mocks.login,
    initializeSession: mocks.initializeSession,
    hydrate: mocks.hydrate,
    logout: mocks.logout,
  }),
}))

vi.mock('@/shared/turnstile', () => ({
  fetchTurnstileToken: mocks.fetchToken,
  isTurnstileEnabled: mocks.enabled,
  getTurnstileSiteKey: mocks.siteKey,
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/', path: '/', matched: [], name: 'home', query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('ui_73info', () => ({
  TMessage: { warning: vi.fn() },
}))

let wrapper: ReturnType<typeof mount> | undefined

function mountAuth() {
  wrapper = mount(
    defineComponent({
      setup() {
        useAppShellAuth()
        return () => null
      },
    }),
  )
}

describe('useAppShellAuth 开发模式自动登录', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_DEV_AUTO_LOGIN_USERNAME', 'dev_flow_test')
    vi.stubEnv('VITE_DEV_AUTO_LOGIN_PASSWORD', 'Test@123456')
    mocks.enabled.mockReturnValue(true)
    mocks.siteKey.mockReturnValue('1x0000000000000000000000000000000AA')
    mocks.fetchToken.mockResolvedValue('token-from-cloudflare')
    mocks.login.mockResolvedValue({ requires_two_factor: false })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.unstubAllEnvs()
  })

  it('官方测试密钥直接使用测试 token，不依赖挂件域名', async () => {
    mountAuth()

    await vi.waitFor(() => {
      expect(mocks.login).toHaveBeenCalledWith('dev_flow_test', 'Test@123456', undefined, 'test')
    })
    expect(mocks.fetchToken).not.toHaveBeenCalled()
  })

  it('正式站点密钥仍从 Cloudflare 获取真实 token', async () => {
    mocks.siteKey.mockReturnValue('site-key-for-real-tenant')
    mountAuth()

    await vi.waitFor(() => {
      expect(mocks.login).toHaveBeenCalledWith(
        'dev_flow_test',
        'Test@123456',
        undefined,
        'token-from-cloudflare',
      )
    })
    expect(mocks.fetchToken).toHaveBeenCalledWith('login')
  })
})

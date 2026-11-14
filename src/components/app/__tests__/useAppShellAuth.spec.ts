import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppShellAuth } from '@/components/app/useAppShellAuth'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  initializeSession: vi.fn(),
  hydrate: vi.fn(),
  logout: vi.fn(),
  fetchPayload: vi.fn(),
  enabled: vi.fn(),
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

vi.mock('@/shared/captcha', () => ({
  fetchCaptchaPayload: mocks.fetchPayload,
  isCaptchaEnabled: mocks.enabled,
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
    mocks.fetchPayload.mockResolvedValue('payload-from-altcha')
    mocks.login.mockResolvedValue({ requiresTwoFactor: false })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.unstubAllEnvs()
  })

  it('人机校验开启时先离屏取 ALTCHA payload，再随登录提交', async () => {
    mountAuth()

    await vi.waitFor(() => {
      expect(mocks.login).toHaveBeenCalledWith(
        'dev_flow_test',
        'Test@123456',
        undefined,
        'payload-from-altcha',
      )
    })
    expect(mocks.fetchPayload).toHaveBeenCalledTimes(1)
  })

  it('人机校验关闭时不加载挂件，也不带 payload', async () => {
    mocks.enabled.mockReturnValue(false)
    mountAuth()

    await vi.waitFor(() => {
      expect(mocks.login).toHaveBeenCalledWith('dev_flow_test', 'Test@123456', undefined, undefined)
    })
    expect(mocks.fetchPayload).not.toHaveBeenCalled()
  })
})

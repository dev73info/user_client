import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { useAuthForm } from '@/composables/useAuthForm'

const mocks = vi.hoisted(() => ({
  auth: { loading: false, setToken: vi.fn(), fetchProfile: vi.fn().mockResolvedValue(undefined) },
  router: { resolve: vi.fn(() => ({ href: '/' })), replace: vi.fn().mockResolvedValue(undefined) },
  showToast: vi.fn(),
  getUrl: vi.fn(),
  getStatus: vi.fn(),
}))

vi.mock('@/stores/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('vue-router', () => ({ useRouter: () => mocks.router }))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const toast =
    (type: 'success' | 'error' | 'warning' | 'info') =>
    (message: string): void =>
      mocks.showToast(message, type)
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: toast('success'),
      error: toast('error'),
      warning: toast('warning'),
      info: toast('info'),
    },
  }
})
vi.mock('@/api/auth', () => ({
  getOauthStatus: vi.fn().mockResolvedValue({ qq: true }),
  getQqLoginQrUrl: mocks.getUrl,
  getQqLoginQrStatus: mocks.getStatus,
  getGiteeAuthorizeUrl: vi.fn(),
  getGithubAuthorizeUrl: vi.fn(),
  getWechatLoginQrUrl: vi.fn(),
}))

describe('QQ direct authorization', () => {
  let form: ReturnType<typeof useAuthForm>
  let wrapper: ReturnType<typeof mount>
  const popup = { location: { href: '' }, closed: false, close: vi.fn() }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    popup.location.href = ''
    popup.closed = false
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    mocks.getUrl.mockResolvedValue({ url: 'https://graph.qq.com/oauth2.0/show?state=test', state: 'test' })
    mocks.getStatus.mockResolvedValue({ token: null })
    wrapper = mount(defineComponent({
      setup() {
        form = useAuthForm(ref('login'))
        return () => null
      },
    }))
  })

  afterEach(() => {
    wrapper.unmount()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('opens the authorization window directly from the login action', async () => {
    form.acceptTerms.value = true
    const login = form.loginWithQq()
    expect(window.open).toHaveBeenCalledWith('', 'TencentLogin', expect.any(String))
    await login
    expect(popup.location.href).toBe('https://graph.qq.com/oauth2.0/show?state=test')
    expect(mocks.getUrl).toHaveBeenCalledWith(`${window.location.origin}/`)
  })

  it('requires agreement before opening a window', async () => {
    await form.loginWithQq()
    expect(window.open).not.toHaveBeenCalled()
    expect(mocks.getUrl).not.toHaveBeenCalled()
  })

  it('completes site login and stops polling after authorization', async () => {
    form.acceptTerms.value = true
    await form.loginWithQq()
    mocks.getStatus.mockResolvedValueOnce({ token: 'qq-token' })
    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()
    expect(mocks.auth.setToken).toHaveBeenCalledWith('qq-token')
    expect(mocks.auth.fetchProfile).toHaveBeenCalledWith(true)
    expect(mocks.router.replace).toHaveBeenCalledWith('/')
    const calls = mocks.getStatus.mock.calls.length
    await vi.advanceTimersByTimeAsync(4000)
    expect(mocks.getStatus).toHaveBeenCalledTimes(calls)
  })

  it('closes the empty popup when loading the authorization URL fails', async () => {
    mocks.getUrl.mockRejectedValueOnce(new Error('unavailable'))
    form.acceptTerms.value = true
    await form.loginWithQq()
    expect(popup.close).toHaveBeenCalled()
    expect(form.qqLoginLoading.value).toBe(false)
    expect(mocks.showToast).toHaveBeenCalledWith('unavailable', 'error')
  })

  it('stops polling when the component is unmounted', async () => {
    form.acceptTerms.value = true
    await form.loginWithQq()
    wrapper.unmount()
    const calls = mocks.getStatus.mock.calls.length
    await vi.advanceTimersByTimeAsync(4000)
    expect(mocks.getStatus).toHaveBeenCalledTimes(calls)
  })
})

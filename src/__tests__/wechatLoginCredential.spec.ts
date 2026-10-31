import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { getWechatLoginQrStatus } from '@/api/auth'
import { useAuthForm } from '@/composables/useAuthForm'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  showToast: vi.fn(),
  auth: { loading: false, setToken: vi.fn(), fetchProfile: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('@/stores/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('vue-router', () => ({
  useRouter: () => ({
    resolve: () => ({ href: '/' }),
    replace: vi.fn().mockResolvedValue(undefined),
  }),
}))
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

describe('WeChat browser-only polling credential', () => {
  let form: ReturnType<typeof useAuthForm>
  let wrapper: ReturnType<typeof mount>
  // 服务号扫码登录：`url` 是微信的二维码图片地址，不再是可本地编码的授权页地址
  const qr = {
    url: 'https://mp.example.invalid/cgi-bin/showqrcode?ticket=T-1',
    state: 'pc-state',
    poll_secret: 'pc-only-secret',
    expires_in: 300,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.fetch.mockReset()
    mocks.fetch.mockImplementation(
      async (url: string) =>
        new Response(JSON.stringify(url.includes('/oauth-status') ? { wechat: true } : qr), {
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    wrapper = mount(
      defineComponent({
        setup() {
          form = useAuthForm(ref('login'))
          return () => null
        },
      }),
    )
  })

  afterEach(() => {
    wrapper.unmount()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends the credential as the contract requires: poll_secret in the query string', async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: null }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await getWechatLoginQrStatus(qr.state, qr.poll_secret)
    const [url, init] = mocks.fetch.mock.calls.find(([url]) => String(url).includes('/qr/status'))!
    // 契约 `QrStatusQuery` 只认两个**查询参数** `state` + `poll_secret`；
    // 早先按自定义头 `X-Wechat-Login-Poll-Secret` 传，后端根本不读，轮询一律回过期。
    expect(String(url)).toContain('state=pc-state')
    expect(String(url)).toContain(`poll_secret=${qr.poll_secret}`)
    expect(new Headers(init.headers).get('Authorization')).toBeNull()
    expect(init.cache).toBe('no-store')
  })

  it('keeps the credential in memory and clears it when closing', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    form.acceptTerms.value = true
    await form.loginWithWechat()
    expect(form.wechatQrLogin).toEqual({
      visible: true,
      imageUrl: qr.url,
      url: '',
      state: qr.state,
      pollSecret: qr.poll_secret,
    })
    expect(form.wechatQrLogin.imageUrl).not.toContain(qr.poll_secret)
    expect(storage).not.toHaveBeenCalled()
    form.closeWechatQrLogin()
    expect(form.wechatQrLogin).toEqual({
      visible: false,
      imageUrl: '',
      url: '',
      state: '',
      pollSecret: '',
    })
  })

  it('clears the credential when its owning component is unmounted', async () => {
    form.acceptTerms.value = true
    await form.loginWithWechat()
    expect(form.wechatQrLogin.pollSecret).toBe(qr.poll_secret)
    wrapper.unmount()
    expect(form.wechatQrLogin.pollSecret).toBe('')
    expect(form.wechatQrLogin.visible).toBe(false)
  })

  it('rejects legacy QR responses without a polling credential', async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ url: qr.url, state: qr.state }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    form.acceptTerms.value = true
    await form.loginWithWechat()
    expect(form.wechatQrLogin.visible).toBe(false)
    expect(form.wechatQrLogin.pollSecret).toBe('')
    expect(mocks.showToast).toHaveBeenCalledWith(expect.any(String), 'error')
  })
})

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PrepaidWechatPayView from '@/views/PrepaidWechatPayView.vue'

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  jsapi: vi.fn(),
  authUrl: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('@/api/devOrderDeposit', () => ({
  getPrepaidWechatStatus: mocks.status,
  completePrepaidWechatJsapi: mocks.jsapi,
  getPrepaidWechatAuthUrl: mocks.authUrl,
}))
vi.mock('@/shared/auth/browser', () => ({ isWechatBrowser: () => true }))
vi.mock('@/utils/wechatPayment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/wechatPayment')>()
  return { ...actual, invokeWechatJsapiPayment: mocks.invoke }
})
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { order_no: 'PAY-1', token: 'token-1' } }),
}))

const payInfo = {
  appId: 'wx-test',
  timeStamp: '1',
  nonceStr: 'n',
  package: 'prepay_id=1',
  signType: 'RSA',
  paySign: 's',
}

describe('保证金充值微信中间页', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('已授权时直接补建渠道单、拉起支付并轮询到账', async () => {
    vi.useFakeTimers()
    mocks.status
      .mockResolvedValueOnce({ order: { order_no: 'PAY-1', status: 'created' }, authorized: true })
      .mockResolvedValueOnce({ order: { order_no: 'PAY-1', status: 'paid' }, authorized: true })
    mocks.jsapi.mockResolvedValue({
      order: { order_no: 'PAY-1', status: 'pending' },
      pay_info: JSON.stringify(payInfo),
    })
    mocks.invoke.mockResolvedValue('ok')

    const wrapper = mount(PrepaidWechatPayView)
    await flushPromises()

    expect(mocks.jsapi).toHaveBeenCalledWith('PAY-1', 'token-1')
    expect(mocks.invoke).toHaveBeenCalledWith(payInfo)

    await vi.advanceTimersByTimeAsync(2500)
    await flushPromises()
    expect(wrapper.text()).toContain('支付成功')
    wrapper.unmount()
  })

  it('未授权时跳到公众号授权地址，不在页面里硬调支付', async () => {
    const assign = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        href: 'https://73info.cn/payment/prepaid?order_no=PAY-1',
        assign,
      },
    })
    mocks.status.mockResolvedValue({
      order: { order_no: 'PAY-1', status: 'created' },
      authorized: false,
    })
    mocks.authUrl.mockResolvedValue({
      url: 'https://open.weixin.qq.com/connect/oauth2/authorize?state=PAY-1',
      authorized: false,
    })

    const wrapper = mount(PrepaidWechatPayView)
    await flushPromises()

    expect(mocks.authUrl).toHaveBeenCalledWith(
      'PAY-1',
      'token-1',
      'https://73info.cn/payment/prepaid?order_no=PAY-1',
    )
    expect(assign).toHaveBeenCalledWith(
      'https://open.weixin.qq.com/connect/oauth2/authorize?state=PAY-1',
    )
    expect(mocks.jsapi).not.toHaveBeenCalled()

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    wrapper.unmount()
  })
})

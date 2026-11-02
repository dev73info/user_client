import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DevDepositRechargeDialog from '@/components/DevDepositRechargeDialog.vue'
import { useAuthStore } from '@/stores/auth'

const mocks = vi.hoisted(() => ({
  createRecharge: vi.fn(),
  getOrder: vi.fn(),
  getAuthUrl: vi.fn(),
  credit: vi.fn(),
  toast: vi.fn(),
  resolve: vi.fn(() => ({ href: '/payment/prepaid?order_no=PAY-1&token=token-1' })),
}))

vi.mock('@/api/devOrderDeposit', () => ({
  createPrepaidRecharge: mocks.createRecharge,
  getPrepaidWechatStatus: mocks.getOrder,
  getPrepaidWechatAuthUrl: mocks.getAuthUrl,
}))
vi.mock('@/api/devCredit', () => ({ getDevCreditSelf: mocks.credit }))
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,qr') },
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ resolve: mocks.resolve }) }))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  return {
    ...actual,
    TMessage: {
      success: mocks.toast,
      warning: mocks.toast,
      error: mocks.toast,
      info: mocks.toast,
    },
  }
})

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((button) => button.text().trim() === text)
}

describe('保证金充值弹窗 · 微信', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    useAuthStore().setToken('token-1')
    mocks.credit.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('微信充值的码里是平台中间页，支付后轮询到账并关闭弹窗', async () => {
    vi.useFakeTimers()
    mocks.createRecharge.mockResolvedValue({ order_no: 'PAY-1', status: 'created' })
    mocks.getAuthUrl.mockResolvedValue({
      url: 'https://open.weixin.qq.com/connect/oauth2/authorize?state=PAY-1',
      authorized: false,
    })
    mocks.getOrder.mockResolvedValue({
      order: { order_no: 'PAY-1', status: 'paid' },
      authorized: true,
    })

    const wrapper = mount(DevDepositRechargeDialog, {
      global: { stubs: { Teleport: true } },
    })
    await (wrapper.vm as unknown as { open: () => Promise<void> }).open()
    await flushPromises()

    const wechat = wrapper
      .findAll('input[type="radio"]')
      .find((input) => input.attributes('value') === 'wechat')
    expect(wechat, '弹窗里应该有微信支付选项').toBeTruthy()
    await wechat!.setValue(true)

    const submit = findButton(wrapper, '充值')
    expect(submit, '弹窗里应该有充值按钮').toBeTruthy()
    await submit!.trigger('click')
    await flushPromises()

    expect(mocks.createRecharge).toHaveBeenCalledWith(
      'token-1',
      expect.objectContaining({ channel: 'wechat', client_platform: 'pc' }),
    )
    // 二维码内容必须是平台中间页（手机微信里完成授权与 JSAPI），不是渠道链接
    expect(mocks.getAuthUrl).toHaveBeenCalledWith(
      'PAY-1',
      'token-1',
      expect.stringContaining('/payment/prepaid'),
    )
    expect(wrapper.text()).toContain('请用微信扫描下方二维码完成支付')

    // 轮询一次即到账：关闭弹窗并通知父级回刷余额
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    expect(mocks.getOrder).toHaveBeenCalledWith('PAY-1', 'token-1')
    expect(wrapper.emitted('succeeded')).toEqual([[]])
    wrapper.unmount()
  })

  it('订单已授权时二维码直接指向中间页', async () => {
    mocks.createRecharge.mockResolvedValue({ order_no: 'PAY-1', status: 'created' })
    mocks.getAuthUrl.mockResolvedValue({ url: '', authorized: true })
    mocks.getOrder.mockResolvedValue({
      order: { order_no: 'PAY-1', status: 'pending' },
      authorized: true,
    })

    const wrapper = mount(DevDepositRechargeDialog, {
      global: { stubs: { Teleport: true } },
    })
    await (wrapper.vm as unknown as { open: () => Promise<void> }).open()
    await flushPromises()

    const wechat = wrapper
      .findAll('input[type="radio"]')
      .find((input) => input.attributes('value') === 'wechat')
    await wechat!.setValue(true)
    await findButton(wrapper, '充值')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('请用微信扫描下方二维码完成支付')
    wrapper.unmount()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  useRequirementPayFlow,
  type RequirementPayOrder,
} from '@/composables/useRequirementPayFlow'
import { HttpError } from '@/api/http'
import type { RequirementItem } from '@/api/requirements'

/**
 * 支付流程编排层：三条不能破的约定——不做跳转（只返回 query / 授权地址）、金额只认注入的比例、
 * 查单遇到 `failed` 要丢掉重下且不能把重下的「去支付页」吞掉。
 */

const mocks = vi.hoisted(() => ({
  createPayment: vi.fn(),
  getPayment: vi.fn(),
  clientPlatform: vi.fn(),
  unionAuthorizeUrl: vi.fn(),
  onPaid: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/adapay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/adapay')>()
  return {
    ...actual,
    createAdapayPayment: mocks.createPayment,
    getAdapayPayment: mocks.getPayment,
    getAdapayClientPlatform: mocks.clientPlatform,
  }
})

vi.mock('@/api/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/auth')>()
  return { ...actual, getUnionPaymentAuthorizeUrl: mocks.unionAuthorizeUrl }
})

vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const toast =
    (type: 'success' | 'error' | 'warning' | 'info') =>
    (message: string): void =>
      mocks.toast(message, type)
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

function requirement(patch: Partial<RequirementItem> = {}): RequirementItem {
  return {
    requirement_id: '2026-900000000301',
    title: '小程序订单页改版',
    creator: 'client_view',
    status: 'pending_deposit',
    payment_mode: 'platform_guarantee',
    budget: 10000,
    ...patch,
  } as RequirementItem
}

/** Adapay 下单 / 查单返回体（只列流程读得到的字段）。 */
function adapayPayment(patch: Record<string, unknown> = {}) {
  return {
    paymentId: 'pay_301',
    requirementId: '2026-900000000301',
    milestone: 'deposit',
    amountCny: '2000.00',
    status: 'pending',
    payUrl: 'https://pay.example.com/301',
    ...patch,
  }
}

function existingOrder(patch: Partial<RequirementPayOrder> = {}): RequirementPayOrder {
  return {
    payment_id: 'pay_301',
    requirement_id: '2026-900000000301',
    channel: 'alipay',
    amount_cny: 2000,
    status: 'pending',
    expires_at: '',
    adapay: true,
    ...patch,
  }
}

function setup(options: { ratio?: number; canPay?: boolean; platform?: 'pc' | 'mobile' } = {}) {
  mocks.clientPlatform.mockReturnValue(options.platform ?? 'pc')
  return useRequirementPayFlow({
    token: () => 'token',
    depositRatioPercent: () => options.ratio ?? 20,
    canPayRequirement: () => options.canPay ?? true,
    onPaid: mocks.onPaid,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})
describe('支付流程：开弹窗与通道', () => {
  it('注入的「能不能付」为假时弹窗不开；能开则回到支付宝并清掉上一张订单', () => {
    const refused = setup({ canPay: false })
    refused.openPayModal(requirement())
    expect(refused.payVisible.value).toBe(false)

    const flow = setup()
    flow.currentPayment.value = existingOrder()
    flow.openPayModal(requirement())
    expect(flow.payVisible.value).toBe(true)
    expect(flow.payChannel.value).toBe('alipay')
    expect(flow.currentPayment.value).toBeNull()
  })

  it('切通道会丢掉已建的订单（旧订单在别的通道下查只会一直未支付）', () => {
    const flow = setup()
    flow.openPayModal(requirement())
    flow.currentPayment.value = existingOrder()

    flow.updatePayChannel('wechat')
    expect(flow.payChannel.value).toBe('wechat')
    expect(flow.currentPayment.value).toBeNull()

    // 同一个通道再点一次不动订单
    flow.currentPayment.value = existingOrder({ channel: 'wechat' })
    flow.updatePayChannel('wechat')
    expect(flow.currentPayment.value?.payment_id).toBe('pay_301')
  })
})
describe('支付流程：金额来自注入的比例', () => {
  it('定金按注入比例、尾款按差额，换个比例立刻跟着变', () => {
    const flow = setup({ ratio: 30 })
    flow.openPayModal(requirement())
    expect(flow.payAmount.value).toBe(3000)

    const final = setup({ ratio: 30 })
    final.openPayModal(requirement({ status: 'pending_final' }))
    expect(final.isFinalPayment.value).toBe(true)
    expect(final.payStageLabel.value).toBe('尾款')
    expect(final.payAmount.value).toBe(7000)

    const lower = setup({ ratio: 10 })
    lower.openPayModal(requirement())
    expect(lower.payAmount.value).toBe(1000)

    // 没有选中需求时保持 0.01 兜底（弹窗渲染期间不显示 ¥0.00）
    expect(setup().payAmount.value).toBe(0.01)
  })
})
describe('支付流程：下单只返回去处，不自己跳转', () => {
  it('下单成功返回支付页 query，并带回 payment_id / 渠道 / 金额', async () => {
    mocks.createPayment.mockResolvedValue(adapayPayment())
    const flow = setup()
    flow.openPayModal(requirement())

    expect(await flow.submitPayment()).toEqual({
      kind: 'redirect-page',
      query: {
        adapay: '1',
        requirement_id: '2026-900000000301',
        channel: 'alipay',
        client_platform: 'pc',
        amount_cny: '2000.00',
        payment_id: 'pay_301',
        qr_content: 'https://pay.example.com/301',
      },
    })
    expect(mocks.createPayment).toHaveBeenCalledWith(
      'token',
      '2026-900000000301',
      'deposit',
      'alipay',
      'pc',
    )
    expect(flow.currentPayment.value?.payment_id).toBe('pay_301')
    expect(flow.payLoading.value).toBe(false)
    expect(mocks.toast).toHaveBeenCalledWith('定金支付订单已生成，正在跳转支付页', 'success')
  })

  it('待付尾款下单传 final；无担保订单不下单只提示', async () => {
    mocks.createPayment.mockResolvedValue(adapayPayment({ milestone: 'final' }))
    const final = setup()
    final.openPayModal(requirement({ status: 'pending_final' }))
    await final.submitPayment()
    expect(mocks.createPayment.mock.calls[0]?.[2]).toBe('final')

    const selfManaged = setup()
    selfManaged.openPayModal(requirement({ payment_mode: 'self_managed' }))
    expect(await selfManaged.submitPayment()).toEqual({ kind: 'none' })
    expect(mocks.createPayment).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith(
      '无担保订单不通过平台收款，请由双方按约定自行结算',
      'warning',
    )
  })
})
describe('支付流程：查单', () => {
  it('已支付：提示确认成功、关弹窗、刷新列表', async () => {
    mocks.getPayment.mockResolvedValue(adapayPayment({ status: 'paid' }))
    const flow = setup()
    flow.openPayModal(requirement())
    flow.currentPayment.value = existingOrder()

    expect(await flow.submitPayment()).toEqual({ kind: 'paid' })
    expect(flow.currentPayment.value).toBeNull()
    expect(flow.payVisible.value).toBe(false)
    expect(mocks.onPaid).toHaveBeenCalledTimes(1)
  })

  it('未支付：只提示，不动订单也不刷新', async () => {
    mocks.getPayment.mockResolvedValue(adapayPayment({ status: 'pending' }))
    const flow = setup()
    flow.openPayModal(requirement())
    flow.currentPayment.value = existingOrder()

    expect(await flow.submitPayment()).toEqual({ kind: 'none' })
    expect(flow.currentPayment.value?.payment_id).toBe('pay_301')
    expect(mocks.onPaid).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('支付尚未完成，请先完成 Adapay 支付', 'warning')
  })

  it('订单失效：丢掉旧单重新下单，重下的「去支付页」不能丢（递归要 return）', async () => {
    mocks.getPayment.mockResolvedValue(adapayPayment({ status: 'failed' }))
    mocks.createPayment.mockResolvedValue(adapayPayment({ paymentId: 'pay_302' }))
    const flow = setup()
    flow.openPayModal(requirement())
    flow.currentPayment.value = existingOrder()

    const outcome = await flow.submitPayment()

    expect(mocks.toast).toHaveBeenCalledWith('上次支付订单已失效，重新发起支付', 'warning')
    expect(mocks.createPayment).toHaveBeenCalledTimes(1)
    expect(outcome.kind).toBe('redirect-page')
    expect(flow.currentPayment.value?.payment_id).toBe('pay_302')
  })
})
describe('支付流程：未授权时改走授权链路', () => {
  it('微信未绑定 open_id：返回支付页意图模式（milestone / intent=1 / 注入比例算出的金额）', async () => {
    mocks.createPayment.mockRejectedValue(new HttpError(409, 'wechat open_id not bound'))
    const flow = setup({ ratio: 25 })
    flow.openPayModal(requirement())
    flow.updatePayChannel('wechat')

    expect(await flow.submitPayment()).toEqual({
      kind: 'redirect-page',
      query: {
        adapay: '1',
        requirement_id: '2026-900000000301',
        channel: 'wechat',
        client_platform: 'pc',
        amount_cny: '2500',
        milestone: 'deposit',
        intent: '1',
      },
    })
  })

  it('云闪付授权：移动端返回要 assign 的地址，PC 端只提示', async () => {
    mocks.createPayment.mockRejectedValue(new HttpError(409, 'user_identity_id required'))
    mocks.unionAuthorizeUrl.mockResolvedValue({ url: 'https://union.example.com/auth' })
    const mobile = setup({ platform: 'mobile' })
    mobile.openPayModal(requirement())
    expect(await mobile.submitPayment()).toEqual({
      kind: 'external',
      url: 'https://union.example.com/auth',
    })

    const pc = setup({ platform: 'pc' })
    pc.openPayModal(requirement())
    expect(await pc.submitPayment()).toEqual({ kind: 'none' })
    expect(mocks.toast).toHaveBeenCalledWith(
      '云闪付授权仅适用于移动端，请重新选择支付方式',
      'warning',
    )
  })

  it('授权地址为空按失败提示；其它错误只弹一句，都不跳转', async () => {
    mocks.createPayment.mockRejectedValue(new HttpError(409, 'user_identity_id required'))
    mocks.unionAuthorizeUrl.mockResolvedValue({ url: '  ' })
    const emptyUrl = setup({ platform: 'mobile' })
    emptyUrl.openPayModal(requirement())
    expect(await emptyUrl.submitPayment()).toEqual({ kind: 'none' })
    expect(mocks.toast).toHaveBeenCalledWith('云闪付授权地址为空', 'error')

    mocks.createPayment.mockRejectedValue(new Error('支付网关超时'))
    const failed = setup()
    failed.openPayModal(requirement())
    expect(await failed.submitPayment()).toEqual({ kind: 'none' })
    expect(mocks.toast).toHaveBeenCalledWith('支付网关超时', 'error')
    expect(failed.payLoading.value).toBe(false)
  })
})

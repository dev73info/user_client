import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useRequirementPayFlow, type RequirementPayOrder } from '@/composables/useRequirementPayFlow'
import { HttpError } from '@/api/http'
import type { RequirementItem } from '@/api/requirements'

/**
 * 支付流程编排层：三条不能破的约定——不做跳转（只返回 query）、金额只认注入的比例、
 * 查单遇到 `failed` 要丢掉重下且不能把重下的「去支付页」吞掉。
 */

const mocks = vi.hoisted(() => ({
  createPayment: vi.fn(),
  getPayment: vi.fn(),
  clientPlatform: vi.fn(),
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

/** 下单 / 查单回执（契约字段，金额只有整数分 + 元串两份）。 */
function adapayPayment(patch: Record<string, unknown> = {}) {
  return {
    payment_id: 'pay_301',
    requirement_id: '2026-900000000301',
    milestone: 'deposit',
    pay_channel: 'alipay',
    pay_mode: 'escrow',
    amount_fen: 200000,
    amount_cny: '2000.00',
    status: 'created',
    pay_url: 'https://pay.example.com/301',
    ...patch,
  }
}

/** 已经建过的那张单（`RequirementPayOrder`）。 */
function existingOrder(patch: Partial<RequirementPayOrder> = {}): RequirementPayOrder {
  return {
    order_no: 'pay_301',
    requirement_id: '2026-900000000301',
    channel: 'alipay',
    amount_fen: 200000,
    status: 'created',
    pay_url: 'https://pay.example.com/301',
    ...patch,
  }
}

function setup(options: { ratio?: number; canPay?: boolean; platform?: 'desktop' | 'mobile' } = {}) {
  mocks.clientPlatform.mockReturnValue(options.platform ?? 'desktop')
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
    expect(flow.currentPayment.value?.order_no).toBe('pay_301')
  })
})

describe('支付流程：金额来自注入的比例', () => {
  it('定金按注入比例、尾款按差额，换个比例立刻跟着变（全程整数分）', () => {
    const flow = setup({ ratio: 30 })
    flow.openPayModal(requirement())
    expect(flow.payFen.value).toBe(300000)
    expect(flow.payAmount.value).toBe(3000)

    const final = setup({ ratio: 30 })
    final.openPayModal(requirement({ status: 'pending_final' }))
    expect(final.isFinalPayment.value).toBe(true)
    expect(final.payStageLabel.value).toBe('尾款')
    expect(final.payFen.value).toBe(700000)

    const lower = setup({ ratio: 10 })
    lower.openPayModal(requirement())
    expect(lower.payFen.value).toBe(100000)

    // 没有选中需求时保持 0.01 元兜底（弹窗渲染期间不显示 ¥0.00）
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
        client_platform: 'desktop',
        amount_cny: '2000.00',
        payment_id: 'pay_301',
        qr_content: 'https://pay.example.com/301',
      },
    })
    // 请求体只发 pay_channel / client_platform，金额由服务端按合同快照算
    expect(mocks.createPayment).toHaveBeenCalledWith(
      'token',
      '2026-900000000301',
      'deposit',
      'alipay',
      'desktop',
    )
    expect(flow.currentPayment.value?.order_no).toBe('pay_301')
    expect(flow.currentPayment.value?.amount_fen).toBe(200000)
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
    expect(flow.currentPayment.value?.order_no).toBe('pay_301')
    expect(mocks.onPaid).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('支付尚未完成，请先完成 Adapay 支付', 'warning')
  })

  it('订单失效：丢掉旧单重新下单，重下的「去支付页」不能丢（递归要 return）', async () => {
    mocks.getPayment.mockResolvedValue(adapayPayment({ status: 'failed' }))
    mocks.createPayment.mockResolvedValue(adapayPayment({ payment_id: 'pay_302' }))
    const flow = setup()
    flow.openPayModal(requirement())
    flow.currentPayment.value = existingOrder()

    const outcome = await flow.submitPayment()

    expect(mocks.toast).toHaveBeenCalledWith('上次支付订单已失效，重新发起支付', 'warning')
    expect(mocks.createPayment).toHaveBeenCalledTimes(1)
    expect(outcome.kind).toBe('redirect-page')
    expect(flow.currentPayment.value?.order_no).toBe('pay_302')
  })
})

describe('支付流程：失败只提示，不自己改道', () => {
  it('下单失败原话提示，不跳转也不留订单', async () => {
    mocks.createPayment.mockRejectedValue(new HttpError(409, '需求当前状态不能发起定金支付'))
    const flow = setup()
    flow.openPayModal(requirement())

    expect(await flow.submitPayment()).toEqual({ kind: 'none' })
    expect(mocks.toast).toHaveBeenCalledWith('需求当前状态不能发起定金支付', 'error')
    expect(flow.currentPayment.value).toBeNull()
    expect(flow.payLoading.value).toBe(false)
  })

  it('非 Error 抛出时也给一句兜底文案', async () => {
    mocks.createPayment.mockRejectedValue('boom')
    const flow = setup()
    flow.openPayModal(requirement())

    expect(await flow.submitPayment()).toEqual({ kind: 'none' })
    expect(mocks.toast).toHaveBeenCalledWith('支付失败', 'error')
  })
})

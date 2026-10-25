import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrepaidOrder } from '@/api/devOrderDeposit'
import DevDepositRechargeDialog from '@/components/DevDepositRechargeDialog.vue'

const mocks = vi.hoisted(() => ({
  credit: vi.fn(),
  recharge: vi.fn(),
  qr: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: 'test-token' }),
}))
vi.mock('@/api/devCredit', () => ({ getDevCreditSelf: mocks.credit }))
vi.mock('@/api/devOrderDeposit', () => ({ createPrepaidRecharge: mocks.recharge }))
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.qr } }))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  return {
    ...actual,
    TMessage: { ...actual.TMessage, error: mocks.error },
  }
})

function prepaidOrder(clientAction: PrepaidOrder['client_action']): PrepaidOrder {
  return {
    order_no: 'MOCK-DEPOSIT-001',
    biz_type: 'developer_deposit_recharge',
    biz_no: 'MOCK-DEPOSIT-001',
    payer: 'dev_flow_03562487',
    amount_fen: 10000,
    channel: 'alipay',
    status: 'pending',
    status_label: '待支付',
    subject: '保证金充值',
    provider_payment_id: null,
    client_action: clientAction,
    paid_at: null,
    created_time: '2026-10-26 00:00:00',
  }
}

async function mountDialog(): Promise<VueWrapper> {
  const wrapper = mount(DevDepositRechargeDialog, {
    global: {
      stubs: {
        TDialog: {
          name: 'TDialog',
          props: ['open'],
          emits: ['update:open'],
          template: '<div v-if="open" role="dialog"><slot /><slot name="footer" /></div>',
        },
        TForm: { template: '<form><slot /></form>' },
        TFormItem: { template: '<div><slot /></div>' },
        TRadioGroup: { template: '<div><slot /></div>' },
        TButton: {
          props: ['disabled'],
          emits: ['click'],
          template:
            '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  })
  await (wrapper.vm as unknown as { open: () => Promise<void> }).open()
  await flushPromises()
  return wrapper
}

function actionButton(wrapper: VueWrapper, text: string) {
  const button = wrapper.findAll('button').find((item) => item.text() === text)
  if (!button) {
    throw new Error(`找不到按钮：${text}`)
  }
  return button
}

async function submit(wrapper: VueWrapper): Promise<void> {
  await actionButton(wrapper, '充值').trigger('click')
  await flushPromises()
}

describe('开发者保证金充值二维码', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.credit.mockResolvedValue(null)
    mocks.qr.mockResolvedValue('data:image/png;base64,mock-qr')
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('直接编码 qr_code，不跳转，重新打开不残留旧单', async () => {
    const href = window.location.href
    mocks.recharge.mockResolvedValue(
      prepaidOrder({
        redirect_url: null,
        qr_code: 'https://pay.example.test/cashier/MOCK-DEPOSIT-001',
        sdk_payload: null,
      }),
    )
    wrapper = await mountDialog()

    await submit(wrapper)

    expect(mocks.recharge).toHaveBeenCalledExactlyOnceWith('test-token', {
      amount_fen: 10000,
      channel: 'alipay',
      client_platform: 'pc',
    })
    expect(mocks.qr).toHaveBeenCalledExactlyOnceWith(
      'https://pay.example.test/cashier/MOCK-DEPOSIT-001',
      { width: 220, margin: 1, errorCorrectionLevel: 'M' },
    )
    expect(wrapper.get('.dev-recharge-dialog__qr-img').attributes('src')).toBe(
      'data:image/png;base64,mock-qr',
    )
    expect(wrapper.text()).toContain('MOCK-DEPOSIT-001')
    expect(window.location.href).toBe(href)

    wrapper.getComponent({ name: 'TDialog' }).vm.$emit('update:open', false)
    await flushPromises()
    await (wrapper.vm as unknown as { open: () => Promise<void> }).open()
    await flushPromises()
    expect(wrapper.find('.dev-recharge-dialog__qr-img').exists()).toBe(false)
  })

  it('只有收银台地址时也生成二维码，点我已支付关闭并通知刷新', async () => {
    mocks.recharge.mockResolvedValue(
      prepaidOrder({
        redirect_url: 'https://pay.example.test/cashier/MOCK-DEPOSIT-001',
        qr_code: null,
        sdk_payload: null,
      }),
    )
    wrapper = await mountDialog()
    await submit(wrapper)

    expect(mocks.qr).toHaveBeenCalledWith(
      'https://pay.example.test/cashier/MOCK-DEPOSIT-001',
      expect.any(Object),
    )
    await actionButton(wrapper, '我已支付').trigger('click')

    expect(wrapper.emitted('succeeded')).toEqual([[]])
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.find('.dev-recharge-dialog__qr-img').exists()).toBe(false)
  })

  it('渠道没有返回支付内容时不误报成功', async () => {
    mocks.recharge.mockResolvedValue(prepaidOrder(null))
    wrapper = await mountDialog()
    await submit(wrapper)

    expect(mocks.error).toHaveBeenCalledWith('充值单已创建，但支付渠道未返回支付内容，请联系客服')
    expect(mocks.qr).not.toHaveBeenCalled()
    expect(wrapper.emitted('succeeded')).toBeUndefined()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  })
})

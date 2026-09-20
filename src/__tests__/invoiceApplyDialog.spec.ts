import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import InvoiceApplyDialog from '@/components/InvoiceApplyDialog.vue'
import { useAuthStore } from '@/stores/auth'
import type { InvoicePaymentOption } from '@/api/invoices'

const mocks = vi.hoisted(() => ({
  options: vi.fn(),
  platform: vi.fn(),
  developer: vi.fn(),
  realname: vi.fn(),
  profile: vi.fn(),
}))

vi.mock('@/api/invoices', () => ({
  listInvoicePaymentOptions: mocks.options,
  requestPlatformInvoice: mocks.platform,
  requestDeveloperInvoice: mocks.developer,
}))
vi.mock('@/api/realname', () => ({ getMyRealnameVerification: mocks.realname }))
vi.mock('@/api/settings', () => ({ getProfile: mocks.profile }))

function option(paymentId: string, requirementId: string): InvoicePaymentOption {
  return {
    paymentId,
    requirementId,
    milestone: 'deposit',
    amountFen: 100000,
    amountCny: '1000.00',
    payer: 'alice',
    developer: 'bob',
    platformFeeFen: 20000,
    platformFeeCny: '200.00',
    developerGrossAmountFen: 80000,
    developerGrossAmountCny: '800.00',
  }
}

// 需求 REQ-1 有定金 / 尾款两个已结算节点，REQ-2 是别的需求，不该出现在 REQ-1 的弹窗里。
const OPTIONS: InvoicePaymentOption[] = [
  option('PAY-1', 'REQ-1'),
  option('PAY-2', 'REQ-1'),
  option('PAY-9', 'REQ-2'),
]

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  localStorage.clear()
  mocks.options.mockResolvedValue(OPTIONS)
  // 未完成实名：不做抬头预填，断言只看用户输入。
  mocks.realname.mockResolvedValue({ status: 'pending' })
  mocks.profile.mockResolvedValue({})
})

async function render(role: 'customer' | 'developer', username: string) {
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = username
  const wrapper = mount(InvoiceApplyDialog, {
    props: { visible: true, token: 'test-token', requirementId: 'REQ-1', role },
    global: { stubs: { Teleport: true } },
  })
  await flushPromises()
  return wrapper
}

describe('InvoiceApplyDialog', () => {
  it('需求方进入时选中平台开具，开发者一侧置灰并给出原因', async () => {
    const wrapper = await render('customer', 'alice')
    const tabs = wrapper.findAll('.invoice-side-switch__btn')
    const platformTab = tabs[0]!
    const developerTab = tabs[1]!

    expect(platformTab.attributes('aria-checked')).toBe('true')
    expect(platformTab.attributes('disabled')).toBeUndefined()
    expect(developerTab.attributes('aria-checked')).toBe('false')
    expect(developerTab.attributes('disabled')).toBeDefined()
    expect(developerTab.attributes('title')).toContain('开发者发票由乙方申请')
    expect(wrapper.find('.invoice-panel__notice').text()).toContain('开发者发票由乙方申请')

    wrapper.unmount()
  })

  it('支付节点只列当前需求的记录', async () => {
    const wrapper = await render('customer', 'alice')
    const values = wrapper.findAll('select option').map((item) => item.attributes('value'))

    expect(values).toEqual(['', 'PAY-1', 'PAY-2'])
    expect(wrapper.text()).not.toContain('REQ-2')

    wrapper.unmount()
  })

  it('开发者进入时选中开发者开具，平台一侧置灰', async () => {
    const wrapper = await render('developer', 'bob')
    const tabs = wrapper.findAll('.invoice-side-switch__btn')
    const platformTab = tabs[0]!
    const developerTab = tabs[1]!

    expect(platformTab.attributes('disabled')).toBeDefined()
    expect(platformTab.attributes('title')).toContain('平台服务费发票由付款方申请')
    expect(developerTab.attributes('aria-checked')).toBe('true')
    expect(wrapper.find('.invoice-panel__notice').text()).toContain('平台服务费发票由付款方申请')

    wrapper.unmount()
  })

  it('提交平台开票申请时带上所选支付节点与抬头', async () => {
    mocks.platform.mockResolvedValue({ id: 1 })
    const wrapper = await render('customer', 'alice')

    await wrapper.find('select').setValue('PAY-2')
    await wrapper.find('input[type="text"]').setValue('某某科技有限公司')
    await wrapper.find('.invoice-panel__submit').trigger('click')
    await flushPromises()

    expect(mocks.platform).toHaveBeenCalledWith('test-token', {
      payment_id: 'PAY-2',
      invoice_title: '某某科技有限公司',
      tax_number: '',
      recipient_email: '',
    })
    expect(wrapper.emitted('submitted')).toBeTruthy()
    expect(wrapper.emitted('update:visible')).toEqual([[false]])

    wrapper.unmount()
  })
})

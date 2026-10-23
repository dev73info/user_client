import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buyer,
  emailInput,
  fillSpecialFields,
  hasSpecialFields,
  invoiceRecord,
  primeInvoiceMocks,
  renderInvoice,
  selectKind,
  summary,
  taxInput,
  titleInput,
} from './helpers/invoiceApplyDialog'
import type { InvoiceMocks } from './helpers/invoiceApplyDialog'

/** 抬头 / 税号 / 邮箱的预填：本人实名主体、乙方视角带出买方、未实名时手动填写。 */

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  apply: vi.fn(),
})) satisfies InvoiceMocks

vi.mock('@/api/invoices', () => ({
  getInvoiceSummary: mocks.summary,
  applyInvoices: mocks.apply,
}))

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  localStorage.clear()
  primeInvoiceMocks(mocks)
})

describe('InvoiceApplyDialog', () => {
  it('需求方视角按本人实名主体预填抬头 / 税号 / 邮箱', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        buyer: buyer({
          authType: 'SOLE_PROPRIETOR',
          isOrganization: true,
          title: '彝良柒叁信息经营部',
          taxNumber: '92530628MAKA0U1Y96',
          email: 'client@example.com',
        }),
      }),
    )
    const wrapper = await renderInvoice('customer')

    // 个体工商户：抬头取主体名称、税号取统一社会信用代码、邮箱取账户主邮箱。
    expect(titleInput(wrapper)).toBe('彝良柒叁信息经营部')
    expect(taxInput(wrapper)).toBe('92530628MAKA0U1Y96')
    expect(emailInput(wrapper)).toBe('client@example.com')
    expect(wrapper.text()).toContain('抬头与税号已按本人实名主体自动填写')
    // 个体户是企业组织形式，但专票只给企业主体，这里不该出现专票选项。
    expect(wrapper.find('input[name="invoice-kind"][value="special"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('乙方视角按需求方（客户）主体预填：带出的是买方，不是开发者自己', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        developerInvoiceFen: 70000,
        developerInvoiceCny: '700.00',
        invoiceableTotalFen: 70000,
        invoiceableTotalCny: '700.00',
        // 开发者自己是企业（彝良柒叁信息有限责任公司），但发票的买方是需求方樊波。
        buyer: buyer({
          username: 'alice',
          title: '樊波',
          taxNumber: '',
          email: 'client@example.com',
        }),
      }),
    )
    const wrapper = await renderInvoice('developer')

    expect(titleInput(wrapper)).toBe('樊波')
    expect(taxInput(wrapper)).toBe('')
    expect(emailInput(wrapper)).toBe('client@example.com')
    expect(wrapper.text()).toContain('抬头与税号已按需求方（客户）实名主体自动填写')
    // 个人买方不需要税号，占位文案也跟着账户类型走。
    expect(wrapper.find('input[maxlength="64"]').attributes('placeholder')).toBe('个人开票可不填')

    wrapper.unmount()
  })

  it('需求方未完成实名认证时不给预填，提示手动填写', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        buyer: buyer({
          authType: 'ENTERPRISE',
          realnameStatus: 'pending',
          isOrganization: true,
          title: '',
          taxNumber: '',
          email: '',
        }),
      }),
    )
    const wrapper = await renderInvoice('developer')

    expect(titleInput(wrapper)).toBe('')
    expect(wrapper.text()).toContain('需求方实名认证审核中，抬头与税号需手动填写。')

    wrapper.unmount()
  })

  it('企业买方申请时缺税号先被挡下：开发者票的税号由后端强制校验', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        // 企业买方：抬头按公司全称带出，税号没得带就留给用户手填。
        buyer: buyer({
          authType: 'ENTERPRISE',
          isOrganization: true,
          title: '某某科技有限公司',
          taxNumber: '',
        }),
      }),
    )
    const wrapper = await renderInvoice('customer')

    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe(
      '某某科技有限公司',
    )
    await wrapper.find('.invoice-panel__submit').trigger('click')
    await flushPromises()

    expect(mocks.apply).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})

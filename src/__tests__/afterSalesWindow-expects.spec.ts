import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { detailBase, mountAfterSales, type AfterSalesMocks } from './helpers/afterSalesWindow'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  open: vi.fn(),
  respond: vi.fn(),
  withdraw: vi.fn(),
  detail: vi.fn(),
  toast: vi.fn(),
})) satisfies AfterSalesMocks

vi.mock('@/api/afterSales', () => ({
  listMyAfterSalesCases: mocks.list,
  openAfterSalesCase: mocks.open,
  respondAfterSalesCase: mocks.respond,
  withdrawAfterSalesCase: mocks.withdraw,
  getAfterSalesCase: mocks.detail,
}))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const toast = (type: string) => (message: string) => mocks.toast(message, type)
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

let wrapper: VueWrapper | undefined
beforeEach(() => {
  vi.resetAllMocks()
  mocks.open.mockResolvedValue(detailBase)
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('解除合作诉求提交', () => {
  it('金额按整数分提交，说明与需求编号进入立案请求体', async () => {
    wrapper = await mountAfterSales(mocks)
    await wrapper.find('input[type="number"]').setValue('10.01')
    await wrapper.find('textarea').setValue('交付不符合约定，需要解除合作')
    const submit = wrapper.findAll('button').find((item) => item.text() === '提交解除合作申请')
    await submit!.trigger('click')
    await flushPromises()
    // 契约 `FileCaseRequest`：只有 requirement_id / kind / claim_amount_fen / claim_note 四个字段
    expect(mocks.open).toHaveBeenCalledWith('token', {
      requirement_id: '2026-900000000105',
      kind: 'after_sales',
      claim_amount_fen: 1001,
      claim_note: '交付不符合约定，需要解除合作',
    })
  })

  it('诉求说明为空时不发请求', async () => {
    wrapper = await mountAfterSales(mocks)
    const submit = wrapper.findAll('button').find((item) => item.text() === '提交解除合作申请')
    await submit!.trigger('click')
    expect(mocks.open).not.toHaveBeenCalled()
  })

  it('主张金额留空按 0 提交（契约缺省 0 = 不主张资金）', async () => {
    wrapper = await mountAfterSales(mocks)
    await wrapper.find('textarea').setValue('只是反馈交付问题，不主张退款')
    const submit = wrapper.findAll('button').find((item) => item.text() === '提交解除合作申请')
    await submit!.trigger('click')
    await flushPromises()
    expect(mocks.open).toHaveBeenCalledWith('token', {
      requirement_id: '2026-900000000105',
      kind: 'after_sales',
      claim_amount_fen: 0,
      claim_note: '只是反馈交付问题，不主张退款',
    })
  })
})

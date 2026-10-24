import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import {
  baseProps,
  caseWith,
  mountAfterSales,
  openCase,
  type AfterSalesMocks,
} from './helpers/afterSalesWindow'

const mocks = vi.hoisted(() => ({
  list: vi.fn(), open: vi.fn(), respond: vi.fn(), withdraw: vi.fn(), detail: vi.fn(), toast: vi.fn(),
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
  return { ...actual, TMessage: { ...actual.TMessage, success: toast('success'), error: toast('error'), warning: toast('warning'), info: toast('info') } }
})

let wrapper: VueWrapper | undefined
const developerProps = { canOpenCase: false, currentUsername: 'dev_flow' }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.respond.mockResolvedValue(caseWith('platform_review'))
  mocks.withdraw.mockResolvedValue(caseWith('withdrawn'))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('解除合作案件表态与撤回', () => {
  it('对方可以同意或拒绝，路径参数使用 case_no', async () => {
    wrapper = await mountAfterSales(mocks, [openCase], developerProps)
    const approve = wrapper.findAll('button').find((item) => item.text() === '同意解除')
    await approve!.trigger('click')
    await flushPromises()
    expect(mocks.respond).toHaveBeenCalledWith('token', openCase.case_no, 'approve')

    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    await flushPromises()
    const reject = wrapper.findAll('button').find((item) => item.text() === '不同意，转平台裁决')
    await reject!.trigger('click')
    await flushPromises()
    expect(mocks.respond).toHaveBeenLastCalledWith('token', openCase.case_no, 'reject')
  })

  it('立案人可以撤回自己的案件', async () => {
    wrapper = await mountAfterSales(mocks, [openCase], baseProps)
    const withdraw = wrapper.findAll('button').find((item) => item.text() === '撤回申请')
    await withdraw!.trigger('click')
    await flushPromises()
    expect(mocks.withdraw).toHaveBeenCalledWith('token', openCase.case_no, '当事人撤回申请')
  })
})

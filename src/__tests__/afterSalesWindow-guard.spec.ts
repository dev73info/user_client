import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { caseWith, mountAfterSales, type AfterSalesMocks } from './helpers/afterSalesWindow'

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
beforeEach(() => vi.resetAllMocks())
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('解除合作案件展示守卫', () => {
  it('在办案件展示 snake_case 事实，不再显示立案表单', async () => {
    wrapper = await mountAfterSales(mocks, [caseWith('negotiating')])
    expect(wrapper.text()).toContain('AFTERSALES_1')
    expect(wrapper.text()).toContain('协商解除')
    expect(wrapper.text()).toContain('10.00')
    expect(wrapper.find('textarea').exists()).toBe(false)
  })

  it('没有在办案件时显示最近结案状态，并允许重新申请', async () => {
    wrapper = await mountAfterSales(mocks, [caseWith('closed', { open: false })])
    expect(wrapper.text()).toContain('最近案件 AFTERSALES_1')
    expect(wrapper.find('textarea').exists()).toBe(true)
  })
})

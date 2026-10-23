import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import type { AfterSalesCaseList } from '@/api/afterSales'
import {
  baseProps,
  caseWith,
  findButton,
  hasFormOn,
  mountAfterSales,
  openCase,
  type AfterSalesMocks,
} from './helpers/afterSalesWindow'

/** 期望（要钱 / 返工 / 只反馈）：默认勾选、金额框出现条件、提交载荷与需求预算上限。 */

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

let wrapper: VueWrapper | undefined

async function open(
  payload: Partial<AfterSalesCaseList> = {},
  propOverrides: Partial<typeof baseProps> = {},
) {
  wrapper = await mountAfterSales(mocks, payload, propOverrides)
}

const button = (text: string) => findButton(wrapper!, text)

async function clickButton(text: string) {
  const target = button(text)
  expect(target, `按钮「${text}」应该存在`).toBeDefined()
  await target!.trigger('click')
  await flushPromises()
}

const hasForm = () => hasFormOn(wrapper!)
const submitButton = () => button('提交解除合作申请')

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

/** 期望多选的第一个勾选项（要一笔钱回来）与金额输入框。 */
const expectsMoneyBox = () => wrapper!.findAll<HTMLInputElement>('input[type="checkbox"]')[0]!
const expectsReworkBox = () => wrapper!.findAll<HTMLInputElement>('input[type="checkbox"]')[1]!
const amountInput = () => wrapper!.find('input[type="number"]')

describe('解除合作弹窗的期望（要钱 / 返工 / 只反馈）', () => {
  it('默认勾「要一笔钱回来」：给金额输入框，文案是用户口径', async () => {
    await open()
    expect(expectsMoneyBox().element.checked).toBe(true)
    expect(expectsReworkBox().element.checked).toBe(false)
    expect(wrapper!.text()).toContain('希望拿回多少（元）')
    // 提示挂在 placeholder 上（文本框里的灰字，`text()` 取不到）。
    expect(amountInput().attributes('placeholder')).toBe('留空由平台认定，不超过你已支付的金额')
  })

  it('不勾「要钱」就不给金额输入框：没要钱却填了额度后端会拒收', async () => {
    await open()
    await expectsMoneyBox().setValue(false)
    expect(amountInput().exists()).toBe(false)

    // 勾上返工也不该把金额框带回来（两者是独立的期望）。
    await expectsReworkBox().setValue(true)
    expect(amountInput().exists()).toBe(false)
  })

  it('「要钱 + 返工」可以同时选：金额框照旧出现', async () => {
    await open()
    await expectsReworkBox().setValue(true)
    expect(expectsMoneyBox().element.checked).toBe(true)
    expect(amountInput().exists()).toBe(true)
  })

  it('两个都不选时说明这是「只反馈问题」', async () => {
    await open()
    await expectsMoneyBox().setValue(false)
    expect(wrapper!.text()).toContain('两个都不选就是只反馈问题')
  })

  it('提交时把期望与金额一起送出去；没要钱时不带金额', async () => {
    await open()
    await wrapper!.find('.after-sales-modal textarea').setValue('首页在手机上错位')
    await amountInput().setValue('12.5')
    await clickButton('提交解除合作申请')
    expect(mocks.open).toHaveBeenCalledWith(
      'token',
      baseProps.requirementId,
      true,
      false,
      '首页在手机上错位',
      1250,
    )

    vi.resetAllMocks()
    mocks.list.mockResolvedValue({ items: [], windowOpen: true, windowClosesAt: null })
    await open()
    await expectsMoneyBox().setValue(false)
    await expectsReworkBox().setValue(true)
    await wrapper!.find('.after-sales-modal textarea').setValue('请把首页重做一遍')
    await clickButton('提交解除合作申请')
    expect(mocks.open).toHaveBeenCalledWith(
      'token',
      baseProps.requirementId,
      false,
      true,
      '请把首页重做一遍',
      0,
    )
  })

  it('给了需求预算就把上限写进提示：占位与 max 都带上这个数', async () => {
    await open({}, { requirementBudget: 200 })
    expect(amountInput().attributes('placeholder')).toBe(
      '留空由平台认定；最多不超过需求预算 200.00 元',
    )
    expect(amountInput().attributes('max')).toBe('200')
  })

  it('主张金额超过需求预算时拦在提交前：不发请求，给中文提示', async () => {
    await open({}, { requirementBudget: 200 })
    await wrapper!.find('.after-sales-modal textarea').setValue('交付与验收标准不符')
    await amountInput().setValue('2000')
    await clickButton('提交解除合作申请')

    expect(mocks.open).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('主张金额不能超过需求预算 200.00 元', 'warning')
  })

  it('主张金额在预算之内照常提交', async () => {
    await open({}, { requirementBudget: 200 })
    await wrapper!.find('.after-sales-modal textarea').setValue('交付与验收标准不符')
    await amountInput().setValue('200')
    await clickButton('提交解除合作申请')

    expect(mocks.open).toHaveBeenCalledWith(
      'token',
      baseProps.requirementId,
      true,
      false,
      '交付与验收标准不符',
      20000,
    )
  })
})

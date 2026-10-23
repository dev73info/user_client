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

/** 返工中状态：发起人验收与撤回，对侧没有任何入口。 */

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

describe('解除合作弹窗的返工中状态', () => {
  /** 开发者视角：案件由需求方发起，返工中他没有可点的动作。 */
  const developerProps = { canOpenCase: false, currentUsername: 'dev_flow' }
  const developerView = { viewerRole: 'developer' as const }

  beforeEach(() => {
    mocks.respond.mockResolvedValue(caseWith('support_reviewing'))
    mocks.withdraw.mockResolvedValue(caseWith('withdrawn'))
  })

  it('返工中由发起人验收：可确认已落实，也可报未落实转平台裁决', async () => {
    await open({ items: [caseWith('rework_pending')] })
    expect(wrapper!.text()).toContain('返工中')
    expect(button('确认已落实')).toBeDefined()
    expect(button('未落实，申请平台介入')).toBeDefined()

    await clickButton('未落实，申请平台介入')
    expect(mocks.respond).toHaveBeenCalledWith('token', openCase.id, 'unfulfilled')
  })

  it('返工中发起人仍可撤回申请', async () => {
    await open({ items: [caseWith('rework_pending')] })
    await clickButton('撤回申请')
    expect(mocks.withdraw).toHaveBeenCalledWith('token', openCase.id)
  })

  it('返工中不给对方任何入口：案子在等发起人验收', async () => {
    await open({ items: [caseWith('rework_pending', developerView)] }, developerProps)
    expect(button('确认已落实')).toBeUndefined()
    expect(button('未落实，申请平台介入')).toBeUndefined()
    expect(button('接受诉求')).toBeUndefined()
    expect(wrapper!.text()).toContain('对方已接受返工要求')
  })

  it('「待确认落实」的诉求上不发未落实：没有可验收的中间产物', async () => {
    await open({ items: [caseWith('agreed', { expectsMoney: true, viewerRole: 'customer' })] })
    expect(button('确认已落实')).toBeDefined()
    expect(button('未落实，申请平台介入')).toBeUndefined()
  })
})

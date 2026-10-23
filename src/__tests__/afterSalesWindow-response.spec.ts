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

/** 表态与落实确认：接受 / 不接受 / 撤回 / 确认已落实，以及资金执行中的两种说法。 */

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

describe('解除合作弹窗的表态与落实确认', () => {
  /** 开发者视角：案件由需求方发起，他只能表态。 */
  const developerProps = { canOpenCase: false, currentUsername: 'dev_flow' }

  beforeEach(() => {
    mocks.respond.mockResolvedValue(caseWith('processing'))
    mocks.withdraw.mockResolvedValue(caseWith('withdrawn'))
  })

  it('对方表态：接受与不接受各按对应动作提交', async () => {
    const counterpartyView = { viewerRole: 'developer' as const }
    await open({ items: [caseWith('submitted', counterpartyView)] }, developerProps)
    await clickButton('接受诉求')
    expect(mocks.respond).toHaveBeenCalledWith('token', openCase.id, 'accept')

    await open({ items: [caseWith('submitted', counterpartyView)] }, developerProps)
    await clickButton('不接受，转平台裁决')
    expect(mocks.respond).toHaveBeenLastCalledWith('token', openCase.id, 'reject')
  })

  it('已经表过态的一方不再拿到表态按钮，改为平台裁决说明', async () => {
    await open(
      {
        items: [
          caseWith('support_reviewing', {
            viewerRole: 'developer',
            developerDecision: 'reject',
          }),
        ],
      },
      developerProps,
    )
    expect(button('接受诉求')).toBeUndefined()
    expect(button('不接受，转平台裁决')).toBeUndefined()
    expect(wrapper!.text()).toContain('已提交平台裁决')
  })

  it('发起人视角不出现表态按钮，只保留撤回入口', async () => {
    await open({ items: [caseWith('support_reviewing')] })
    expect(button('接受诉求')).toBeUndefined()
    expect(button('不接受，转平台裁决')).toBeUndefined()
    expect(button('撤回申请')).toBeDefined()
  })

  it('「待确认落实」状态下发起人拿到确认落实入口，提交 complete', async () => {
    mocks.respond.mockResolvedValue(caseWith('succeeded'))
    await open({ items: [caseWith('agreed')] })
    expect(wrapper!.text()).toContain('待确认落实')
    await clickButton('确认已落实')
    expect(mocks.respond).toHaveBeenCalledWith('token', openCase.id, 'complete')
  })

  it('「待确认落实」状态下发起人仍可撤回申请', async () => {
    await open({ items: [caseWith('agreed')] })
    await clickButton('撤回申请')
    expect(mocks.withdraw).toHaveBeenCalledWith('token', openCase.id)
  })

  it('「待确认落实」状态下对方不再有表态按钮，只有等待说明', async () => {
    await open({ items: [caseWith('agreed', { viewerRole: 'developer' })] }, developerProps)
    expect(button('接受诉求')).toBeUndefined()
    expect(button('不接受，转平台裁决')).toBeUndefined()
    expect(button('确认已落实')).toBeUndefined()
    expect(wrapper!.text()).toContain('双方已就诉求达成一致')
  })

  it('资金执行中的案件只展示进度，不再给任何表态入口', async () => {
    await open({ items: [caseWith('processing', { viewerRole: 'developer' })] }, developerProps)
    expect(button('接受诉求')).toBeUndefined()
    expect(button('撤回申请')).toBeUndefined()
    expect(wrapper!.text()).toContain('资金正在执行')
  })

  it('双方一致的资金执行按「双方达成一致」说，不写成平台裁决', async () => {
    // 对方点「接受诉求」即当场按诉求额度退款，责任方记 `mutual`：平台只是照约定走渠道退款，
    // 没有任何裁决动作，文案不能让人以为平台介入过。
    await open({
      items: [caseWith('processing', { liableParty: 'mutual', developerDecision: 'accept' })],
    })
    expect(wrapper!.text()).toContain('资金执行中')
    expect(wrapper!.text()).toContain('双方已达成一致')
    expect(wrapper!.text()).not.toContain('平台裁决')

    // 平台裁决（认定责任方）走同一条资金链路，但说法要说成裁决。
    await open({ items: [caseWith('processing', { liableParty: 'developer' })] })
    expect(wrapper!.text()).toContain('平台裁决已落地')
  })
})

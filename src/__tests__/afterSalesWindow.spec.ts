import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AfterSalesModal from '@/components/AfterSalesModal.vue'
import type { AfterSalesCase, AfterSalesCaseList } from '@/api/afterSales'

/** 售后窗口关闭后不该再渲染发起表单：填完必然被后端 409 拒绝，等于死入口。 */
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  open: vi.fn(),
  respond: vi.fn(),
  withdraw: vi.fn(),
}))

vi.mock('@/api/afterSales', () => ({
  listMyAfterSalesCases: mocks.list,
  openAfterSalesCase: mocks.open,
  respondAfterSalesCase: mocks.respond,
  withdrawAfterSalesCase: mocks.withdraw,
}))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

const baseProps = {
  token: 'token',
  currentUsername: 'client_flow',
  requirementId: '2026-900000000105',
  requirementTitle: '主流程验证',
  canOpenCase: true,
}

const openCase: AfterSalesCase = {
  id: 1,
  caseNo: 'AFTERSALES_1',
  requirementId: baseProps.requirementId,
  requirementTitle: baseProps.requirementTitle,
  requirementStatus: 'completed',
  openedBy: 'client_flow',
  openerRole: 'customer',
  kind: 'refund',
  description: '交付的首页在手机上仍然错位',
  status: 'submitted',
  liableParty: null,
  claimAmountFen: 1000,
  claimAmountCny: '10.00',
  refundAmountFen: 0,
  refundAmountCny: '0.00',
  compensationAmountFen: 0,
  compensationAmountCny: '0.00',
  providerRefundId: null,
  providerDepositConfirmId: null,
  resolutionNote: null,
  resolvedBy: null,
  resolvedAt: null,
  decisionDeadlineAt: null,
  customerDecision: null,
  customerDecidedAt: null,
  developerDecision: null,
  developerDecidedAt: null,
  createdAt: '2026-09-19 00:13:14',
  updatedAt: '2026-09-19 00:13:14',
  windowClosesAt: '2026-09-18 00:13:13',
  viewerRole: 'customer',
}

let wrapper: VueWrapper | undefined

async function open(
  payload: Partial<AfterSalesCaseList> = {},
  propOverrides: Partial<typeof baseProps> = {},
) {
  mocks.list.mockResolvedValue({
    items: [],
    windowOpen: true,
    windowClosesAt: '2026-10-04 00:13:13',
    ...payload,
  } satisfies AfterSalesCaseList)
  wrapper = mount(AfterSalesModal, { props: { ...baseProps, ...propOverrides, visible: false } })
  await wrapper.setProps({ visible: true })
  await flushPromises()
}

/** 按状态造一个案件：默认的 `openCase` 是需求方发起的待表态案件。 */
function caseWith(status: AfterSalesCase['status'], overrides: Partial<AfterSalesCase> = {}) {
  return { ...openCase, status, ...overrides } satisfies AfterSalesCase
}

const button = (text: string) =>
  wrapper!.findAll('button').find((item) => item.text().includes(text))

async function clickButton(text: string) {
  const target = button(text)
  expect(target, `按钮「${text}」应该存在`).toBeDefined()
  await target!.trigger('click')
  await flushPromises()
}

const hasForm = () => wrapper!.find('.after-sales-modal textarea').exists()
const submitButton = () => button('提交售后申请')

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('售后弹窗的窗口守卫', () => {
  it('窗口关闭且没有案件时不再给出发起表单，改为中文说明', async () => {
    await open({ windowOpen: false, windowClosesAt: '2026-09-18 00:13:13' })
    expect(hasForm()).toBe(false)
    expect(submitButton()).toBeUndefined()
    expect(wrapper!.text()).toContain('售后窗口已于 09/18 00:13 关闭')
    expect(wrapper!.text()).not.toContain('提交售后申请')
  })

  it('窗口关闭时间缺失时退化为通用措辞，不留空白提示', async () => {
    await open({ windowOpen: false, windowClosesAt: null })
    expect(hasForm()).toBe(false)
    expect(wrapper!.text()).toContain('本需求的售后窗口已关闭')
    expect(wrapper!.text()).not.toContain('时间未知')
  })

  it('窗口还开着时照旧渲染发起表单', async () => {
    await open({ windowOpen: true })
    expect(hasForm()).toBe(true)
    expect(submitButton()).toBeDefined()
    expect(wrapper!.text()).not.toContain('不再受理新的售后申请')
  })

  it('窗口状态未知（老后端）时不拦发起表单，保留后端 409 兜底', async () => {
    await open({ windowOpen: null })
    expect(hasForm()).toBe(true)
    expect(submitButton()).toBeDefined()
  })

  it('窗口关闭但仍有在办案件时展示案件与表态，不显示关闭说明', async () => {
    await open({ windowOpen: false, items: [openCase] })
    expect(wrapper!.text()).toContain('AFTERSALES_1')
    expect(wrapper!.text()).not.toContain('不再受理新的售后申请')
    expect(hasForm()).toBe(false)
  })
})

describe('售后弹窗的表态与落实确认', () => {
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
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AfterSalesModal from '@/components/AfterSalesModal.vue'
import type {
  AfterSalesCase,
  AfterSalesCaseDetail,
  AfterSalesCaseList,
  AfterSalesNegotiation,
} from '@/api/afterSales'

/** 售后窗口关闭后不该再渲染发起表单：填完必然被后端 409 拒绝，等于死入口。 */
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  open: vi.fn(),
  respond: vi.fn(),
  withdraw: vi.fn(),
  detail: vi.fn(),
  propose: vi.fn(),
  respondProposal: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/afterSales', () => ({
  listMyAfterSalesCases: mocks.list,
  openAfterSalesCase: mocks.open,
  respondAfterSalesCase: mocks.respond,
  withdrawAfterSalesCase: mocks.withdraw,
  getAfterSalesCase: mocks.detail,
  proposeAfterSalesNegotiation: mocks.propose,
  respondAfterSalesNegotiation: mocks.respondProposal,
}))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ showToast: mocks.toast }) }))

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

/** 详情接口的默认返回：没有协商记录、已缴尾款 30 元（还价额度的上限）。 */
const detailBase: AfterSalesCaseDetail = {
  ...openCase,
  customerUsername: 'client_flow',
  developerUsername: 'dev_flow',
  frozenDepositFen: 20000,
  frozenDepositCny: '200.00',
  finalPaidFen: 3000,
  finalPaidCny: '30.00',
  negotiations: [],
  pendingNegotiation: null,
}

/** 造一条协商记录：默认是需求方提出的待表态提议，只谈退款、不涉及赔付。 */
function negotiationWith(overrides: Partial<AfterSalesNegotiation> = {}): AfterSalesNegotiation {
  return {
    id: 7,
    caseId: openCase.id,
    initiatedBy: 'customer',
    refundAmountFen: 2000,
    refundAmountCny: '20.00',
    compensationAmountFen: 0,
    compensationAmountCny: '0.00',
    note: '返工了一半，希望退 20 元',
    status: 'pending',
    respondedBy: null,
    responseNote: null,
    createdAt: '2026-09-19 00:20:00',
    respondedAt: null,
    ...overrides,
  }
}

async function open(
  payload: Partial<AfterSalesCaseList> = {},
  propOverrides: Partial<typeof baseProps> = {},
  detail: Partial<AfterSalesCaseDetail> = {},
) {
  mocks.list.mockResolvedValue({
    items: [],
    windowOpen: true,
    windowClosesAt: '2026-10-04 00:13:13',
    ...payload,
  } satisfies AfterSalesCaseList)
  // 详情接口只在有在办案件时被调用；默认给一份「无协商记录」的详情，各用例只覆盖需要的字段。
  mocks.detail.mockResolvedValue({ ...detailBase, ...detail } satisfies AfterSalesCaseDetail)
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

describe('售后弹窗的还价协商', () => {
  /** 开发者视角：既能对诉求表态，也能就退款额度还价。 */
  const developerProps = { canOpenCase: false, currentUsername: 'dev_flow' }
  const developerView = { viewerRole: 'developer' as const }

  beforeEach(() => {
    mocks.propose.mockResolvedValue(caseWith('negotiating'))
    mocks.respondProposal.mockResolvedValue(caseWith('processing'))
    mocks.respond.mockResolvedValue(caseWith('processing'))
    mocks.withdraw.mockResolvedValue(caseWith('withdrawn'))
  })

  it('对方提的还价：展示额度与说明，同意 / 拒绝各按对应动作提交', async () => {
    const pending = negotiationWith()
    await open({ items: [caseWith('negotiating', developerView)] }, developerProps, {
      negotiations: [pending],
      pendingNegotiation: pending,
    })
    expect(wrapper!.text()).toContain('当前还价提议')
    expect(wrapper!.text()).toContain('返工了一半，希望退 20 元')

    await clickButton('接受提议')
    expect(mocks.respondProposal).toHaveBeenCalledWith('token', openCase.id, 'accept')

    await open({ items: [caseWith('negotiating', developerView)] }, developerProps, {
      negotiations: [pending],
      pendingNegotiation: pending,
    })
    await clickButton('拒绝提议')
    expect(mocks.respondProposal).toHaveBeenLastCalledWith('token', openCase.id, 'reject')
  })

  it('自己提的还价：入口是「改我的还价」，不给自己同意自己的按钮', async () => {
    const pending = negotiationWith({ initiatedBy: 'developer', refundAmountFen: 1500 })
    await open({ items: [caseWith('negotiating', developerView)] }, developerProps, {
      negotiations: [pending],
      pendingNegotiation: pending,
    })
    expect(button('接受提议')).toBeUndefined()
    expect(button('拒绝提议')).toBeUndefined()
    expect(button('改我的还价')).toBeDefined()
  })

  it('展开还价表单预填自己的额度，提交时按分提交两个额度与说明', async () => {
    const pending = negotiationWith({ initiatedBy: 'developer', refundAmountFen: 1500 })
    await open({ items: [caseWith('negotiating', developerView)] }, developerProps, {
      negotiations: [pending],
      pendingNegotiation: pending,
    })
    await clickButton('改我的还价')
    const amount = wrapper!.find('.after-sales-modal__field input')
    expect((amount.element as HTMLInputElement).value).toBe('15.00')

    await amount.setValue('18.5')
    await wrapper!.find('.after-sales-modal__field textarea').setValue('最多退 18.5')
    await clickButton('提交还价')
    expect(mocks.propose).toHaveBeenCalledWith('token', openCase.id, 1850, 0, '最多退 18.5')
  })

  it('还价额度超过已缴尾款时本方先拦下，不发请求', async () => {
    await open({ items: [caseWith('submitted', developerView)] }, developerProps)
    await clickButton('提一个还价')
    await wrapper!.find('.after-sales-modal__field input').setValue('31')
    await clickButton('提交还价')

    expect(mocks.propose).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('退还尾款不能超过已缴尾款 30.00 元', 'warning')
  })

  it('还价带保证金赔付：预填自己的赔付额度并按两个额度一起提交', async () => {
    const pending = negotiationWith({
      initiatedBy: 'developer',
      refundAmountFen: 1000,
      refundAmountCny: '10.00',
      compensationAmountFen: 5000,
      compensationAmountCny: '50.00',
    })
    await open({ items: [caseWith('negotiating', developerView)] }, developerProps, {
      negotiations: [pending],
      pendingNegotiation: pending,
    })
    await clickButton('改我的还价')
    const inputs = wrapper!.findAll('.after-sales-modal__field input')
    expect(inputs).toHaveLength(2)
    const [refundInput, compensationInput] = inputs
    expect((refundInput!.element as HTMLInputElement).value).toBe('10.00')
    expect((compensationInput!.element as HTMLInputElement).value).toBe('50.00')

    await refundInput!.setValue('12')
    await compensationInput!.setValue('60')
    await wrapper!.find('.after-sales-modal__field textarea').setValue('退 12 元 + 赔 60 元')
    await clickButton('提交还价')
    expect(mocks.propose).toHaveBeenCalledWith('token', openCase.id, 1200, 6000, '退 12 元 + 赔 60 元')
  })

  it('还价里的赔付额度超过冻结保证金时本方先拦下，不发请求', async () => {
    await open({ items: [caseWith('submitted', developerView)] }, developerProps)
    await clickButton('提一个还价')
    // 冻结保证金 200 元：赔付填 201 元必被后端拒，这里先拦。
    await wrapper!.findAll('.after-sales-modal__field input')[1]!.setValue('201')
    await clickButton('提交还价')

    expect(mocks.propose).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('保证金赔付不能超过仍冻结的 200.00 元', 'warning')
  })

  it('对方手里有未决提议时不给本方重提入口，避免必然 409', async () => {
    const pending = negotiationWith()
    await open({ items: [caseWith('negotiating', developerView)] }, developerProps, {
      negotiations: [pending],
      pendingNegotiation: pending,
    })
    expect(button('提一个还价')).toBeUndefined()
    expect(button('改我的还价')).toBeUndefined()
  })

  it('资金执行中不再给还价入口（钱已经在动）', async () => {
    await open({ items: [caseWith('processing', developerView)] }, developerProps)
    expect(button('提一个还价')).toBeUndefined()
  })

  it('协商记录按轮次展示提议方、额度与表态去向', async () => {
    await open({ items: [caseWith('submitted', developerView)] }, developerProps, {
      negotiations: [
        negotiationWith({
          id: 9,
          status: 'accepted',
          respondedBy: 'dev_flow',
          responseNote: '接受，退款就行',
        }),
        negotiationWith({
          id: 8,
          initiatedBy: 'developer',
          refundAmountFen: 1000,
          refundAmountCny: '10.00',
          status: 'rejected',
          respondedBy: 'client_flow',
          responseNote: '太少',
        }),
      ],
      pendingNegotiation: null,
    })
    const text = wrapper!.text()
    expect(text).toContain('协商记录')
    expect(text).toContain('共 2 条')
    expect(text).toContain('对方（需求方）提出还价：退还尾款 20.00 元')
    expect(text).toContain('已达成一致：接受，退款就行')
    expect(text).toContain('我方（开发者）提出还价：退还尾款 10.00 元')
    expect(text).toContain('未达成：太少')
  })
})

describe('售后弹窗的返工中状态', () => {
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

  it('返工中不给对方任何入口：案子在等发起人验收，也不允许再还价', async () => {
    await open({ items: [caseWith('rework_pending', developerView)] }, developerProps)
    expect(button('确认已落实')).toBeUndefined()
    expect(button('未落实，申请平台介入')).toBeUndefined()
    expect(button('接受诉求')).toBeUndefined()
    expect(button('提一个还价')).toBeUndefined()
    expect(wrapper!.text()).toContain('对方已接受返工要求')
  })

  it('「待确认落实」的赔偿诉求上不发未落实：没有可验收的中间产物', async () => {
    await open({ items: [caseWith('agreed', { kind: 'compensation', viewerRole: 'customer' })] })
    expect(button('确认已落实')).toBeDefined()
    expect(button('未落实，申请平台介入')).toBeUndefined()
  })
})

describe('售后弹窗的诉求额度', () => {
  it('四类诉求都能填诉求额度，文案跟着诉求类型走', async () => {
    await open()
    expect(wrapper!.text()).toContain('返工不成时希望退还的尾款（元）')
    expect(wrapper!.text()).toContain('作为平台裁决的参考')

    await clickButton('要求赔偿')
    expect(wrapper!.text()).toContain('希望赔偿的金额（元）')

    await clickButton('其它问题')
    expect(wrapper!.text()).toContain('希望平台处理的金额（元）')
  })
})

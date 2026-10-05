import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AfterSalesModal from '@/components/AfterSalesModal.vue'
import type { AfterSalesCase, AfterSalesCaseDetail, AfterSalesCaseList } from '@/api/afterSales'

/** 售后窗口关闭后不该再渲染发起表单：填完必然被后端 409 拒绝，等于死入口。 */
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  open: vi.fn(),
  respond: vi.fn(),
  withdraw: vi.fn(),
  detail: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/afterSales', () => ({
  listMyAfterSalesCases: mocks.list,
  openAfterSalesCase: mocks.open,
  respondAfterSalesCase: mocks.respond,
  withdrawAfterSalesCase: mocks.withdraw,
  getAfterSalesCase: mocks.detail,
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
  expectsMoney: true,
  expectsRework: false,
  requiresRework: false,
  description: '交付的首页在手机上仍然错位',
  status: 'submitted',
  liableParty: null,
  claimAmountFen: 1000,
  claimAmountCny: '10.00',
  refundAmountFen: 0,
  refundAmountCny: '0.00',
  compensationAmountFen: 0,
  compensationAmountCny: '0.00',
  shortfallFen: 0,
  shortfallCny: '0.00',
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

/** 详情接口的默认返回：已缴尾款 30 元、仍冻结接单保证金 200 元（两个资金上限）。 */
const detailBase: AfterSalesCaseDetail = {
  ...openCase,
  customerUsername: 'client_flow',
  developerUsername: 'dev_flow',
  frozenDepositFen: 20000,
  frozenDepositCny: '200.00',
  finalPaidFen: 3000,
  finalPaidCny: '30.00',
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
  // 详情接口只在有在办案件时被调用；默认给一份完整的详情，各用例只覆盖需要的字段。
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

/** 期望多选的第一个勾选项（要一笔钱回来）与金额输入框。 */
const expectsMoneyBox = () => wrapper!.findAll<HTMLInputElement>('input[type="checkbox"]')[0]!
const expectsReworkBox = () => wrapper!.findAll<HTMLInputElement>('input[type="checkbox"]')[1]!
const amountInput = () => wrapper!.find('input[type="number"]')

describe('售后弹窗的期望（要钱 / 返工 / 只反馈）', () => {
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
    await clickButton('提交售后申请')
    expect(mocks.open).toHaveBeenCalledWith('token', baseProps.requirementId, true, false, '首页在手机上错位', 1250)

    vi.resetAllMocks()
    mocks.list.mockResolvedValue({ items: [], windowOpen: true, windowClosesAt: null })
    await open()
    await expectsMoneyBox().setValue(false)
    await expectsReworkBox().setValue(true)
    await wrapper!.find('.after-sales-modal textarea').setValue('请把首页重做一遍')
    await clickButton('提交售后申请')
    expect(mocks.open).toHaveBeenCalledWith('token', baseProps.requirementId, false, true, '请把首页重做一遍', 0)
  })
})

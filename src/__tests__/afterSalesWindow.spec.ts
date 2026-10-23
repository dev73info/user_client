import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AfterSalesModal from '@/components/AfterSalesModal.vue'
import type { AfterSalesCase, AfterSalesCaseDetail, AfterSalesCaseList } from '@/api/afterSales'

/** 解除合作窗口关闭后不该再渲染发起表单：填完必然被后端 409 拒绝，等于死入口。 */
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

const baseProps = {
  token: 'token',
  currentUsername: 'client_flow',
  requirementId: '2026-900000000105',
  requirementTitle: '主流程验证',
  /** 需求预算（元）：主张金额的上限；默认给 null（不限制），上限用例各自覆盖。 */
  requirementBudget: null as number | null,
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

/** 详情接口的默认返回：已缴尾款 30 元、仍冻结接单保证金 200 元、需求预算 200 元（赔付上限取其小）。 */
const detailBase: AfterSalesCaseDetail = {
  ...openCase,
  customerUsername: 'client_flow',
  developerUsername: 'dev_flow',
  frozenDepositFen: 20000,
  frozenDepositCny: '200.00',
  budgetFen: 20000,
  budgetCny: '200.00',
  compensationCapFen: 20000,
  compensationCapCny: '200.00',
  finalPaidFen: 3000,
  finalPaidCny: '30.00',
  refundablePaidFen: 3000,
  refundablePaidCny: '30.00',
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
const submitButton = () => button('提交解除合作申请')

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('解除合作弹窗的窗口守卫', () => {
  it('窗口关闭且没有案件时不再给出发起表单，改为中文说明', async () => {
    await open({ windowOpen: false, windowClosesAt: '2026-09-18 00:13:13' })
    expect(hasForm()).toBe(false)
    expect(submitButton()).toBeUndefined()
    expect(wrapper!.text()).toContain('解除合作窗口已于 09/18 00:13 关闭')
    expect(wrapper!.text()).not.toContain('提交解除合作申请')
  })

  it('窗口关闭时间缺失时退化为通用措辞，不留空白提示', async () => {
    await open({ windowOpen: false, windowClosesAt: null })
    expect(hasForm()).toBe(false)
    expect(wrapper!.text()).toContain('本需求的解除合作窗口已关闭')
    expect(wrapper!.text()).not.toContain('时间未知')
  })

  it('窗口还开着时照旧渲染发起表单', async () => {
    await open({ windowOpen: true })
    expect(hasForm()).toBe(true)
    expect(submitButton()).toBeDefined()
    expect(wrapper!.text()).not.toContain('不再受理新的解除合作申请')
  })

  it('窗口状态未知（老后端）时不拦发起表单，保留后端 409 兜底', async () => {
    await open({ windowOpen: null })
    expect(hasForm()).toBe(true)
    expect(submitButton()).toBeDefined()
  })

  it('动过钱的收口案件不再给发起表单，改为「联系客服重开」说明', async () => {
    // 退过钱 / 赔过钱的结案才是终态：说明里要写清是哪一笔，用户才知道为什么不能自助发起。
    await open({
      windowOpen: true,
      items: [
        caseWith('succeeded', {
          refundAmountFen: 2000,
          refundAmountCny: '20.00',
          providerRefundId: 'REF_1',
        }),
      ],
    })
    expect(hasForm()).toBe(false)
    expect(submitButton()).toBeUndefined()
    expect(wrapper!.text()).toContain('已有裁决结果的解除合作案件')
    expect(wrapper!.text()).toContain('退还客户已付款 20.00 元')
    expect(wrapper!.text()).toContain('联系平台客服重开')
  })

  it('认定但渠道没受理的资金不写成「已执行」：赔付留在「尚未执行」那一行', async () => {
    // 实测形态：退款已退（有渠道单号）、赔付卡在需求方缺结算账户（案件停在需人工处理）。
    // 案件行上两笔额度都已写好，但只有带渠道单号的那一笔算执行过。
    await open({
      windowOpen: true,
      items: [
        caseWith('manual_required', {
          refundAmountFen: 16000,
          refundAmountCny: '160.00',
          providerRefundId: 'REF_160',
          compensationAmountFen: 20000,
          compensationAmountCny: '200.00',
          claimAmountFen: 200000,
          claimAmountCny: '2000.00',
          shortfallFen: 164000,
          shortfallCny: '1640.00',
        }),
      ],
    })

    const factValue = (label: string) => {
      const row = wrapper!
        .findAll('.after-sales-modal__facts > div')
        .find((item) => item.find('dt').text() === label)
      return row ? row.find('dd').text() : undefined
    }

    expect(factValue('已执行资金')).toBe('退还客户已付款 160.00 元')
    expect(factValue('本次认定（尚未执行）')).toContain('保证金赔付 200.00 元')
    expect(factValue('本次认定（尚未执行）')).toContain('转人工')
    // 差额按已执行的那 160 元算，不能把没落地的 200 元也算成「已执行」。
    expect(factValue('诉求差额')).toContain('本次共执行 ¥160.00 元')
  })

  it('没动过钱的结案仍可自助重新发起：结论里没有钱可翻，表单照旧渲染', async () => {
    await open({ windowOpen: true, items: [caseWith('succeeded')] })
    expect(hasForm()).toBe(true)
    expect(submitButton()).toBeDefined()
    expect(wrapper!.text()).toContain('上次解除合作')
  })

  it('已驳回的案件同样可以自助重新发起：驳回本就不执行资金', async () => {
    await open({ windowOpen: true, items: [caseWith('rejected')] })
    expect(hasForm()).toBe(true)
    expect(submitButton()).toBeDefined()
    expect(wrapper!.text()).not.toContain('联系平台客服重开')
  })

  it('已撤回的案件不算裁决结果：窗口内仍可重新发起，表单照旧渲染', async () => {
    await open({ windowOpen: true, items: [caseWith('withdrawn')] })
    expect(hasForm()).toBe(true)
    expect(submitButton()).toBeDefined()
  })

  it('窗口关闭但仍有在办案件时展示案件与表态，不显示关闭说明', async () => {
    await open({ windowOpen: false, items: [openCase] })
    expect(wrapper!.text()).toContain('AFTERSALES_1')
    expect(wrapper!.text()).not.toContain('不再受理新的解除合作申请')
    expect(hasForm()).toBe(false)
  })
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AfterSalesModal from '@/components/AfterSalesModal.vue'
import type { AfterSalesCase, AfterSalesCaseList } from '@/api/afterSales'

/** 售后窗口关闭后不该再渲染发起表单：填完必然被后端 409 拒绝，等于死入口。 */
const mocks = vi.hoisted(() => ({ list: vi.fn(), open: vi.fn() }))

vi.mock('@/api/afterSales', () => ({
  listMyAfterSalesCases: mocks.list,
  openAfterSalesCase: mocks.open,
  respondAfterSalesCase: vi.fn(),
  withdrawAfterSalesCase: vi.fn(),
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

async function open(payload: Partial<AfterSalesCaseList> = {}) {
  mocks.list.mockResolvedValue({
    items: [],
    windowOpen: true,
    windowClosesAt: '2026-10-04 00:13:13',
    ...payload,
  } satisfies AfterSalesCaseList)
  wrapper = mount(AfterSalesModal, { props: { ...baseProps, visible: false } })
  await wrapper.setProps({ visible: true })
  await flushPromises()
}

const hasForm = () => wrapper!.find('.after-sales-modal textarea').exists()
const submitButton = () =>
  wrapper!.findAll('button').find((button) => button.text().includes('提交售后申请'))

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

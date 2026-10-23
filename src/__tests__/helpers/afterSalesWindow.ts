import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { Mock } from 'vitest'
import type { AfterSalesCase, AfterSalesCaseDetail, AfterSalesCaseList } from '@/api/afterSales'
import AfterSalesModal from '@/components/AfterSalesModal.vue'

/**
 * 解除合作弹窗（AfterSalesModal）的共享夹具。
 *
 * `vi.mock` 是文件级注册，拆分后的每份 spec 各自 `vi.hoisted` 建一份 mocks 再登记；
 * 这里只放与 mock 实例无关的夹具和「基于某个 wrapper 的操作」，
 * 各 spec 仍各自持有 `let wrapper` 与 `open()`，这样用例正文（含断言）可以逐字不动。
 */
export type AfterSalesMocks = {
  list: Mock
  open: Mock
  respond: Mock
  withdraw: Mock
  detail: Mock
  toast: Mock
}

export const baseProps = {
  token: 'token',
  currentUsername: 'client_flow',
  requirementId: '2026-900000000105',
  requirementTitle: '主流程验证',
  /** 需求预算（元）：主张金额的上限；默认给 null（不限制），上限用例各自覆盖。 */
  requirementBudget: null as number | null,
  canOpenCase: true,
}

export const openCase: AfterSalesCase = {
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

/** 详情接口的默认返回：已缴尾款 30 元、仍冻结接单保证金 200 元、需求预算 200 元（赔付上限取其小）。 */
export const detailBase: AfterSalesCaseDetail = {
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

/** 按状态造一个案件：默认的 `openCase` 是需求方发起的待表态案件。 */
export function caseWith(
  status: AfterSalesCase['status'],
  overrides: Partial<AfterSalesCase> = {},
) {
  return { ...openCase, status, ...overrides } satisfies AfterSalesCase
}

/** 把列表与详情接口的返回值铺好，再按 `visible: false → true` 的顺序挂载（触发一次完整的打开链路）。 */
export async function mountAfterSales(
  mocks: AfterSalesMocks,
  payload: Partial<AfterSalesCaseList> = {},
  propOverrides: Partial<typeof baseProps> = {},
  detail: Partial<AfterSalesCaseDetail> = {},
): Promise<VueWrapper> {
  mocks.list.mockResolvedValue({
    items: [],
    windowOpen: true,
    windowClosesAt: '2026-10-04 00:13:13',
    ...payload,
  } satisfies AfterSalesCaseList)
  // 详情接口只在有在办案件时被调用；默认给一份完整的详情，各用例只覆盖需要的字段。
  mocks.detail.mockResolvedValue({ ...detailBase, ...detail } satisfies AfterSalesCaseDetail)
  const wrapper = mount(AfterSalesModal, {
    props: { ...baseProps, ...propOverrides, visible: false },
  })
  await wrapper.setProps({ visible: true })
  await flushPromises()
  return wrapper
}

export const findButton = (wrapper: VueWrapper, text: string) =>
  wrapper.findAll('button').find((item) => item.text().includes(text))

export const hasFormOn = (wrapper: VueWrapper) =>
  wrapper.find('.after-sales-modal textarea').exists()

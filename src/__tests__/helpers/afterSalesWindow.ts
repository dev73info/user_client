import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { Mock } from 'vitest'
import type { AfterSalesCaseDetail, AfterSalesCaseSummary } from '@/api/afterSales'
import AfterSalesModal from '@/components/AfterSalesModal.vue'

/**
 * 解除合作弹窗的测试夹具：字段全部照契约（`CaseSummaryResponse` / `CaseDetailResponse`），
 * 金额只写 `*_fen`，时间写后端已排好的东八区串。
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
  canOpenCase: true,
}

export const openCase: AfterSalesCaseSummary = {
  case_no: 'AFTERSALES_1',
  requirement_id: baseProps.requirementId,
  filed_by: 'client_flow',
  respondent: 'dev_flow',
  kind: 'mutual_unbind',
  kind_label: '协商解除',
  status: 'negotiating',
  status_label: '协商中',
  open: true,
  claim_amount_fen: 1000,
  claim_amount: 10,
  created_time: '2026-09-19 00:13:14',
  updated_time: '2026-09-19 00:13:14',
}

export const detailBase: AfterSalesCaseDetail = {
  ...openCase,
  claim_note: '交付的首页在手机上仍然错位',
  statements: [],
  verdict: null,
  closed_time: null,
  handled_by: null,
  handled_time: null,
  mutual_agreed_time: null,
}

export function caseWith(
  status: string,
  overrides: Partial<AfterSalesCaseSummary> = {},
): AfterSalesCaseSummary {
  return { ...openCase, status, status_label: status, ...overrides }
}

export async function mountAfterSales(
  mocks: AfterSalesMocks,
  payload: AfterSalesCaseSummary[] = [],
  propOverrides: Partial<typeof baseProps> = {},
  detail: Partial<AfterSalesCaseDetail> = {},
): Promise<VueWrapper> {
  mocks.list.mockResolvedValue(payload)
  mocks.detail.mockResolvedValue({ ...detailBase, ...detail })
  const wrapper = mount(AfterSalesModal, {
    props: { ...baseProps, ...propOverrides, visible: false },
  })
  await wrapper.setProps({ visible: true })
  await flushPromises()
  return wrapper
}

export const findButton = (wrapper: VueWrapper, text: string) =>
  wrapper.findAll('button').find((item) => item.text().includes(text))

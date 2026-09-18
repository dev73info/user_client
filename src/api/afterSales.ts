import { authHeader, requestJson } from '@/api/http'

/** 售后诉求类型：要求退款 / 要求赔偿 / 要求返工 / 其它。 */
export type AfterSalesKind = 'refund' | 'compensation' | 'repair' | 'other'

/** 售后案件状态。`manual_required` 是渠道扣划失败或超时无人处理后的兜底状态。 */
export type AfterSalesStatus =
  | 'submitted'
  | 'negotiating'
  | 'processing'
  | 'succeeded'
  | 'rejected'
  | 'withdrawn'
  | 'manual_required'

/** 案件里的身份：需求方（甲方）/ 开发者（乙方）。 */
export type AfterSalesPartyRole = 'customer' | 'developer'

/** 表态动作：接受对方诉求 / 不接受并交平台裁决。 */
export type AfterSalesRespondAction = 'accept' | 'reject'

export type AfterSalesCase = {
  id: number
  caseNo: string
  requirementId: string
  requirementTitle: string
  requirementStatus: string
  openedBy: string
  openerRole: AfterSalesPartyRole
  kind: AfterSalesKind
  description: string
  status: AfterSalesStatus
  liableParty: AfterSalesPartyRole | 'mutual' | null
  claimAmountFen: number
  claimAmountCny: string
  refundAmountFen: number
  refundAmountCny: string
  compensationAmountFen: number
  compensationAmountCny: string
  providerRefundId: string | null
  providerDepositConfirmId: string | null
  resolutionNote: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  decisionDeadlineAt: string | null
  customerDecision: AfterSalesRespondAction | null
  customerDecidedAt: string | null
  developerDecision: AfterSalesRespondAction | null
  developerDecidedAt: string | null
  createdAt: string
  updatedAt: string
  /** 售后窗口关闭时间（结单时间 + 售后窗口天数）。 */
  windowClosesAt: string | null
  /** 当前登录人在本案件里的身份；无关方为空。 */
  viewerRole: AfterSalesPartyRole | null
}

export type AfterSalesCaseList = {
  items: AfterSalesCase[]
}

/** 发起售后申请；`claimAmountFen` 是诉求额度（分），只有退款型诉求才该大于 0。 */
export async function openAfterSalesCase(
  token: string,
  requirementId: string,
  kind: AfterSalesKind,
  description: string,
  claimAmountFen = 0,
): Promise<AfterSalesCase> {
  return requestJson<AfterSalesCase>(
    `/after-sales/requirements/${encodeURIComponent(requirementId)}/cases`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      // 后端 `OpenAfterSalesCaseRequest` 未做 camelCase 重命名，字段名与之逐字对应；
      // 写成 claimAmountFen 会被 serde 静默忽略成 0，退款型诉求就退不出钱了。
      body: JSON.stringify({ kind, description, claim_amount_fen: claimAmountFen }),
    },
    '发起售后申请失败',
  )
}

/** 查询本人参与的售后案件；传 requirementId 时只返回该需求的案件。 */
export async function listMyAfterSalesCases(
  token: string,
  requirementId?: string,
): Promise<AfterSalesCaseList> {
  const query = requirementId ? `?requirementId=${encodeURIComponent(requirementId)}` : ''
  return requestJson<AfterSalesCaseList>(
    `/after-sales/cases${query}`,
    {
      headers: authHeader(token),
    },
    '加载售后案件失败',
  )
}

export async function getAfterSalesCase(token: string, caseId: number): Promise<AfterSalesCase> {
  return requestJson<AfterSalesCase>(
    `/after-sales/cases/${caseId}`,
    {
      headers: authHeader(token),
    },
    '加载售后案件详情失败',
  )
}

/** 对售后诉求表态：接受 → 双方一致；不接受 → 转平台裁决。 */
export async function respondAfterSalesCase(
  token: string,
  caseId: number,
  action: AfterSalesRespondAction,
  note = '',
): Promise<AfterSalesCase> {
  return requestJson<AfterSalesCase>(
    `/after-sales/cases/${caseId}/respond`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ action, note }),
    },
    '提交售后表态失败',
  )
}

/** 发起人在平台裁决前撤回售后申请。 */
export async function withdrawAfterSalesCase(
  token: string,
  caseId: number,
): Promise<AfterSalesCase> {
  return requestJson<AfterSalesCase>(
    `/after-sales/cases/${caseId}/withdraw`,
    {
      method: 'POST',
      headers: authHeader(token),
    },
    '撤回售后申请失败',
  )
}

import { authHeader, requestJson } from '@/api/http'

/** 售后诉求类型：要求退款 / 要求赔偿 / 要求返工 / 其它。 */
export type AfterSalesKind = 'refund' | 'compensation' | 'repair' | 'other'

/** 售后案件状态。`manual_required` 是渠道扣划失败或超时无人处理后的兜底状态。 */
export type AfterSalesStatus =
  | 'submitted'
  | 'negotiating'
  | 'support_reviewing'
  | 'processing'
  | 'agreed'
  | 'manual_required'
  | 'succeeded'
  | 'rejected'
  | 'withdrawn'

/** 案件里的身份：需求方（甲方）/ 开发者（乙方）。 */
export type AfterSalesPartyRole = 'customer' | 'developer'

/** 表态动作：接受对方诉求 / 不接受并交平台裁决 / 发起人确认诉求已落实。 */
export type AfterSalesRespondAction = 'accept' | 'reject' | 'complete'

/** 协商提议的动作：同意提议（按提议额度执行）/ 拒绝提议（作废，可改额度重提）。 */
export type AfterSalesNegotiationAction = 'accept' | 'reject'

/** 一条协商提议（售后版的还价记录）。 */
export type AfterSalesNegotiation = {
  id: number
  caseId: number
  /** 提议方身份：需求方 / 开发者。 */
  initiatedBy: AfterSalesPartyRole
  /** 提议愿意原路退还的尾款额度（分）。 */
  refundAmountFen: number
  refundAmountCny: string
  note: string
  /** `pending` 待对方表态 / `accepted` 对方已同意 / `rejected` 已拒绝或已作废。 */
  status: 'pending' | 'accepted' | 'rejected'
  respondedBy: string | null
  responseNote: string | null
  createdAt: string
  respondedAt: string | null
}

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

/** 案件详情：案件本身 + 双方用户名 + 两个资金上限 + 协商记录。 */
export type AfterSalesCaseDetail = AfterSalesCase & {
  customerUsername: string
  developerUsername: string
  /** 结单后仍冻结的接单保证金（分）：赔付上限，赔付只能由平台裁决给出。 */
  frozenDepositFen: number
  frozenDepositCny: string
  /** 已缴尾款（分）：原路退款上限，也是协商还价的额度上限。 */
  finalPaidFen: number
  finalPaidCny: string
  /** 协商记录（最新在前）。 */
  negotiations: AfterSalesNegotiation[]
  /** 当前未决提议；没有时为 null。 */
  pendingNegotiation: AfterSalesNegotiation | null
}

export type AfterSalesCaseList = {
  items: AfterSalesCase[]
  /** 按需求查询时：该需求是否仍在售后窗口内（服务端判定，客户端不自己比时间）；否则为 null。 */
  windowOpen: boolean | null
  /** 按需求查询时：该需求的售后窗口关闭时间；需求未结单时为 null。 */
  windowClosesAt: string | null
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

/**
 * 加载售后案件详情：比列表多出双方用户名、两个资金上限（冻结保证金 / 已缴尾款）
 * 与协商记录，售后弹窗据此渲染还价的额度上限与历史。
 */
export async function getAfterSalesCase(
  token: string,
  caseId: number,
): Promise<AfterSalesCaseDetail> {
  return requestJson<AfterSalesCaseDetail>(
    `/after-sales/cases/${caseId}`,
    {
      headers: authHeader(token),
    },
    '加载售后案件详情失败',
  )
}

/**
 * 就退款额度发起协商提议（还价）：需求方提 = 下调自己的诉求额度，开发者提 = 还价。
 * 同一方再次发起即视为改主意（旧提议作废），对方持有的未决提议顶不掉（返回 409）。
 */
export async function proposeAfterSalesNegotiation(
  token: string,
  caseId: number,
  refundAmountFen: number,
  note = '',
): Promise<AfterSalesCase> {
  return requestJson<AfterSalesCase>(
    `/after-sales/cases/${caseId}/negotiation`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      // 后端 `ProposeAfterSalesNegotiationRequest` 未做 camelCase 重命名，字段名逐字对应。
      body: JSON.stringify({ refund_amount_fen: refundAmountFen, note }),
    },
    '提交协商提议失败',
  )
}

/**
 * 对协商提议表态：`accept` 同意 → 按提议额度原路退还尾款结案（额度为 0 时转「待确认落实」）；
 * `reject` 拒绝 → 提议作废，双方可改额度重新提议。
 */
export async function respondAfterSalesNegotiation(
  token: string,
  caseId: number,
  action: AfterSalesNegotiationAction,
  note = '',
): Promise<AfterSalesCase> {
  return requestJson<AfterSalesCase>(
    `/after-sales/cases/${caseId}/negotiation/respond`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ action, note }),
    },
    '提交协商表态失败',
  )
}

/**
 * 对售后诉求表态：`accept` 接受 → 有资金动作的诉求（要求退款且带额度）当场按诉求退款，
 * 其余转「待确认落实」等发起人确认；`reject` 不接受 → 转平台裁决；
 * `complete` 是发起人确认诉求已落实（仅「待确认落实」状态与发起人本人可用）。
 */
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

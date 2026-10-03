import { authHeader, requestJson } from '@/api/http'

/** 售后诉求类型：要求退款 / 要求赔偿 / 要求返工 / 其它。 */
export type AfterSalesKind = 'refund' | 'compensation' | 'repair' | 'other'

/**
 * 售后案件状态。`manual_required` 是渠道扣划失败或超时无人处理后的兜底状态。
 *
 * 双方只能「接受诉求」或「不接受转平台裁决」，因此没有「协商中」这类中间态；
 * 历史值 `negotiating` 已随还价机制下线一并从后端状态约束里摘掉。
 */
export type AfterSalesStatus =
  | 'submitted'
  | 'support_reviewing'
  | 'processing'
  | 'agreed'
  | 'rework_pending'
  | 'manual_required'
  | 'succeeded'
  | 'rejected'
  | 'withdrawn'

/** 案件里的身份：需求方（甲方）/ 开发者（乙方）。 */
export type AfterSalesPartyRole = 'customer' | 'developer'

/**
 * 表态动作：接受对方诉求 / 不接受并交平台裁决 / 发起人确认诉求已落实 /
 * 发起人报返工未落实（仅返工中可用，转平台裁决）。
 */
export type AfterSalesRespondAction = 'accept' | 'reject' | 'complete' | 'unfulfilled'

/**
 * 一方在案件里的表态。`opened` 是发起人自己的表态——他发起时就已经表态了，
 * 诉求本身就是他的立场，所以后端在发起时把这一列写成 `opened`（时间即发起时间），
 * 面板上不会出现「发起人未表态」这种自相矛盾的读法。
 *
 * 与 [`AfterSalesRespondAction`] 不是同一套取值：`complete`（确认已落实）只用于结案，不落表态列。
 */
export type AfterSalesDecision = 'opened' | 'accept' | 'reject' | 'unfulfilled'

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
  /**
   * 赔付缺口（分）：诉求额度里因为「仍冻结的接单保证金」不够而没能赔出去的那部分。
   *
   * 只在「要求赔偿」型诉求上可能大于 0；冻结上限本身是正确口径（不能超额赔付），
   * 这个字段的作用是把差额直接摆出来，避免把「实赔 200」读成「诉求 500 已全赔」。
   */
  shortfallFen: number
  shortfallCny: string
  providerRefundId: string | null
  providerDepositConfirmId: string | null
  resolutionNote: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  decisionDeadlineAt: string | null
  /** 需求方表态：发起人本人时是 `opened`（发起诉求即表态），其余是对诉求的答复。 */
  customerDecision: AfterSalesDecision | null
  customerDecidedAt: string | null
  /** 开发者表态，同 `customerDecision`。 */
  developerDecision: AfterSalesDecision | null
  developerDecidedAt: string | null
  createdAt: string
  updatedAt: string
  /** 售后窗口关闭时间（结单时间 + 售后窗口天数）。 */
  windowClosesAt: string | null
  /** 当前登录人在本案件里的身份；无关方为空。 */
  viewerRole: AfterSalesPartyRole | null
}

/** 案件详情：案件本身 + 双方用户名 + 两个资金上限。 */
export type AfterSalesCaseDetail = AfterSalesCase & {
  customerUsername: string
  developerUsername: string
  /** 结单后仍冻结的接单保证金（分）：赔付上限。 */
  frozenDepositFen: number
  frozenDepositCny: string
  /** 已缴尾款（分）：原路退款上限。 */
  finalPaidFen: number
  finalPaidCny: string
}

export type AfterSalesCaseList = {
  items: AfterSalesCase[]
  /** 按需求查询时：该需求是否仍在售后窗口内（服务端判定，客户端不自己比时间）；否则为 null。 */
  windowOpen: boolean | null
  /** 按需求查询时：该需求的售后窗口关闭时间；需求未结单时为 null。 */
  windowClosesAt: string | null
}

/** 发起售后申请；`claimAmountFen` 是诉求额度（分），四类诉求都能填，只作为平台裁决的参考。 */
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
 * 加载售后案件详情：比列表多出双方用户名与两个资金上限（冻结保证金 / 已缴尾款），
 * 平台侧裁决据此判断退款与赔付各有多少可动。
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
 * 对售后诉求表态：`accept` 接受 → 有资金动作的诉求（要求退款且带额度）当场按诉求退款，
 * 其余转「待确认落实」（要求返工则转「返工中」）等发起人收口；`reject` 不接受 → 转平台裁决；
 * `complete` 是发起人确认诉求已落实（「待确认落实」与「返工中」都可用，发起人本人）；
 * `unfulfilled` 是发起人报返工未落实（仅「返工中」可用），转平台裁决。
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

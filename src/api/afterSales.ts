import type { components } from '@/api/generated/schema'
import { authHeader, requestJson } from '@/api/http'

type Schemas = components['schemas']

/**
 * 争议 / 解除合作域的接口层：**逐条对应** `src/api/generated/openapi.json` 里的
 * `/api/dispute/cases*`、`/api/requirement/{requirement_id}/breach-case`、
 * `/api/requirement/{requirement_id}/termination`。
 *
 * 约定：
 * - 字段一律照契约的 snake_case，类型直接取 `components['schemas'][...]`，不在这里另立一套；
 * - 金额只认 `*_fen`（整数分）；契约里的 `claim_amount` / `refund` / `forfeit` /
 *   `claim_amount_cny` 是**元**（浮点），只用于展示，不许拿来算钱；
 * - 时间是后端已排好的东八区串（`YYYY-MM-DD HH:MM:SS`），直接显示，不再 `new Date(...)` 二次换算。
 */
export type AfterSalesCaseSummary = Schemas['CaseSummaryResponse']
export type AfterSalesCaseDetail = Schemas['CaseDetailResponse']
export type AfterSalesStatement = Schemas['StatementResponse']
export type AfterSalesVerdict = Schemas['VerdictResponse']
export type RequirementBreachCase = Schemas['BreachCaseResponse']
export type RequirementBreachCaseItem = Schemas['BreachCaseItemResponse']
export type TerminationResult = Schemas['TerminationResponse']

/** 案件类型（后端 `CaseKind` 的四个取值，一个字都不能多）。 */
export type AfterSalesCaseKind =
  | 'customer_breach'
  | 'developer_breach'
  | 'mutual_unbind'
  | 'after_sales'

/** 表态动作：只有「同意」与「不同意」两支（契约 `RespondCaseRequest.action`）。 */
export type AfterSalesRespondAction = 'approve' | 'reject'

/** 立案请求体（契约 `FileCaseRequest`）。 */
export type FileAfterSalesCasePayload = {
  requirement_id: string
  kind: AfterSalesCaseKind
  /** 诉求金额（分）。缺省 0 = 不主张资金。 */
  claim_amount_fen?: number | null
  claim_note?: string | null
}

/** 案件列表的查询条件（契约 `GET /api/dispute/cases` 的三个查询参数）。 */
export type AfterSalesCaseQuery = {
  status?: string
  requirement_id?: string
  limit?: number
}

function caseQuery(query: AfterSalesCaseQuery): string {
  const params = new URLSearchParams()
  if (query.status) params.set('status', query.status)
  if (query.requirement_id) params.set('requirement_id', query.requirement_id)
  if (query.limit != null) params.set('limit', String(query.limit))
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** 我参与的争议案件（可按需求、状态过滤）。 */
export async function listMyAfterSalesCases(
  token: string,
  query: AfterSalesCaseQuery = {},
): Promise<AfterSalesCaseSummary[]> {
  return requestJson<AfterSalesCaseSummary[]>(
    `/dispute/cases${caseQuery(query)}`,
    { headers: authHeader(token) },
    '加载解除合作案件失败',
  )
}

/** 立案（`POST /api/dispute/cases`）。 */
export async function openAfterSalesCase(
  token: string,
  payload: FileAfterSalesCasePayload,
): Promise<AfterSalesCaseDetail> {
  return requestJson<AfterSalesCaseDetail>(
    '/dispute/cases',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '发起解除合作申请失败',
  )
}

/** 案件详情：摘要 + 诉求说明 + 表态流水 + 裁决。 */
export async function getAfterSalesCase(
  token: string,
  caseNo: string,
): Promise<AfterSalesCaseDetail> {
  return requestJson<AfterSalesCaseDetail>(
    `/dispute/cases/${encodeURIComponent(caseNo)}`,
    { headers: authHeader(token) },
    '加载解除合作案件详情失败',
  )
}

/**
 * 对案件表态（`POST /api/dispute/cases/{case_no}/respond`）。
 *
 * `note` 为空时不带这个字段——契约里它是可选的，空串与「不写」在表态流水里含义不同
 * （后者由后端补一句默认说明）。
 */
export async function respondAfterSalesCase(
  token: string,
  caseNo: string,
  action: AfterSalesRespondAction,
  note?: string,
): Promise<AfterSalesCaseDetail> {
  const body = note ? { action, note } : { action }
  return requestJson<AfterSalesCaseDetail>(
    `/dispute/cases/${encodeURIComponent(caseNo)}/respond`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(body),
    },
    '提交解除合作案件表态失败',
  )
}

/** 立案人撤回（`POST /api/dispute/cases/{case_no}/withdraw`）。 */
export async function withdrawAfterSalesCase(
  token: string,
  caseNo: string,
  note?: string,
): Promise<AfterSalesCaseDetail> {
  return requestJson<AfterSalesCaseDetail>(
    `/dispute/cases/${encodeURIComponent(caseNo)}/withdraw`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(note ? { note } : {}),
    },
    '撤回解除合作申请失败',
  )
}

/**
 * 需求上的案件摘要（`GET /api/requirement/{requirement_id}/breach-case`）。
 *
 * `has_case = false` 是**正常空态**，不是 404：大部分需求一辈子不会有争议，
 * 前端据此决定要不要显示「解除合作 / 争议」入口。
 */
export async function getRequirementBreachCase(
  token: string,
  requirementId: string,
): Promise<RequirementBreachCase> {
  return requestJson<RequirementBreachCase>(
    `/requirement/${encodeURIComponent(requirementId)}/breach-case`,
    { headers: authHeader(token) },
    '加载解除合作案件失败',
  )
}

/**
 * 发起解除合作（`POST /api/requirement/{requirement_id}/termination`）。
 *
 * 这条路固定立「协商解除」（`mutual_unbind`）、不填诉求金额；响应只回最小三件套，
 * 案件其余字段归争议中心，前端拿 `case_no` 再取详情。
 */
export async function reportTermination(
  token: string,
  requirementId: string,
  reason: string,
): Promise<TerminationResult> {
  return requestJson<TerminationResult>(
    `/requirement/${encodeURIComponent(requirementId)}/termination`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ reason }),
    },
    '提交解除合作申请失败',
  )
}

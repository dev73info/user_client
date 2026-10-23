import { authHeaders, requestJson } from '@/api/http'
import type { components } from '@/api/generated/schema'

type Schemas = components['schemas']

/** 验收请求体（契约 `AcceptanceRequest`）。`result` 缺省按**通过**处理，打回时 `note` 必填。 */
export type RequirementAcceptancePayload = Schemas['AcceptanceRequest']

/**
 * 一次验收（通过 / 打回）的回执（契约 `AcceptanceResultResponse`）。
 *
 * `remediation_due_at` 只在**打回**时有值（东八区字符串），是通过时的 `null`。
 * ⚠️ `GET /api/requirement/{id}` 的详情响应里还没有这个字段，所以刷新页面后展示不了倒计时。
 */
export type RequirementAcceptanceResult = Schemas['AcceptanceResultResponse']

/** 一条验收留档：字段与旧  同形， 收窄成两值。 */
export type RequirementAcceptanceRecord = {
  id: number
  result: 'passed' | 'rejected'
  submittedBy: string
  note: string
  resourceVersion?: string | null
  createdAt: string
}

/**
 * 提交验收结论（`POST /api/requirement/{id}/acceptance`）。
 *
 * 与老接口 `request-final-payment`（无 body、只能通过）的区别：这条路**可通过也可打回**，
 * 打回后需求退回 `in_development`、起算整改期限并通知开发者整改。
 * 路径写 `/requirements/...`，由 `shared/api/url.ts` 的别名表重写成 `/api/requirement/...`。
 */
export async function submitRequirementAcceptance(
  token: string,
  requirementId: string,
  result: 'passed' | 'rejected',
  note = '',
): Promise<RequirementAcceptanceResult> {
  const payload: RequirementAcceptancePayload = { result, note: note.trim() }
  return requestJson<RequirementAcceptanceResult>(
    `/requirements/${encodeURIComponent(requirementId)}/acceptance`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '提交验收结果失败',
  )
}

/** 查询需求的验收留档（`GET /api/requirement/{id}/acceptances`，按时间倒序）。 */
export async function listRequirementAcceptances(
  token: string,
  requirementId: string,
): Promise<RequirementAcceptanceRecord[]> {
  return requestJson<RequirementAcceptanceRecord[]>(
    `/requirements/${encodeURIComponent(requirementId)}/acceptances`,
    { headers: authHeaders(token) },
    '加载验收记录失败',
  )
}

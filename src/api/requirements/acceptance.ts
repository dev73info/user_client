import { authHeaders, requestJson } from '@/api/http'

import type { AdapayAcceptanceRecord, AdapayAcceptanceResult } from '@/api/adapay'

/**
 * 验收结论：`passed` 通过、`rejected` 打回。
 *
 * 打回时 `note` **必填**（后端空理由回 400），且会把需求退回「开发中」、起算整改期限、
 * 通知开发者整改。老接口 `request-final-payment`（无 body）等价于 `passed`，仍在用，
 * 但它没有"打回"这条路，新代码一律走本模块。
 */
export type RequirementAcceptanceResponse = {
  /**
   * 打回时的整改截止时间（东八区 `YYYY-MM-DD HH:MM:SS`）；通过时不带。
   *
   * ⚠️ 这个字段**只在打回成功的响应里**有：`GET /api/requirement/{id}` 的详情响应里
   * 暂时还没有 `acceptance_due_at` / `remediation_due_at`（后端正在补，字段名不变），
   * 所以刷新页面后还展示不了「还剩多久整改」。
   *
   * 契约里目前也查不到 `POST /api/requirement/{id}/acceptance`（实测该路由存在，401 而不是 404），
   * 所以这个类型是手写的，等契约补上再改回生成物别名。
   */
  remediation_due_at?: string | null
  /** 后端回的需求状态，打回后为 `in_development`。 */
  status?: string
}

/**
 * 提交验收结论（`POST /api/requirement/{id}/acceptance`）。
 *
 * 路径写 `/requirements/...`，由 `shared/api/url.ts` 的别名表重写成 `/api/requirement/...`，
 * 与本目录其它模块同一口径。
 */
export async function submitRequirementAcceptance(
  token: string,
  requirementId: string,
  result: AdapayAcceptanceResult,
  note = '',
): Promise<RequirementAcceptanceResponse> {
  return requestJson<RequirementAcceptanceResponse>(
    `/requirements/${encodeURIComponent(requirementId)}/acceptance`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ result, note: note.trim() }),
    },
    '提交验收结果失败',
  )
}

/** 查询需求的验收留档（`GET /api/requirement/{id}/acceptances`，按时间倒序）。 */
export async function listRequirementAcceptances(
  token: string,
  requirementId: string,
): Promise<AdapayAcceptanceRecord[]> {
  return requestJson<AdapayAcceptanceRecord[]>(
    `/requirements/${encodeURIComponent(requirementId)}/acceptances`,
    { headers: authHeaders(token) },
    '加载验收记录失败',
  )
}

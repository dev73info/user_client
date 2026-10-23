import { authHeader, requestJson } from '@/api/http'

import type { AdapayBreachCase, AdapayBreachDecisionValue } from './types'

/**
 * 发起「解除合作」：一个入口、不预设走向。
 *
 * 案件先进入协商阶段（`submitted`），由对方的回应决定去哪：
 * 对方同意即按协商一致处理（无责退出），对方不同意或超时未回应才由任一方「申请平台介入」
 * 转入责任判定。因此这里没有「协商还是追责」的选项，也没有金额。
 */
export async function reportAdapayTermination(
  token: string,
  requirementId: string,
  reason: string,
): Promise<AdapayBreachCase> {
  return requestJson<AdapayBreachCase>(
    `/requirements/${encodeURIComponent(requirementId)}/termination`,
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

/** 查询当前需求上的解除合作案件（无案件时返回 null）。 */
export async function getAdapayBreachCase(
  token: string,
  requirementId: string,
): Promise<AdapayBreachCase | null> {
  return requestJson<AdapayBreachCase | null>(
    `/adapay/requirements/${encodeURIComponent(requirementId)}/breach-case`,
    { headers: authHeader(token) },
    '加载解除合作案件失败',
  )
}

/** 合同双方对 AI 判定表态：接受即按判定执行，不接受则转客服人工判定。 */
export async function submitAdapayBreachDecision(
  token: string,
  caseId: number,
  decision: AdapayBreachDecisionValue,
  note = '',
): Promise<AdapayBreachCase> {
  return requestJson<AdapayBreachCase>(
    `/adapay/breaches/${caseId}/decision`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ decision, note }),
    },
    '提交解除合作案件表态失败',
  )
}

/** 协商不成时申请平台介入：案件从「协商中」转入 AI 判定（AI 不可用时直接转客服人工审核）。 */
export async function requestAdapayPlatformReview(
  token: string,
  caseId: number,
): Promise<AdapayBreachCase> {
  return requestJson<AdapayBreachCase>(
    `/adapay/breaches/${caseId}/request-platform-review`,
    {
      method: 'POST',
      headers: authHeader(token),
    },
    '申请平台介入失败',
  )
}

/** 发起人在平台介入进程启动前自行撤回解除合作申请（撤回后同一需求可再次发起）。 */
export async function withdrawAdapayBreach(
  token: string,
  caseId: number,
): Promise<AdapayBreachCase> {
  return requestJson<AdapayBreachCase>(
    `/adapay/breaches/${caseId}/withdraw`,
    {
      method: 'POST',
      headers: authHeader(token),
    },
    '撤回解除合作申请失败',
  )
}

// 双方对案件表态的接口在别处（`respondAdapayBreachDecision` / 会话动作里），这里不再有
// 发起 / 应答协商提议的封装：还价机制已下线，案件上只剩「表态」与「申请平台介入」两条路。

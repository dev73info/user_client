/**
 * 需求单费用快照（`GET /api/requirement/{id}/fee-terms`）。
 *
 * 费率在合同创建时锁定，之后平台调价不影响已锁定的单；金额一律整数分，比例一律基点
 * （10000 = 100%）。本文件先按后端约定在本地声明类型，等契约生成物补上后再换成
 * `components['schemas'][...]`。
 *
 * 404 有两种含义，调用方要结合需求的结算模式判断：
 * - 自管模式（`self_managed`）：平台不代收代付、不收费率，属正常情况；
 * - 电签担保模式下旧合同尚未写入快照：展示「费率待确认」，不阻塞签署。
 */
import { HttpError, authHeaders, requestJson } from '@/api/http'

export type RequirementFeeTerms = {
  requirement_id: string
  /** 平台服务费比例（基点）。 */
  platform_fee_bps: number
  /** 代扣个人所得税比例（基点）。 */
  personal_income_tax_bps: number
  /** 合同总额（分）。 */
  total_fen: number
  /** 定金金额（分）。 */
  deposit_fen: number
  /** 定金占总价比例（基点）。 */
  deposit_ratio_bps: number
  platform_fee_fen: number
  tax_fen: number
  developer_net_fen: number
  deposit_platform_fee_fen: number
  deposit_tax_fen: number
  deposit_developer_net_fen: number
  final_platform_fee_fen: number
  final_tax_fen: number
  final_developer_net_fen: number
  customer_breach_platform_fee_bps: number
  customer_breach_tax_bps: number
  /** 费率锁定时间（东八区 `YYYY-MM-DD HH:mm:ss`）。 */
  snapshot_at: string
}

/** 读取需求单的费率快照。404 由调用方用 {@link isFeeTermsPending} 判定后决定展示口径。 */
export async function getRequirementFeeTerms(
  token: string,
  requirementId: string,
): Promise<RequirementFeeTerms> {
  return requestJson<RequirementFeeTerms>(
    `/requirements/${encodeURIComponent(requirementId)}/fee-terms`,
    { method: 'GET', headers: authHeaders(token) },
    '加载费率失败',
  )
}

/** 404 = 没有费率快照（自管模式或旧合同），不是错误。 */
export function isFeeTermsPending(error: unknown): boolean {
  return error instanceof HttpError && error.status === 404
}

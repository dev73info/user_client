/**
 * 资源售卖配置（契约 `resource-purchase-config`）。
 *
 * 「发布资源」页只需要平台抽成比例做费用披露：后端只回 `platform_fee_bps`（基点，10000 = 100%），
 * 真正的扣费以落单快照为准，所以这里不引入收银台地址 / 微信 AppID / 退款次数等其他售卖口径。
 */
import type { components } from '@/api/generated/schema'
import { authHeaders, requestJson } from '@/api/http'

/** 平台抽成比例（契约 `SaleFeeResponse`）。 */
export type SaleFee = components['schemas']['SaleFeeResponse']

/** 当前平台抽成比例（`GET /api/resource/sale/fee`，登录即可读）。 */
export async function getResourceSaleFee(token: string): Promise<SaleFee> {
  return requestJson<SaleFee>(
    '/resource/sale/fee',
    { method: 'GET', headers: authHeaders(token) },
    '加载平台抽成比例失败',
  )
}

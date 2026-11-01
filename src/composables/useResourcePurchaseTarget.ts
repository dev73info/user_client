import { ref } from 'vue'

import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'
import { canReuseCashQrForChannel, type ResourcePayChannelUi } from '@/shared/resourceSale'

/** 按版本购买的目标版本：面板只关心编号与价格，不持有整条版本对象。 */
export type ResourcePurchaseTargetVersion = {
  id: number
  price_fen: number
}

/**
 * 购买目标版本与支付面归属。
 *
 * 待支付单只有「同资源 + 同购买粒度」才允许复用：订单响应不带 `version_id`，
 * 切版本后若复用旧单，用户会拿另一个版本的二维码付款。
 */
export function useResourcePurchaseTarget() {
  const targetVersion = ref<ResourcePurchaseTargetVersion | null>(null)
  let surfaceVersionId: number | null = null

  function canReuse(
    order: ResourcePurchaseOrder | null,
    resourceId: number | null,
    channel: ResourcePayChannelUi,
    hasQr: boolean,
  ): boolean {
    if (!order || resourceId == null || order.resource_id !== resourceId) {
      return false
    }
    if ((surfaceVersionId ?? null) !== (targetVersion.value?.id ?? null)) {
      return false
    }
    return canReuseCashQrForChannel(order, channel, hasQr)
  }

  /** 下单成功后登记当前支付面所属版本（null = 买断）。 */
  function markSurfaceVersion() {
    surfaceVersionId = targetVersion.value?.id ?? null
  }

  /** 支付面作废时清掉版本归属。 */
  function resetSurfaceVersion() {
    surfaceVersionId = null
  }

  return { targetVersion, canReuse, markSurfaceVersion, resetSurfaceVersion }
}

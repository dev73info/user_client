import { computed, type Ref } from 'vue'
import { TMessage } from 'ui_73info'

import type { PublicMcResourceItem, PublicMcResourceVersionItem } from '@/api/resources'
import { API_RESOURCE_PURCHASE_HINT, canPurchaseOnPlatform } from '@/shared/resourceSale'
import { isApiResourceKind } from '@/shared/resourceApi'

/**
 * 资源详情面板的购买闸与「打开购买面板」入口。
 *
 * - `needsPurchase`：买断 / 积分资源的购买闸（版本列表按钮也看它，版本售卖不在这里拦）；
 * - `isApiResource` + `openPurchasePanel`：BUG-020，接口资源只在开发者自有站点的服务端下单，
 *   平台内没有购买入口。价格是「开放接口下单的售价」，不是平台内商品标价——
 *   所以不给它开平台内购买入口（后端会以 409 拒掉），只留一条到开发者站点的引导。
 *   别的入口（下载 403 引导等）也要经过这里，避免把用户送进一个必然失败的支付弹窗。
 *
 * 资源实体仍由面板持有，这里只通过 ref 读；面板动作（下单队列 / 支付面 / 轮询）在
 * `useResourcePurchase` 里。
 */
export function useResourcePurchaseGate(options: {
  /** 当前资源实体 */
  resource: Ref<PublicMcResourceItem | null>
  /** 当前用户是不是资源作者（作者不买自己的资源） */
  isOwner: Ref<boolean>
  /** 打开购买面板的原动作（`useResourcePurchase` 的 `open`，未做接口资源拦截） */
  openPurchasePanelUnlocked: (version?: PublicMcResourceVersionItem | null) => Promise<void>
}) {
  const isApiResource = computed(() => isApiResourceKind(options.resource.value?.resource_kind))
  const needsPurchase = computed(() => {
    const resource = options.resource.value
    if (!resource) {
      return false
    }
    return canPurchaseOnPlatform({
      priceFen: resource.buyout_price_fen,
      pricePoints: resource.price_points,
      purchasedByMe: Boolean(resource.purchased_by_me),
      isOwner: options.isOwner.value,
      resourceKind: resource.resource_kind,
    })
  })

  /**
   * 打开购买面板前再挡一道接口资源。`version` 是本次购买的目标版本：
   * 版本售卖资源按版本价下单，买断 / 积分资源传空。
   */
  async function openPurchasePanel(
    version: PublicMcResourceVersionItem | null = null,
  ): Promise<void> {
    if (isApiResource.value) {
      TMessage.info(API_RESOURCE_PURCHASE_HINT)
      return
    }
    await options.openPurchasePanelUnlocked(version)
  }

  return { isApiResource, needsPurchase, openPurchasePanel }
}

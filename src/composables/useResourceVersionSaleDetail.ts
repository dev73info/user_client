import { computed, type Ref } from 'vue'

import type { PublicMcResourceItem, PublicMcResourceVersionItem } from '@/api/resources'
import type { ResourcePurchaseTargetVersion } from '@/composables/useResourcePurchaseTarget'
import {
  formatResourcePriceLabel,
  formatVersionSalePriceLabel,
  isPricedResource,
  isVersionSaleResource,
  needsVersionPurchase as resolveNeedsVersionPurchase,
  resolveVersionSaleMinPriceFen,
  resolveVersionSaleMinPriceVersion,
} from '@/shared/resourceSale'

/**
 * 详情页的按版本售卖派生值：标价、价格徽标档位、主按钮购买闸与购买面板金额。
 *
 * 资源级 `buyout_price_fen == 0 && price_points == 0` 不代表免费——后端下载判定看的是
 * 版本价。这里统一把「版本售卖」的展示与购买口径算在一处，面板只接结果。
 */
export function useResourceVersionSaleDetail(options: {
  resource: Ref<PublicMcResourceItem | null>
  versions: Ref<PublicMcResourceVersionItem[]>
  isOwner: Ref<boolean>
  purchaseTargetVersion: Ref<ResourcePurchaseTargetVersion | null>
}) {
  const isVersionSale = computed(() =>
    isVersionSaleResource({
      buyoutPriceFen: options.resource.value?.buyout_price_fen ?? 0,
      pricePoints: options.resource.value?.price_points ?? 0,
      versions: options.versions.value,
    }),
  )
  const versionSaleMinPriceFen = computed(() =>
    resolveVersionSaleMinPriceFen(options.versions.value),
  )
  /** 版本售卖的最低价版本：主按钮购买与面板「¥x 起」都落到它身上 */
  const versionSaleTargetVersion = computed(() =>
    resolveVersionSaleMinPriceVersion(options.versions.value),
  )
  const priceLabel = computed(() => {
    if (isVersionSale.value) {
      return formatVersionSalePriceLabel(versionSaleMinPriceFen.value)
    }
    return formatResourcePriceLabel(
      options.resource.value?.buyout_price_fen ?? 0,
      options.resource.value?.price_points ?? 0,
    )
  })
  /** 价格徽标是否按「付费」着色（版本售卖也算标价，`isPricedResource` 只看资源级价格）。 */
  const isPaidPrice = computed(
    () =>
      isVersionSale.value ||
      isPricedResource(
        options.resource.value?.buyout_price_fen ?? 0,
        options.resource.value?.price_points ?? 0,
      ),
  )
  /**
   * 主按钮购买闸：按版本售卖且访客未持有权益就一律先购买（0 价版本不单卖）。
   * 已持有权益的买家不在这里挡——版本列表保持「先试下载、403 再按该版本购买」。
   */
  const needsVersionPurchase = computed(() =>
    resolveNeedsVersionPurchase({
      buyoutPriceFen: options.resource.value?.buyout_price_fen ?? 0,
      pricePoints: options.resource.value?.price_points ?? 0,
      purchasedByMe: Boolean(options.resource.value?.purchased_by_me),
      isOwner: options.isOwner.value,
      versions: options.versions.value,
    }),
  )
  /** 购买面板金额：版本购买显示目标版本价，买断 / 积分仍用资源级标价。 */
  const purchasePriceLabel = computed(() => {
    const target = options.purchaseTargetVersion.value
    if (target) {
      return formatResourcePriceLabel(target.price_fen)
    }
    return priceLabel.value
  })

  return {
    isVersionSale,
    versionSaleTargetVersion,
    priceLabel,
    isPaidPrice,
    needsVersionPurchase,
    purchasePriceLabel,
  }
}

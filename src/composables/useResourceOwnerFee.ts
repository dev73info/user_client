import { computed, ref } from 'vue'

import { getResourceSaleFee } from '@/api/resourceSale'
import { formatFenAsCny } from '@/shared/money'
import {
  RESOURCE_FEE_UNAVAILABLE_TEXT,
  estimateResourceFeeFen,
  estimateResourceNetFen,
  resourceFeeHintText,
} from '@/shared/requirementFee'

type OwnerFeeSources = {
  isOwner: () => boolean
  token: () => string
  pricePoints: () => number
  buyoutPriceFen: () => number
  /** 可单卖的版本价（分）。 */
  versionPrices: () => number[]
}

/**
 * 资源详情页「卖家本人」的费率提示：当前抽成 + 预计到手。
 *
 * 只有 owner 才取；访客不请求、不展示。优先资源级标价（积分 / 现金），
 * 没有资源级标价时用最低可售版本价；估算口径与后端落单一致（整数分向下取整）。
 */
export function useResourceOwnerFee(sources: OwnerFeeSources) {
  const platformFeeBps = ref<number | null>(null)
  const feeError = ref(false)

  const hint = computed(() => {
    if (!sources.isOwner()) {
      return ''
    }
    if (feeError.value) {
      return RESOURCE_FEE_UNAVAILABLE_TEXT
    }
    const bps = platformFeeBps.value
    if (bps == null) {
      return ''
    }
    const points = sources.pricePoints()
    if (Number.isFinite(points) && points > 0) {
      const fee = estimateResourceFeeFen(points, bps)
      return resourceFeeHintText(bps, `${points - fee} 积分`)
    }
    const resourceFen = sources.buyoutPriceFen()
    if (Number.isFinite(resourceFen) && resourceFen > 0) {
      return resourceFeeHintText(
        bps,
        `¥${formatFenAsCny(estimateResourceNetFen(resourceFen, bps))}`,
      )
    }
    const versionFen = sources.versionPrices().reduce((min, price) => {
      return price > 0 && (min === 0 || price < min) ? price : min
    }, 0)
    if (versionFen > 0) {
      return resourceFeeHintText(bps, `¥${formatFenAsCny(estimateResourceNetFen(versionFen, bps))}`)
    }
    return resourceFeeHintText(bps)
  })

  async function load() {
    if (!sources.isOwner()) {
      return
    }
    try {
      const fee = await getResourceSaleFee(sources.token())
      platformFeeBps.value = fee.platform_fee_bps
      feeError.value = false
    } catch {
      platformFeeBps.value = null
      feeError.value = true
    }
  }

  return { hint, feeError, load }
}

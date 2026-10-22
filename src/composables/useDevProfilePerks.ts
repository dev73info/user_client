/**
 * 主页背景自定义权益：只看本人（`isSelf`）且已登录时去积分接口确认两项权益是否在手。
 *
 * 权益判定口径与拆分前一致：`owned` 为真，且 `expires_at` 为空或还没过期。
 * 独立成 composable 是因为它只被背景设置用到，且要把 `points` 这个 api 模块
 * 挡在取数 composable 之外（单文件 api 依赖控制在 3 个以内）。
 */
import { ref } from 'vue'

import { getMyPoints, type UserPerk } from '@/api/points'
import { useAuthStore } from '@/stores/auth'

function ownsPerk(perks: UserPerk[], perkCode: string): boolean {
  return perks.some(
    (perk) =>
      perk.perk_code === perkCode &&
      perk.owned &&
      (!perk.expires_at || new Date(perk.expires_at).getTime() > Date.now()),
  )
}

export function useDevProfilePerks() {
  const auth = useAuthStore()

  const canCustomizeBackground = ref(false)
  const canCustomizeDynamicBackground = ref(false)

  async function load(isSelf: boolean): Promise<void> {
    if (!isSelf || !auth.token) {
      canCustomizeBackground.value = false
      canCustomizeDynamicBackground.value = false
      return
    }
    const points = await getMyPoints(auth.token)
    canCustomizeBackground.value = ownsPerk(points.perks, 'home_background_static')
    canCustomizeDynamicBackground.value = ownsPerk(points.perks, 'home_background_dynamic')
  }

  return {
    canCustomizeBackground,
    canCustomizeDynamicBackground,
    load,
  }
}

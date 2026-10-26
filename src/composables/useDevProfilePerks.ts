import { ref } from 'vue'

import { getMyPoints, type UserPerk } from '@/api/points'
import { describeBackendError } from '@/shared/backendErrorText'
import { parseBackendDateTime } from '@/shared/datetime'
import { useAuthStore } from '@/stores/auth'

function ownsPerk(perks: UserPerk[], perkCode: string): boolean {
  return perks.some(
    (perk) =>
      perk.perk_code === perkCode &&
      perk.owned &&
      (!perk.expires_at || (parseBackendDateTime(perk.expires_at)?.getTime() ?? 0) > Date.now()),
  )
}

export function useDevProfilePerks() {
  const auth = useAuthStore()
  const canCustomizeBackground = ref(false)
  const canCustomizeDynamicBackground = ref(false)
  const error = ref('')

  async function load(isSelf: boolean): Promise<void> {
    error.value = ''
    if (!isSelf || !auth.token) {
      canCustomizeBackground.value = false
      canCustomizeDynamicBackground.value = false
      return
    }
    try {
      const points = await getMyPoints(auth.token)
      canCustomizeBackground.value = ownsPerk(points.perks, 'home_background_static')
      canCustomizeDynamicBackground.value = ownsPerk(points.perks, 'home_background_dynamic')
    } catch (err) {
      canCustomizeBackground.value = false
      canCustomizeDynamicBackground.value = false
      error.value = describeBackendError(err, '加载主页背景权益失败')
    }
  }

  return { canCustomizeBackground, canCustomizeDynamicBackground, error, load }
}

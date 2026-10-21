import { ref } from 'vue'

import { TMessage } from 'ui_73info'

import { doCheckin, getCheckinStatus, type CheckinStatus } from '@/api/points'
import { useAuthStore } from '@/stores/auth'

/**
 * 首页侧栏「内测中」卡片里的每日签到。
 *
 * 签到是写操作，连同两个 api 一起留在这一层：`PortalBetaCard` 只收 `checkin` / `checkinSaving`
 * 两个 props 并 emit `checkin`，组件里不 import 任何 `@/api/*`。
 *
 * 行为与拆分前一致：未登录或请求失败都静默把状态置空（卡片回落成「邀请有礼」），
 * 签到成功用后端返回的 `total_awarded` 覆盖当日可得积分，失败才弹提示。
 */
export function useHomeCheckin() {
  const auth = useAuthStore()

  const status = ref<CheckinStatus | null>(null)
  const saving = ref(false)

  async function load() {
    if (!auth.isAuthed || !auth.token) {
      status.value = null
      return
    }
    try {
      status.value = await getCheckinStatus(auth.token)
    } catch {
      // 静默失败：拿不到签到状态时卡片按「已签到」渲染（露出邀请有礼）
      status.value = null
    }
  }

  async function checkin() {
    if (!auth.token || saving.value) {
      return
    }
    saving.value = true
    try {
      const res = await doCheckin(auth.token)
      status.value = {
        username: res.username,
        today_checked_in: true,
        streak_count: res.streak_count,
        today_potential: res.total_awarded,
      }
      TMessage.success(`签到成功，获得 ${res.total_awarded} 积分`)
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '签到失败')
    } finally {
      saving.value = false
    }
  }

  return { status, saving, load, checkin }
}

import { ref, watch } from 'vue'

import { TMessage } from 'ui_73info'

import { doCheckin, getCheckinStatus, type CheckinStatus } from '@/api/points'
import { describeBackendError } from '@/shared/backendErrorText'
import { useAuthStore } from '@/stores/auth'

export function useHomeCheckin(watchSession = true) {
  const auth = useAuthStore()
  const status = ref<CheckinStatus | null>(null)
  const saving = ref(false)
  const error = ref('')

  async function load() {
    if (!auth.isAuthed || !auth.token) {
      status.value = null
      error.value = ''
      return
    }
    error.value = ''
    try {
      status.value = await getCheckinStatus(auth.token)
    } catch (err) {
      error.value = describeBackendError(err, '加载签到状态失败')
    }
  }

  async function checkin() {
    if (!auth.token || saving.value) return
    saving.value = true
    error.value = ''
    try {
      const res = await doCheckin(auth.token)
      status.value = {
        username: res.username,
        today_checked_in: true,
        streak_count: res.streak_count,
        today_potential: res.total_awarded,
      }
      TMessage.success(`签到成功，获得 ${res.total_awarded} 积分`)
    } catch (err) {
      error.value = describeBackendError(err, '签到失败')
      TMessage.error(error.value)
    } finally {
      saving.value = false
    }
  }

  if (watchSession) {
    watch(
      () => auth.isAuthed,
      () => {
        void load()
      },
      { immediate: true },
    )
  }

  return { status, saving, error, load, checkin }
}

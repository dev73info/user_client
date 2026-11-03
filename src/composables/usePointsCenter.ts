import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useHomeCheckin } from '@/composables/useHomeCheckin'
import { usePointsLedger } from '@/composables/usePointsLedger'
import { usePointsTransfer } from '@/composables/usePointsTransfer'
import { useAuthStore } from '@/stores/auth'

export function usePointsCenter() {
  const router = useRouter()
  const auth = useAuthStore()
  const refreshing = ref(false)
  const ledger = usePointsLedger()
  const checkin = useHomeCheckin(false)
  const transfer = usePointsTransfer({
    reloadLedger: () => ledger.loadPoints(),
  })

  async function refreshOverview() {
    refreshing.value = true
    try {
      await Promise.all([
        ledger.loadPoints(),
        transfer.loadTransferMeta(),
        transfer.loadTransfers(),
        checkin.load(),
      ])
    } finally {
      refreshing.value = false
    }
  }

  async function submitCheckin() {
    await checkin.checkin()
    await ledger.loadPoints()
  }

  onMounted(async () => {
    auth.hydrate()
    if (!auth.isAuthed) {
      await router.replace('/')
      return
    }
    await Promise.all([
      ledger.loadPoints(),
      transfer.loadTransferMeta(),
      transfer.loadTransfers(),
      checkin.load(),
    ])
  })

  return {
    auth,
    refreshing,
    refreshOverview,
    checkinStatus: checkin.status,
    checkinSaving: checkin.saving,
    checkinError: checkin.error,
    loadCheckin: checkin.load,
    checkin: submitCheckin,
    ...ledger,
    ...transfer,
  }
}

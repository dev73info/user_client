import { ref } from 'vue'

import { getTeamDetail, listMyTeams, type TeamResponse } from '@/api/team'
import { describeBackendError } from '@/shared/backendErrorText'
import { useAuthStore } from '@/stores/auth'

export function useResourceTransferTeams(onEmpty: () => void) {
  const auth = useAuthStore()
  const manageableTeams = ref<TeamResponse[]>([])
  const teamsLoading = ref(false)
  const teamsError = ref('')

  async function loadManageableTeams() {
    if (!auth.token) return
    teamsLoading.value = true
    teamsError.value = ''
    try {
      const teams = await listMyTeams(auth.token)
      const details = await Promise.all(
        teams.map((team) => getTeamDetail(auth.token, team.team_id)),
      )
      manageableTeams.value = details
        .filter((detail) =>
          detail.members.some(
            (member) =>
              member.username === auth.username &&
              (member.role === 'owner' || member.role === 'admin'),
          ),
        )
        .map((detail) => detail.team)
      if (!manageableTeams.value.length) onEmpty()
    } catch (error) {
      manageableTeams.value = []
      teamsError.value = describeBackendError(error, '加载可接收资源的团队失败')
    } finally {
      teamsLoading.value = false
    }
  }

  return { manageableTeams, teamsLoading, teamsError, loadManageableTeams }
}

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listMyTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  leaveTeam,
  type TeamResponse,
} from '@/api/team'

export const useTeamStore = defineStore('team', () => {
  const teams = ref<TeamResponse[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchTeams(token: string) {
    loading.value = true
    error.value = null
    try {
      teams.value = await listMyTeams(token)
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载团队失败'
    } finally {
      loading.value = false
    }
  }

  async function doCreateTeam(
    token: string,
    name: string,
    description: string,
  ): Promise<TeamResponse> {
    const team = await createTeam(token, { name, description })
    teams.value.unshift(team)
    return team
  }

  async function doDeleteTeam(token: string, teamId: number) {
    await deleteTeam(token, teamId)
    teams.value = teams.value.filter((t) => t.team_id !== teamId)
  }

  async function doUpdateTeam(
    token: string,
    teamId: number,
    payload: { name?: string; description?: string },
  ): Promise<TeamResponse> {
    const team = await updateTeam(token, teamId, payload)
    const idx = teams.value.findIndex((t) => t.team_id === teamId)
    if (idx !== -1) teams.value[idx] = { ...teams.value[idx], ...team }
    return team
  }

  async function doLeaveTeam(token: string, teamId: number) {
    await leaveTeam(token, teamId)
    teams.value = teams.value.filter((t) => t.team_id !== teamId)
  }

  return {
    teams,
    loading,
    error,
    fetchTeams,
    doCreateTeam,
    doDeleteTeam,
    doUpdateTeam,
    doLeaveTeam,
  }
})

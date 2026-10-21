import { computed, ref } from 'vue'
import { listMyTeams, type TeamResponse } from '@/api/team'
import { useAuthStore } from '@/stores/auth'

/**
 * 「归属团队」下拉的候选：只拉一次当前用户加入的团队。
 *
 * 漏掉这次请求时下拉恒为空、「团队项目」恒为禁用，页面上却看不出是没加载——
 * 所以把加载与失败日志放在一起，谁改这里都不会只改一半。
 */
export function useResourceHomepageTeams() {
  const auth = useAuthStore()
  const myTeams = ref<TeamResponse[]>([])

  const teamOptions = computed(() =>
    myTeams.value.map((team) => ({
      value: String(team.team_id),
      label: team.name,
    })),
  )
  const hasJoinedTeam = computed(() => myTeams.value.length > 0)

  async function loadMyTeams() {
    if (!auth.token) return
    try {
      myTeams.value = await listMyTeams(auth.token)
    } catch (error) {
      console.error('Failed to load teams:', error)
    }
  }

  return { myTeams, teamOptions, hasJoinedTeam, loadMyTeams }
}

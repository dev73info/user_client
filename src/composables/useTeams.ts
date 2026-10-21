import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { TMessage } from 'ui_73info'

import { createTeam, deleteTeam, leaveTeam, listMyTeams, type TeamResponse } from '@/api/team'
import {
  countOwnedTeams,
  filterTeamList,
  sortTeamsByNewest,
  type TeamListFilters,
} from '@/shared/teamDisplay'
import { useAuthStore } from '@/stores/auth'

/**
 * 「我的团队」列表页的数据与动作。
 *
 * 从 `views/TeamsView.vue` 抽出来：页面只管排版，取数、排序、工具条筛选、创建 / 解散 / 退出
 * 与跳转详情都在这里；收到的邀请另在 `@/composables/useTeamInvitations`。
 * 逻辑与提示文案逐段照搬，没改口径。
 */
export function useTeams() {
  const router = useRouter()
  const auth = useAuthStore()

  const teams = ref<TeamResponse[]>([])
  const loading = ref(false)
  const showCreateModal = ref(false)
  const createName = ref('')
  const createDesc = ref('')
  const creating = ref(false)
  const deletingId = ref<number | null>(null)

  // 列表工具条：与其余菜单页同一套（筛选即时生效 + 搜索 + 重置）。
  // 取值用空串表示「不筛选」，与 dev-resource-list / dev-my-requirements 的 filters 写法一致。
  const filters = reactive<TeamListFilters>({
    keyword: '',
    scope: '',
  })

  const sortedTeams = computed(() => sortTeamsByNewest(teams.value))
  const ownedCount = computed(() => countOwnedTeams(teams.value, auth.username))
  const filteredTeams = computed(() => filterTeamList(sortedTeams.value, filters, auth.username))

  async function loadTeams() {
    loading.value = true
    try {
      const token = auth.token?.trim() ? auth.token : null
      if (!token) {
        TMessage.warning('请先登录')
        return
      }
      teams.value = await listMyTeams(token)
    } catch (e) {
      TMessage.warning(e instanceof Error ? e.message : '加载团队失败')
    } finally {
      loading.value = false
    }
  }

  /** 卡头的「创建团队」：只开弹窗，表单模型在弹窗组件里跟着父级一块重挂。 */
  function openCreateModal() {
    showCreateModal.value = true
  }

  async function handleCreate() {
    const name = createName.value.trim()
    if (!name) {
      TMessage.warning('请输入团队名称')
      return
    }
    const token = auth.token?.trim()
    if (!token) return
    creating.value = true
    try {
      const team = await createTeam(token, {
        name,
        description: createDesc.value.trim(),
      })
      showCreateModal.value = false
      createName.value = ''
      createDesc.value = ''
      teams.value.unshift(team)
      TMessage.info('团队创建成功')
      router.push({ name: 'workbench-team-detail', params: { teamId: team.team_id } })
    } catch (e) {
      TMessage.warning(e instanceof Error ? e.message : '创建失败')
    } finally {
      creating.value = false
    }
  }

  async function handleDelete(team: TeamResponse) {
    if (!confirm(`确定要解散「${team.name}」吗？此操作不可撤销。`)) return
    const token = auth.token?.trim()
    if (!token) return
    deletingId.value = team.team_id
    try {
      await deleteTeam(token, team.team_id)
      teams.value = teams.value.filter((t) => t.team_id !== team.team_id)
      TMessage.info('团队已解散')
    } catch (e) {
      TMessage.warning(e instanceof Error ? e.message : '解散失败')
    } finally {
      deletingId.value = null
    }
  }

  async function handleLeave(team: TeamResponse) {
    if (!confirm(`确定要退出「${team.name}」吗？`)) return
    const token = auth.token?.trim()
    if (!token) return
    deletingId.value = team.team_id
    try {
      await leaveTeam(token, team.team_id)
      teams.value = teams.value.filter((t) => t.team_id !== team.team_id)
      TMessage.info('已退出团队')
    } catch (e) {
      TMessage.warning(e instanceof Error ? e.message : '退出失败')
    } finally {
      deletingId.value = null
    }
  }

  function goDetail(teamId: number) {
    router.push({ name: 'workbench-team-detail', params: { teamId } })
  }

  onMounted(() => {
    loadTeams()
  })

  return {
    // 数据
    teams,
    loading,
    // 读数与列表
    ownedCount,
    filteredTeams,
    filters,
    // 刷新
    loadTeams,
    // 创建
    showCreateModal,
    createName,
    createDesc,
    creating,
    openCreateModal,
    handleCreate,
    // 解散 / 退出 / 跳转
    deletingId,
    handleDelete,
    handleLeave,
    goDetail,
  }
}

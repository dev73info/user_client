import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { TMessage } from 'ui_73info'

import {
  deleteTeam,
  getTeamDetail,
  inviteMember,
  leaveTeam,
  removeMember,
  transferTeamOwner,
  updateMemberRole,
  updateTeam,
  uploadTeamAvatar,
  type TeamDetailResponse,
  type TeamMemberResponse,
} from '@/api/team'
import { teamMyRoleLabel } from '@/shared/teamDisplay'
import { useAuthStore } from '@/stores/auth'

/** 资料卡提交上来的两份字段（表单在组件内自己受控，这里只收值）。 */
export type TeamProfileInput = { name: string; description: string }

/**
 * 团队详情页的数据与动作。
 *
 * 从 `views/TeamDetailView.vue` 抽出：页面只管排版，取数、邀请、改角色、移出、转移所有权、
 * 退出 / 解散、编辑资料与换头像的状态都在这里。逻辑与提示文案逐段照搬，没改口径。
 */
export function useTeamDetail() {
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()

  const team = ref<TeamDetailResponse | null>(null)
  const loading = ref(false)
  const inviting = ref(false)
  const inviteUsername = ref('')
  const showInviteInput = ref(false)
  const removingUsername = ref<string | null>(null)
  const editingName = ref(false)
  const saving = ref(false)
  const avatarUploading = ref(false)

  const teamId = computed(() => Number(route.params.teamId))

  const isOwner = computed(() => team.value?.owner_username === auth.username)
  const isAdmin = computed(() => {
    if (!team.value) return false
    return team.value.members.some(
      (m) => m.username === auth.username && (m.role === 'admin' || m.role === 'owner'),
    )
  })
  const myRole = computed(() => {
    if (!team.value) return null
    return team.value.members.find((m) => m.username === auth.username) ?? null
  })
  const canManageTeam = computed(() => isOwner.value || isAdmin.value)

  const myRoleLabel = computed(() => teamMyRoleLabel(myRole.value))
  /** 非所有者才给「退出团队」：所有者要走解散（原有判定照搬）。 */
  const canLeaveTeam = computed(() => {
    const mine = myRole.value
    return mine !== null && mine.role !== 'owner'
  })

  async function loadTeam() {
    const token = auth.token?.trim()
    if (!token || !teamId.value) return
    loading.value = true
    try {
      team.value = await getTeamDetail(token, teamId.value)
    } catch (e) {
      TMessage.warning(e instanceof Error ? e.message : '加载团队失败')
      router.push({ name: 'workbench-teams' })
    } finally {
      loading.value = false
    }
  }

  function openInvite() {
    showInviteInput.value = true
  }

  function cancelInvite() {
    showInviteInput.value = false
  }

  async function handleInvite() {
    const username = inviteUsername.value.trim()
    if (!username) {
      TMessage.warning('请输入用户名')
      return
    }
    const token = auth.token?.trim()
    if (!token) return
    inviting.value = true
    try {
      await inviteMember(token, teamId.value, { username })
      inviteUsername.value = ''
      showInviteInput.value = false
      TMessage.info('邀请已发送')
    } catch (e) {
      TMessage.warning(e instanceof Error ? e.message : '邀请失败')
    } finally {
      inviting.value = false
    }
  }

  async function handleRemove(member: TeamMemberResponse) {
    if (!confirm(`确定要移除「${member.username}」吗？`)) return
    const token = auth.token?.trim()
    if (!token) return
    removingUsername.value = member.username
    try {
      await removeMember(token, teamId.value, member.username)
      if (team.value) {
        team.value.members = team.value.members.filter((m) => m.username !== member.username)
      }
      TMessage.info('成员已移除')
    } catch (e) {
      TMessage.warning(e instanceof Error ? e.message : '移除失败')
    } finally {
      removingUsername.value = null
    }
  }

  async function handleRoleToggle(member: TeamMemberResponse) {
    const newRole = member.role === 'admin' ? 'member' : 'admin'
    const token = auth.token?.trim()
    if (!token) return
    try {
      await updateMemberRole(token, teamId.value, member.username, { role: newRole })
      if (team.value) {
        const m = team.value.members.find((m) => m.username === member.username)
        if (m) m.role = newRole
      }
      TMessage.info('角色已更新')
    } catch (e) {
      TMessage.warning(e instanceof Error ? e.message : '更新失败')
    }
  }

  async function handleTransferOwner(member: TeamMemberResponse) {
    if (!team.value) return
    if (!confirm(`确定要将「${team.value.name}」的所有权转移给「${member.username}」吗？`)) return
    const token = auth.token?.trim()
    if (!token) return
    try {
      const updated = await transferTeamOwner(token, teamId.value, member.username)
      if (team.value) {
        team.value.owner_username = updated.owner_username
        team.value.members = team.value.members.map((m) => {
          if (m.username === member.username) return { ...m, role: 'owner' }
          if (m.username === auth.username) return { ...m, role: 'admin' }
          return m
        })
      }
      TMessage.info('所有权已转移')
    } catch (e) {
      TMessage.warning(e instanceof Error ? e.message : '转移失败')
    }
  }

  async function handleLeave() {
    if (!confirm('确定要退出该团队吗？')) return
    const token = auth.token?.trim()
    if (!token) return
    try {
      await leaveTeam(token, teamId.value)
      TMessage.info('已退出团队')
      router.push({ name: 'workbench-teams' })
    } catch (e) {
      TMessage.warning(e instanceof Error ? e.message : '退出失败')
    }
  }

  async function handleDelete() {
    if (!confirm('确定要解散该团队吗？此操作不可撤销。')) return
    const token = auth.token?.trim()
    if (!token) return
    try {
      await deleteTeam(token, teamId.value)
      TMessage.info('团队已解散')
      router.push({ name: 'workbench-teams' })
    } catch (e) {
      TMessage.warning(e instanceof Error ? e.message : '解散失败')
    }
  }

  /* 编辑资料：表单模型放在 `TeamProfileForm` 里、按打开那一刻的资料初始化（父级 `v-if` 每次重挂），
     所以这里只需要开 / 关，不必把团队名与简介再拷一份进来。 */
  function startEdit() {
    if (!team.value) return
    editingName.value = true
  }

  function cancelEdit() {
    editingName.value = false
  }

  async function saveEdit(input: TeamProfileInput) {
    if (!input.name.trim()) {
      TMessage.warning('团队名称不能为空')
      return
    }
    const token = auth.token?.trim()
    if (!token) return
    saving.value = true
    try {
      const updated = await updateTeam(token, teamId.value, {
        name: input.name.trim(),
        description: input.description.trim(),
      })
      if (team.value) {
        team.value.name = updated.name
        team.value.description = updated.description
      }
      editingName.value = false
      TMessage.info('团队信息已更新')
    } catch (e) {
      TMessage.warning(e instanceof Error ? e.message : '更新失败')
    } finally {
      saving.value = false
    }
  }

  /* 头像用「一个隐藏 input + 头像上的按钮」：native input 的默认外观与统一层不同档。
     文件由卡片组件选好后交上来，上传进度只需回写 avatarUploading。 */
  async function handleAvatarFile(file: File) {
    const token = auth.token?.trim()
    if (!token) return
    avatarUploading.value = true
    try {
      const updated = await uploadTeamAvatar(token, teamId.value, file)
      if (team.value) {
        team.value.avatar_url = updated.avatar_url
      }
      TMessage.info('头像已更新')
    } catch (e) {
      TMessage.warning(e instanceof Error ? e.message : '上传头像失败')
    } finally {
      avatarUploading.value = false
    }
  }

  function goMemberProfile(username: string) {
    router.push({ name: 'dev-profile', params: { username } })
  }

  onMounted(() => {
    loadTeam()
  })

  return {
    // 数据
    team,
    loading,
    // 身份与权限
    isOwner,
    isAdmin,
    canManageTeam,
    canLeaveTeam,
    myRoleLabel,
    // 刷新
    loadTeam,
    // 邀请
    inviting,
    inviteUsername,
    showInviteInput,
    openInvite,
    cancelInvite,
    handleInvite,
    // 成员动作
    removingUsername,
    handleRemove,
    handleRoleToggle,
    handleTransferOwner,
    goMemberProfile,
    // 团队动作
    handleLeave,
    handleDelete,
    // 编辑资料
    editingName,
    saving,
    startEdit,
    cancelEdit,
    saveEdit,
    // 头像
    avatarUploading,
    handleAvatarFile,
  }
}

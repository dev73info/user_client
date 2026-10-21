import { onMounted, ref } from 'vue'

import { TMessage } from 'ui_73info'

import {
  acceptInvitation,
  listUserInvitations,
  rejectInvitation,
  type TeamInvitationResponse,
} from '@/api/team'
import { useAuthStore } from '@/stores/auth'

/**
 * 收到的团队邀请：取数、接受、拒绝。
 *
 * 从 `views/TeamsView.vue` 抽出来（列表本身在 `@/composables/useTeams`）；
 * 接受邀请后要把团队列表重新拉一遍——团队页随即多出一条，这一步由调用方传进来的
 * `reloadTeams` 完成，本 composable 不自己取团队列表。
 */
export function useTeamInvitations(options: { reloadTeams: () => Promise<void> }) {
  const auth = useAuthStore()

  const invitations = ref<TeamInvitationResponse[]>([])
  const invitationsLoading = ref(false)
  const processingInvitationId = ref<number | null>(null)

  async function loadInvitations() {
    const token = auth.token?.trim()
    if (!token) return

    invitationsLoading.value = true
    try {
      invitations.value = await listUserInvitations(token)
    } catch {
      // 邀请列表加载失败不阻塞团队页面
    } finally {
      invitationsLoading.value = false
    }
  }

  async function handleAcceptInvitation(inv: TeamInvitationResponse) {
    const token = auth.token?.trim()
    if (!token) return

    processingInvitationId.value = inv.id
    try {
      await acceptInvitation(token, inv.id)
      invitations.value = invitations.value.filter((i) => i.id !== inv.id)
      TMessage.info(`已加入「${inv.team_name}」`)
      await options.reloadTeams()
    } catch (e) {
      TMessage.warning(e instanceof Error ? e.message : '接受邀请失败')
    } finally {
      processingInvitationId.value = null
    }
  }

  async function handleRejectInvitation(inv: TeamInvitationResponse) {
    const token = auth.token?.trim()
    if (!token) return

    processingInvitationId.value = inv.id
    try {
      await rejectInvitation(token, inv.id)
      invitations.value = invitations.value.filter((i) => i.id !== inv.id)
      TMessage.info('已拒绝邀请')
    } catch (e) {
      TMessage.warning(e instanceof Error ? e.message : '拒绝邀请失败')
    } finally {
      processingInvitationId.value = null
    }
  }

  onMounted(() => {
    loadInvitations()
  })

  return {
    invitations,
    invitationsLoading,
    processingInvitationId,
    loadInvitations,
    handleAcceptInvitation,
    handleRejectInvitation,
  }
}

import { computed } from 'vue'

import type { RequirementConversation } from '@/shared/conversations'
import { avatarText } from '@/shared/conversationTime'

import type { RealtimeStatus } from '@/composables/useRequirementConversationSession'

type IdentitySources = {
  /** 调用方传进来的标题（有就优先用它）。 */
  title?: string
  requirementId: string
  currentUsername?: string
  displayMode?: 'modal' | 'inline'
  conversation: RequirementConversation | null
  realtimeStatus: RealtimeStatus
}

/**
 * 会话头与弹窗外壳要用到的派生文案。
 *
 * 从 `RequirementConversationModal.vue` 抽出：当前用户在这条会话里的角色、对方名字与首字母、
 * 实时状态与最近动静。全是只读派生，不含请求，组件与子组件都从这里取同一份口径。
 */
export function useConversationIdentity(readSources: () => IdentitySources) {
  const isInline = computed(() => readSources().displayMode === 'inline')
  const closeActionLabel = computed(() => (isInline.value ? '返回列表' : '关闭'))

  /** 当前登录用户在这条会话里的角色：需求方（甲方）或开发者（乙方）。 */
  const viewerRole = computed<'customer' | 'developer' | null>(() => {
    const { conversation, currentUsername } = readSources()
    if (!conversation || !currentUsername) {
      return null
    }
    if (conversation.customer === currentUsername) {
      return 'customer'
    }
    if (conversation.developer === currentUsername) {
      return 'developer'
    }
    return null
  })

  const conversationTitle = computed(() => {
    const { title, conversation } = readSources()
    return title || conversation?.requirement_title || '需求沟通'
  })

  const participantLabel = computed(() => {
    const { conversation, currentUsername } = readSources()
    if (!conversation) {
      return ''
    }

    if (currentUsername === conversation.customer) {
      return `开发者：${conversation.developer}`
    }
    if (currentUsername === conversation.developer) {
      return `用户：${conversation.customer}`
    }
    return `${conversation.customer} / ${conversation.developer}`
  })

  const peerName = computed(() => {
    const { conversation, currentUsername } = readSources()
    if (!conversation) {
      return '会话'
    }

    if (currentUsername === conversation.customer) {
      return conversation.developer
    }
    if (currentUsername === conversation.developer) {
      return conversation.customer
    }
    return conversation.developer || conversation.customer || '会话'
  })

  const peerInitial = computed(() => avatarText(peerName.value))

  /** 会话头副信息里的「对方」：会话还没载入时退回需求编号。 */
  const headerPeerLabel = computed(() =>
    readSources().conversation ? participantLabel.value : readSources().requirementId,
  )

  /**
   * 会话头副信息里的实时状态。
   *
   * 只报「出问题了」：连上、连接中、待连接都是正常过程，把这些状态一直挂在标题下面，
   * 等于让每个会话头顶都顶着一行会自己变色的字；只有断线重连才值得占这一行。
   */
  const realtimeStatusLabel = computed(() => {
    const status = readSources().realtimeStatus
    return status === 'error' ? '实时重连中' : ''
  })

  return {
    isInline,
    closeActionLabel,
    viewerRole,
    conversationTitle,
    participantLabel,
    peerName,
    peerInitial,
    headerPeerLabel,
    realtimeStatusLabel,
  }
}

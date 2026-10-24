import { computed } from 'vue'

import type { RequirementConversation } from '@/shared/conversations'
import { avatarText, formatFullDateTime } from '@/shared/conversationTime'

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

  const lastMessageLabel = computed(() => {
    const { conversation } = readSources()
    if (!conversation?.last_message_at) {
      return '尚无消息'
    }
    return `最近 ${formatFullDateTime(conversation.last_message_at)}`
  })

  const realtimeStatusLabel = computed(() => {
    const status = readSources().realtimeStatus
    if (status === 'connected') {
      return '实时同步中'
    }
    if (status === 'error') {
      return '实时重连中'
    }
    if (status === 'connecting') {
      return '实时连接中'
    }
    return '实时待连接'
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
    lastMessageLabel,
    realtimeStatusLabel,
  }
}

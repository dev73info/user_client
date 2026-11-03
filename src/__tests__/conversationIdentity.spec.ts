import { describe, expect, it } from 'vitest'

import { useConversationIdentity } from '@/composables/useConversationIdentity'
import type { RequirementConversation } from '@/shared/conversations'

const conversation: RequirementConversation = {
  id: 1,
  conversation_id: 'conv-1',
  requirement_id: 'REQ-1',
  requirement_title: '企业官网',
  customer: 'alice',
  developer: 'bob',
  status: 'open',
  requirement_status: 'in_development',
  unread_count: 0,
  created_at: '2026-11-03 10:00:00',
  updated_at: '2026-11-03 10:00:00',
}

function identity(displayMode: 'modal' | 'inline') {
  return useConversationIdentity(() => ({
    requirementId: 'REQ-1',
    currentUsername: 'alice',
    displayMode,
    conversation,
    realtimeStatus: 'connected',
  }))
}

describe('会话身份文案', () => {
  it('工作台内嵌会话头不展示对方那一行', () => {
    expect(identity('inline').headerPeerLabel.value).toBe('')
  })

  it('独立会话弹窗仍展示对方', () => {
    expect(identity('modal').headerPeerLabel.value).toBe('开发者：bob')
  })
})

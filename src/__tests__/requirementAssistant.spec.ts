import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  adoptRequirementDraft,
  createRequirementAgentConversation,
  getRequirementAgentConversation,
  listMyRequirementAgentConversations,
  requestRequirementAgentHandoff,
  sendRequirementAgentMessage,
} from '@/api/requirementAgent'
import {
  AGENT_PENDING_DRAFT_KEY,
  consumePendingAgentDraft,
  draftToPublishForm,
  savePendingAgentDraft,
} from '@/shared/requirementAssistant'

const mocks = vi.hoisted(() => ({ requestJson: vi.fn(), authHeaders: vi.fn() }))

vi.mock('@/api/http', () => ({
  requestJson: mocks.requestJson,
  authHeaders: mocks.authHeaders,
}))

const draft = {
  id: 3,
  owner_username: 'alice',
  title: '企业官网',
  description_html: '需要响应式官网',
  acceptance_html: '移动端无横向滚动',
  budget_fen: 300000,
  acceptance: '',
  payment_mode: 'platform_guarantee',
  missing_fields: [],
  status: 'ready',
  source: 'ai',
  last_editor: 'ai',
  created_at: '2026-10-27 04:00:00',
  updated_at: '2026-10-27 04:00:00',
  published_requirement_id: null,
}

describe('需求助手接口与草稿回填', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authHeaders.mockReturnValue({ Authorization: 'Bearer token' })
    mocks.requestJson.mockResolvedValue({})
    sessionStorage.clear()
  })

  it('会话列表、创建、追问、转人工与采纳走真实契约路径', async () => {
    await listMyRequirementAgentConversations('token')
    await createRequirementAgentConversation('token', '想做官网', 'user')
    await getRequirementAgentConversation('token', 2)
    await sendRequirementAgentMessage('token', 2, '预算 3000')
    await requestRequirementAgentHandoff('token', 2)
    await adoptRequirementDraft('token', 3)

    expect(mocks.requestJson.mock.calls.map((call) => call[0])).toEqual([
      '/requirement-agent/conversations/mine',
      '/requirement-agent/conversations',
      '/requirement-agent/conversations/2',
      '/requirement-agent/conversations/2/messages',
      '/requirement-agent/conversations/2/handoff',
      '/requirement-agent/drafts/3/adopt',
    ])
  })

  it('草稿金额从分换算为元，采纳值可跨页一次性消费', () => {
    const values = draftToPublishForm(draft as never)
    expect(values.budget).toBe('3000')
    expect(values.description).toContain('响应式官网')
    savePendingAgentDraft(values)
    expect(consumePendingAgentDraft()).toEqual(values)
    expect(sessionStorage.getItem(AGENT_PENDING_DRAFT_KEY)).toBeNull()
  })
})

import { authHeaders, requestJson } from '@/api/http'
import type { components } from '@/api/generated/schema'

type Schemas = components['schemas']

export type RequirementAgentConversation = Schemas['AgentConversationResponse']
export type RequirementAgentMessage = Schemas['AgentMessageResponse']
export type RequirementDraft = Schemas['AgentDraftResponse']
export type RequirementAgentConversationDetail = Schemas['AgentConversationDetailResponse']

export async function createRequirementAgentConversation(
  token: string,
  content: string,
  userRole?: string,
): Promise<RequirementAgentConversationDetail> {
  return requestJson<RequirementAgentConversationDetail>(
    '/requirement-agent/conversations',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(userRole ? { content, user_role: userRole } : { content }),
    },
    '发起 AI 需求分析失败',
  )
}

export async function listMyRequirementAgentConversations(
  token: string,
): Promise<RequirementAgentConversation[]> {
  return requestJson<RequirementAgentConversation[]>(
    '/requirement-agent/conversations/mine',
    { headers: authHeaders(token) },
    '加载需求助手会话失败',
  )
}

export async function getRequirementAgentConversation(
  token: string,
  id: number,
): Promise<RequirementAgentConversationDetail> {
  return requestJson<RequirementAgentConversationDetail>(
    `/requirement-agent/conversations/${id}`,
    { headers: authHeaders(token) },
    '加载需求会话详情失败',
  )
}

export async function sendRequirementAgentMessage(
  token: string,
  id: number,
  content: string,
): Promise<RequirementAgentConversationDetail> {
  return requestJson<RequirementAgentConversationDetail>(
    `/requirement-agent/conversations/${id}/messages`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content }),
    },
    '发送消息失败',
  )
}

export async function requestRequirementAgentHandoff(
  token: string,
  id: number,
): Promise<RequirementAgentConversationDetail> {
  return requestJson<RequirementAgentConversationDetail>(
    `/requirement-agent/conversations/${id}/handoff`,
    { method: 'POST', headers: authHeaders(token) },
    '转人工客服失败',
  )
}

export async function adoptRequirementDraft(
  token: string,
  draftId: number,
): Promise<RequirementDraft> {
  return requestJson<RequirementDraft>(
    `/requirement-agent/drafts/${draftId}/adopt`,
    { method: 'POST', headers: authHeaders(token) },
    '采纳需求草稿失败',
  )
}

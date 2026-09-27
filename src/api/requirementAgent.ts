import { authHeaders, requestJson } from '@/api/http'

/** AI 需求分析会话状态：AI 进行中 / 已转人工 / 已结束 / 已发布 */
export type RequirementAgentConversationStatus =
  | 'ai_active'
  | 'agent_takeover'
  | 'closed'
  | 'published'

/** 草稿状态：收集中 / 字段齐全可采纳 / 已采纳回填 / 已废弃 */
export type RequirementDraftStatus = 'collecting' | 'ready' | 'adopted' | 'discarded'

export type RequirementAgentConversation = {
  id: number
  conversation_no: string
  user_username: string
  user_role: string
  status: RequirementAgentConversationStatus
  agent_username: string | null
  last_message: string | null
  last_message_at: string | null
  last_message_by: string | null
  unread_agent: number
  unread_user: number
  /** 当前草稿 id（尚未生成草稿时为空） */
  draft_id: number | null
  /** 草稿字段齐全、可直接采纳 */
  draft_ready: boolean
  ai_turns: number
  created_at: string
  updated_at: string
}

export type RequirementAgentMessage = {
  id: number
  conversation_id: number
  sender_username: string
  /** 用户 / AI 助手 / 平台客服 / 系统提示 */
  sender_role: 'user' | 'ai' | 'agent' | 'system'
  content: string
  created_at: string
}

export type RequirementDraft = {
  id: number
  conversation_id: number | null
  owner_username: string
  title: string
  description_html: string
  budget: number | null
  acceptance_html: string
  payment_mode: 'platform_guarantee' | 'self_managed'
  /** 仍缺的字段，前端据此高亮待补项 */
  missing_fields: string[]
  status: RequirementDraftStatus
  source: 'ai' | 'agent'
  last_editor: string
  published_requirement_id: string | null
  created_at: string
  updated_at: string
}

export type RequirementAgentConversationDetail = {
  conversation: RequirementAgentConversation
  messages: RequirementAgentMessage[]
  draft: RequirementDraft | null
}

/** 发起会话，首条消息即用户的开场描述，同步返回 AI 回复与草稿 */
export async function createRequirementAgentConversation(
  token: string,
  content: string,
  userRole?: string,
): Promise<RequirementAgentConversationDetail> {
  return requestJson(
    '/requirement-agent/conversations',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(userRole ? { content, user_role: userRole } : { content }),
    },
    '发起 AI 需求分析失败',
  )
}

/** 我的 AI 需求分析会话列表（按最近更新倒序） */
export async function listMyRequirementAgentConversations(
  token: string,
): Promise<RequirementAgentConversation[]> {
  return requestJson(
    '/requirement-agent/conversations/mine',
    { headers: authHeaders(token) },
    '加载 AI 需求会话失败',
  )
}

/** 会话详情：含全部消息与当前草稿 */
export async function getRequirementAgentConversation(
  token: string,
  id: number,
): Promise<RequirementAgentConversationDetail> {
  return requestJson(
    `/requirement-agent/conversations/${id}`,
    { headers: authHeaders(token) },
    '加载 AI 需求会话详情失败',
  )
}

/** 追问：写入消息并同步等待 AI 回复 */
export async function sendRequirementAgentMessage(
  token: string,
  id: number,
  content: string,
): Promise<RequirementAgentConversationDetail> {
  return requestJson(
    `/requirement-agent/conversations/${id}/messages`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content }),
    },
    '发送消息失败',
  )
}

/** 转平台客服接手（接手后 AI 不再自动应答） */
export async function requestRequirementAgentHandoff(
  token: string,
  id: number,
): Promise<RequirementAgentConversationDetail> {
  return requestJson(
    `/requirement-agent/conversations/${id}/handoff`,
    { method: 'POST', headers: authHeaders(token) },
    '转人工客服失败',
  )
}

/** 采纳草稿：标记草稿已回填到发布表单（需求仍由用户本人确认发布） */
export async function adoptRequirementDraft(
  token: string,
  draftId: number,
): Promise<RequirementDraft> {
  return requestJson(
    `/requirement-agent/drafts/${draftId}/adopt`,
    { method: 'POST', headers: authHeaders(token) },
    '采纳需求草稿失败',
  )
}

/** 会话实时事件地址（后端在会话创建 / 发消息 / 接手 / 草稿更新时推送完整详情） */
export function requirementAgentConversationWsUrl(token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/api/requirement-agent/conversations/ws?token=${encodeURIComponent(token)}`
}

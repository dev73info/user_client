import type { RequirementAgentMessage, RequirementDraft } from '@/api/requirementAgent'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

export const AGENT_STARTER_EXAMPLES = [
  '想做一个企业官网，预算 3000 左右',
  '需要一个微信小程序，能下单和看订单',
  '把现有的后台管理系统的登录页改版',
]

export const AGENT_PENDING_DRAFT_KEY = '73info:agent-pending-draft'

const DRAFT_LABELS: Record<string, string> = {
  title: '需求标题',
  description: '需求描述',
  budget: '预算',
  acceptance: '验收标准',
  payment_mode: '发布方式',
}

export type RequirementAssistantFormValues = {
  title: string
  description: string
  budget: string
  acceptance: string
  paymentMode: 'platform_guarantee' | 'self_managed'
}

export function requirementDraftFieldLabel(key: string): string {
  return DRAFT_LABELS[key] ?? ''
}

export function formatAgentTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function agentSenderLabel(message: RequirementAgentMessage): string {
  if (message.sender_role === 'ai') return 'AI 助手'
  if (message.sender_role === 'agent') {
    return message.sender_username ? `${message.sender_username}（客服）` : '平台客服'
  }
  if (message.sender_role === 'system') return '系统提示'
  return '我'
}

function textToRichHtml(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/<(?:p|div|br|ul|ol|li|strong|em|h[1-6]|blockquote|a|code|pre)\b/i.test(trimmed)) {
    return sanitizeRichHtml(trimmed)
  }
  return sanitizeRichHtml(
    trimmed
      .split(/\n{2,}/)
      .map(
        (paragraph) =>
          `<p>${paragraph.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`,
      )
      .join(''),
  )
}

export function draftToPublishForm(draft: RequirementDraft): RequirementAssistantFormValues {
  return {
    title: draft.title.trim(),
    description: textToRichHtml(draft.description_html),
    budget: draft.budget_fen == null ? '' : String(draft.budget_fen / 100),
    acceptance: textToRichHtml(draft.acceptance_html),
    paymentMode:
      draft.payment_mode === 'platform_guarantee' ? 'platform_guarantee' : 'self_managed',
  }
}

export function savePendingAgentDraft(values: RequirementAssistantFormValues) {
  sessionStorage.setItem(AGENT_PENDING_DRAFT_KEY, JSON.stringify(values))
}

export function consumePendingAgentDraft(): RequirementAssistantFormValues | null {
  const raw = sessionStorage.getItem(AGENT_PENDING_DRAFT_KEY)
  if (!raw) return null
  sessionStorage.removeItem(AGENT_PENDING_DRAFT_KEY)
  try {
    const values = JSON.parse(raw) as Partial<RequirementAssistantFormValues>
    if (typeof values.title !== 'string' || typeof values.description !== 'string') return null
    return {
      title: values.title,
      description: values.description,
      budget: typeof values.budget === 'string' ? values.budget : '',
      acceptance: typeof values.acceptance === 'string' ? values.acceptance : '',
      paymentMode:
        values.paymentMode === 'platform_guarantee' ? 'platform_guarantee' : 'self_managed',
    }
  } catch {
    return null
  }
}

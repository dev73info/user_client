import type { RequirementDraft } from '@/api/requirementAgent'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

/**
 * 需求草稿与发布表单之间的映射。
 *
 * 草稿由 AI 或平台客服编辑，字段名与发布表单一一对应：
 * 标题 → publishTitle、描述 → publishDescription、预算 → publishBudget、
 * 验收标准 → publishAcceptance、发布方式 → publishPaymentMode。
 * 草稿里的描述与验收标准是富文本 HTML（后端已净化），回填前再过一次前端净化。
 */

/** 草稿字段的业务名称，用于「待补」提示 */
export const requirementDraftFieldLabels: Readonly<Record<string, string>> = {
  title: '需求标题',
  description: '需求描述',
  budget: '预算',
  acceptance: '验收标准',
  payment_mode: '发布方式',
}

/** 把草稿返回的字段 key 翻成中文；未知 key 直接忽略，不报错 */
export function requirementDraftFieldLabel(key: string): string {
  return requirementDraftFieldLabels[key] ?? ''
}

const htmlTagPattern =
  /<(?:p|div|br|ul|ol|li|strong|b|em|i|u|s|del|h[1-6]|table|thead|tbody|tr|td|th|blockquote|span|a|code|pre|hr|img|video)\b[^>]*>/i

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * 草稿文本转发布表单可用的富文本。
 *
 * 已经带标签的内容按 HTML 处理（只净化不改结构），纯文本则按空行拆段、
 * 段内换行转 `<br>`，让 AI 的纯文本答复在富文本编辑器里也有段落感。
 */
export function requirementDraftTextToRichHtml(value: string): string {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) {
    return ''
  }

  if (htmlTagPattern.test(trimmed)) {
    return sanitizeRichHtml(trimmed)
  }

  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((paragraph) => escapeHtmlText(paragraph.trim()).replace(/\n/g, '<br>'))
    .filter((paragraph) => paragraph.length > 0)

  return sanitizeRichHtml(paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join(''))
}

/** 回填到发布表单的值，键名与 PublishModal 的 v-model 一一对应 */
export type RequirementDraftFormValues = {
  title: string
  description: string
  budget: string
  acceptance: string
  paymentMode: 'platform_guarantee' | 'self_managed'
}

/**
 * 把草稿整理成发布表单的值。
 *
 * 只回填草稿里已有内容的字段：标题留空时退回表单原值，避免用空串把用户
 * 手填的内容抹掉（AI 可能只聊到一半就被采纳）。
 */
export function requirementDraftToFormValues(
  draft: RequirementDraft,
  fallback: Partial<RequirementDraftFormValues> = {},
): RequirementDraftFormValues {
  const title = draft.title.trim()
  const description = requirementDraftTextToRichHtml(draft.description_html)
  const acceptance = requirementDraftTextToRichHtml(draft.acceptance_html)
  const budget =
    draft.budget === null || draft.budget === undefined ? '' : String(draft.budget)

  return {
    title: title || fallback.title || '',
    description: description || fallback.description || '',
    budget: budget || fallback.budget || '',
    acceptance: acceptance || fallback.acceptance || '',
    paymentMode:
      draft.payment_mode === 'platform_guarantee' ? 'platform_guarantee' : 'self_managed',
  }
}

/** 草稿是否已有可回填的内容 */
export function requirementDraftHasContent(draft: RequirementDraft | null): boolean {
  if (!draft) {
    return false
  }

  return Boolean(
    draft.title.trim() ||
      draft.description_html.trim() ||
      draft.acceptance_html.trim() ||
      (draft.budget !== null && draft.budget !== undefined),
  )
}

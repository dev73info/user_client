import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

export const requirementRichTextMaxBytes = 1024 * 1024

const textEncoder = new TextEncoder()

type RequirementRichTextValidationOptions = {
  required?: boolean
  minTextLength?: number
}

type RequirementRichTextValidationResult = {
  value: string
  text: string
  error: string
}

function parseRichText(value: string): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = sanitizeRequirementRichText(value)
  return template.content
}

export function sanitizeRequirementRichText(value: string): string {
  return sanitizeRichHtml(value).trim()
}

export function requirementRichTextByteLength(value: string): number {
  return textEncoder.encode(value).length
}

export function requirementRichTextPlainText(value: string): string {
  return (parseRichText(value).textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function requirementRichTextHasMeaningfulContent(value: string): boolean {
  const fragment = parseRichText(value)
  const text = (fragment.textContent ?? '').trim()
  return Boolean(text || fragment.querySelector('img, video, a.rich-editor-attachment'))
}

export function requirementRichTextPreview(value?: string | null, fallback = '暂无补充描述'): string {
  const text = requirementRichTextPlainText(value ?? '')
  return text || fallback
}

export function validateRequirementRichText(
  value: string,
  fieldLabel: string,
  options: RequirementRichTextValidationOptions = {},
): RequirementRichTextValidationResult {
  const normalizedValue = sanitizeRequirementRichText(value)
  const text = requirementRichTextPlainText(normalizedValue)

  if (options.required && !requirementRichTextHasMeaningfulContent(normalizedValue)) {
    return { value: normalizedValue, text, error: `${fieldLabel}不能为空` }
  }

  if (options.minTextLength && text.length < options.minTextLength) {
    return { value: normalizedValue, text, error: `${fieldLabel}至少 ${options.minTextLength} 个字符` }
  }

  if (requirementRichTextByteLength(normalizedValue) > requirementRichTextMaxBytes) {
    return { value: normalizedValue, text, error: `${fieldLabel}不能超过1MB` }
  }

  return { value: normalizedValue, text, error: '' }
}
import { describe, expect, it } from 'vitest'
import { acceptanceTemplates } from '@/utils/acceptanceTemplates'
import { requirementRichTextHasMeaningfulContent, requirementRichTextPlainText } from '@/utils/requirementRichText'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

describe('验收标准快捷模板', () => {
  it('提供「阶段性模板」与「功能性模板」', () => {
    expect(acceptanceTemplates.map((template) => template.name)).toEqual(['阶段性模板', '功能性模板'])
    expect(new Set(acceptanceTemplates.map((template) => template.id)).size).toBe(acceptanceTemplates.length)
    for (const template of acceptanceTemplates) {
      expect(template.description.length).toBeGreaterThan(0)
    }
  })

  it('模板经过富文本净化后内容不被剥掉', () => {
    for (const template of acceptanceTemplates) {
      const sanitized = sanitizeRichHtml(template.html)
      expect(requirementRichTextPlainText(sanitized)).toBe(requirementRichTextPlainText(template.html))
      // 结构化骨架依赖列表与加粗，净化后必须保留
      expect(sanitized).toContain('<ul>')
      expect(sanitized).toContain('<li>')
      expect(sanitized).toContain('<strong>')
    }
  })

  it('填入后可通过「验收标准不能为空」校验', () => {
    for (const template of acceptanceTemplates) {
      expect(requirementRichTextHasMeaningfulContent(template.html)).toBe(true)
      expect(requirementRichTextPlainText(template.html).length).toBeGreaterThan(20)
    }
  })

  it('模板包含括号占位提示，便于用户补充内容', () => {
    for (const template of acceptanceTemplates) {
      expect(requirementRichTextPlainText(template.html)).toContain('（')
    }
  })
})

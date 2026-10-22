import MarkdownIt from 'markdown-it'
import { common, createLowlight } from 'lowlight'

import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

/**
 * 资源详情页（`ResourceDetailPanel`）富文本正文的渲染管线。
 *
 * 从组件里整段搬出来，组件只留一次 `formatHomepageContent(...)` 调用：
 * 发布说明（`release_note`）与历史版本的补充说明（`version.note`）都走这里，
 * 两处必须同一条管线，否则同一个作者写的两段话会渲染成两种样子。
 *
 * 顺序是「先定内容、再定结构」：
 *   1. 看起来是 HTML（含标签）就只做白名单清洗，纯文本才过 Markdown；
 *   2. 清洗过的富文本再补一遍代码块高亮（只读面与编辑器观感对齐）；
 *   3. 最后把表格包进 `.rich-table-scroll`，窄屏横向滚动而不是压成竖排。
 */

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})
markdownRenderer.enable(['table'])

const codeHighlighter = createLowlight(common)

type HastNode =
  | { type: 'text'; value: string }
  | {
      type: 'element'
      tagName: string
      properties?: { className?: string[] }
      children: HastNode[]
    }
  | { type: 'root'; children: HastNode[] }

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function hastToHtml(node: HastNode): string {
  if (node.type === 'text') {
    return escapeHtmlText(node.value)
  }
  if (node.type === 'root') {
    return node.children.map(hastToHtml).join('')
  }
  const classAttr = node.properties?.className?.length
    ? ` class="${node.properties.className.join(' ')}"`
    : ''
  const children = node.children.map(hastToHtml).join('')
  return `<${node.tagName}${classAttr}>${children}</${node.tagName}>`
}

// 让只读富文本中的代码块与编辑器保持一致：按语言重新高亮并补充 code-block 类。
function highlightRichCodeBlocks(html: string): string {
  if (!html) {
    return html
  }
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll<HTMLElement>('pre > code').forEach((codeElement) => {
    const preElement = codeElement.parentElement
    if (!preElement) {
      return
    }
    preElement.classList.add('code-block')
    const codeText = codeElement.textContent ?? ''
    if (!codeText.trim()) {
      return
    }
    const languageClass = Array.from(codeElement.classList).find((item) =>
      /^language-[a-z0-9_-]+$/i.test(item),
    )
    const language = languageClass ? languageClass.slice('language-'.length) : undefined
    try {
      const registered =
        language && codeHighlighter.listLanguages().includes(language.toLowerCase())
      const root = registered
        ? codeHighlighter.highlight(language!.toLowerCase(), codeText)
        : codeHighlighter.highlightAuto(codeText)
      const children = (root as { children?: HastNode[] }).children ?? []
      const detectedLanguage = registered
        ? language!.toLowerCase()
        : ((root as { data?: { language?: string } }).data?.language ?? undefined)
      // 未识别出语言时（例如纯中文文本），保留原始内容，仅应用代码块外观，避免内容被清空
      if (children.length === 0 || !detectedLanguage) {
        return
      }
      codeElement.innerHTML = hastToHtml(root as HastNode)
      codeElement.classList.add('hljs')
      codeElement.classList.add(`language-${detectedLanguage}`)
    } catch {
      // 单个代码块高亮失败时保留原始内容
    }
  })
  return template.innerHTML
}

// 把富文本表格包进可横向滚动的容器，避免移动端列被压得很窄导致文字竖排。
function wrapRichTables(html: string): string {
  if (!html) {
    return html
  }
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll('table').forEach((table) => {
    const wrap = document.createElement('div')
    wrap.className = 'rich-table-scroll'
    table.parentNode?.insertBefore(wrap, table)
    wrap.appendChild(table)
  })
  return template.innerHTML
}

/** 富文本正文 → 可直接 `v-html` 的 HTML（Markdown / HTML 两种来源都走这一条）。 */
export function formatHomepageContent(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  const rendered = /<\/?[a-z][\s\S]*>/i.test(trimmed)
    ? sanitizeRichHtml(trimmed)
    : sanitizeRichHtml(markdownRenderer.render(trimmed))

  return wrapRichTables(highlightRichCodeBlocks(rendered))
}

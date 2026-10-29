import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'

const allowedTags = [
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
  'video',
]

const allowedAttrs = [
  'alt',
  'aria-label',
  'class',
  'colspan',
  'controls',
  'href',
  'poster',
  'preload',
  'rel',
  'rowspan',
  'src',
  'target',
  'title',
]

const fontSizeMin = 12
const fontSizeMax = 48

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})
markdownRenderer.enable(['table'])

const domPurifyConfig = {
  ALLOWED_ATTR: allowedAttrs,
  ALLOWED_TAGS: allowedTags,
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|\/(?!\/)|#)/i,
  FORBID_TAGS: [
    'button',
    'embed',
    'form',
    'iframe',
    'input',
    'math',
    'object',
    'script',
    'select',
    'style',
    'svg',
    'textarea',
  ],
}

const legacyRepeatedBytesPattern = /^(?:\\x[0-9a-f]{2})+$/i
const legacyHexPayloadPattern = /^\\x((?:[0-9a-f]{2})+)$/i

/**
 * 1.0 迁移数据里有一部分正文被整体写成了十六进制 UTF-8 字节串：
 * 常见形态是开头一个 `\x` 后跟连续十六进制，也兼容每个字节都带 `\x` 的写法。
 * 只在整段文本都由这种字节转义组成时还原，避免把普通正文里的代码示例误当迁移数据。
 */
export function decodeLegacyEscapedText(value: string): string {
  const trimmed = value.trim()
  let hexPayload = ''
  if (legacyRepeatedBytesPattern.test(trimmed)) {
    hexPayload = trimmed.replace(/\\x/gi, '')
  } else {
    hexPayload = trimmed.match(legacyHexPayloadPattern)?.[1] ?? ''
  }
  if (!hexPayload) {
    return value
  }

  try {
    const bytes = Array.from({ length: hexPayload.length / 2 }, (_, index) =>
      Number.parseInt(hexPayload.slice(index * 2, index * 2 + 2), 16),
    )
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    return value
  }
}

function normalizeStoredRichText(value: string): string {
  const decoded = decodeLegacyEscapedText(value)
  if (decoded === value) {
    return value
  }

  const trimmed = decoded.trim()
  return /<\/?[a-z][^>]*>/i.test(trimmed) ? trimmed : markdownRenderer.render(trimmed)
}

function normalizeFontSize(value: string): string {
  const normalizedValue = value.trim()
  const parsed = normalizedValue.match(/^(\d+(?:\.\d+)?)(?:px)?$/i)
    ? Number.parseFloat(normalizedValue)
    : Number.NaN
  if (!Number.isFinite(parsed)) {
    return ''
  }

  const size = Math.min(fontSizeMax, Math.max(fontSizeMin, Math.round(parsed)))
  return `${size}px`
}

function keepAllowedInlineStyles(value: string): string {
  const template = document.createElement('template')
  template.innerHTML = value

  template.content.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    const fontSize = normalizeFontSize(element.style.fontSize)
    element.removeAttribute('style')
    if (fontSize) {
      element.style.fontSize = fontSize
    }
  })

  template.content.querySelectorAll<HTMLElement>('[href], [src], [poster]').forEach((element) => {
    for (const attribute of ['href', 'src', 'poster']) {
      const value = element.getAttribute(attribute)
      if (value !== null && !domPurifyConfig.ALLOWED_URI_REGEXP.test(value.trim())) {
        element.removeAttribute(attribute)
      }
    }
  })

  template.content.querySelectorAll<HTMLAnchorElement>('a').forEach((anchor) => {
    anchor.setAttribute('rel', 'noopener noreferrer')
  })

  return template.innerHTML
}

function purifyRichHtml(value: string): string {
  return DOMPurify.sanitize(value, domPurifyConfig)
}

export function renderMarkdownToRichHtml(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  return keepAllowedInlineStyles(purifyRichHtml(markdownRenderer.render(trimmed)))
}

function renderMarkdownCodeBlocks(value: string): string {
  const template = document.createElement('template')
  template.innerHTML = value

  template.content
    .querySelectorAll<HTMLElement>('pre > code.language-md, pre > code.language-markdown')
    .forEach((codeElement) => {
      const preElement = codeElement.parentElement
      if (!preElement) {
        return
      }

      const renderedTemplate = document.createElement('template')
      renderedTemplate.innerHTML = renderMarkdownToRichHtml(codeElement.textContent || '')
      preElement.replaceWith(...Array.from(renderedTemplate.content.childNodes))
    })

  return template.innerHTML
}

export function sanitizeRichHtml(value: string): string {
  return keepAllowedInlineStyles(
    renderMarkdownCodeBlocks(purifyRichHtml(normalizeStoredRichText(value))),
  )
}

/**
 * 仅做安全净化，不转换 markdown 代码块。
 * 用于编辑器 onUpdate 等场景，避免将 language-md 代码块转为富文本导致编辑状态丢失。
 */
export function sanitizeRichHtmlForEditing(value: string): string {
  return keepAllowedInlineStyles(purifyRichHtml(normalizeStoredRichText(value)))
}

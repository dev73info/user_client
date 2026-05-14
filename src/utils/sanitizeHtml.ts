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
  'style',
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
  return keepAllowedInlineStyles(renderMarkdownCodeBlocks(purifyRichHtml(value)))
}

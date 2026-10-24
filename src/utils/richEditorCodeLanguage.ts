import type { Editor } from '@tiptap/vue-3'
import { common, createLowlight } from 'lowlight'

/**
 * 富文本编辑器的代码语言与 Markdown 处理。
 *
 * 从 `RichTextEditor.vue` 里整块搬出来：语言列表、别名归一、``` 围栏的读写、
 * 以及「这段粘贴文本看起来是不是 Markdown」的判断。lowlight 实例也放这里，
 * 因为代码块的 renderHTML（扩展开在 `richTextEditorExtensions.ts`）与工具栏的
 * 「当前代码块语言」探测共用同一个实例，分开建会让两边的高亮结果不一致。
 */

export const markdownCodeBlockLanguage = 'md'

export const codeLanguageOptions: Array<{ label: string; value: string; aliases?: string[] }> = [
  { label: '纯文本', value: '' },
  { label: 'MD', value: markdownCodeBlockLanguage, aliases: ['markdown'] },
  { label: 'JSON', value: 'json' },
  { label: 'Rust', value: 'rust', aliases: ['rs'] },
  { label: 'C++', value: 'cpp', aliases: ['c++', 'cxx', 'cc'] },
  { label: 'C', value: 'c' },
  { label: 'C#', value: 'csharp', aliases: ['c#', 'cs'] },
  { label: 'Java', value: 'java' },
  { label: 'JavaScript', value: 'javascript', aliases: ['js'] },
  { label: 'TypeScript', value: 'typescript', aliases: ['ts'] },
  { label: 'Python', value: 'python', aliases: ['py'] },
  { label: 'Go', value: 'go', aliases: ['golang'] },
  { label: 'SQL', value: 'sql' },
  { label: 'Shell', value: 'shell', aliases: ['bash', 'sh', 'zsh'] },
  { label: 'HTML', value: 'html' },
  { label: 'CSS', value: 'css' },
  { label: 'XML', value: 'xml' },
  { label: 'YAML', value: 'yaml', aliases: ['yml'] },
]

const codeLanguageAliasMap = new Map<string, string>()
codeLanguageOptions.forEach((option) => {
  if (option.value) {
    codeLanguageAliasMap.set(option.value, option.value)
  }
  option.aliases?.forEach((alias) => {
    codeLanguageAliasMap.set(alias, option.value)
  })
})

export const codeHighlighter = createLowlight(common)

/** 从 lowlight 的自动探测结果里取语言名，探测不出或异常时返回 null。 */
export function detectHighlightLanguage(text: string): string | null {
  try {
    const auto = codeHighlighter.highlightAuto(text || '')
    const detected = (auto as { data?: { language?: string } } | null)?.data?.language
    if (detected && codeHighlighter.listLanguages().includes(detected)) {
      return detected
    }
  } catch {
    return null
  }
  return null
}

/** 探测代码块语言并归一到语言列表里的取值（用于工具栏显示当前语言）。 */
export function detectCodeBlockLanguage(text: string): string | null {
  const detected = detectHighlightLanguage(text)
  return detected ? normalizeCodeBlockLanguage(detected) : null
}

export function normalizeCodeBlockLanguage(value: unknown): string {
  const normalizedValue = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_+#.-]/g, '')

  if (normalizedValue === 'markdown') {
    return markdownCodeBlockLanguage
  }

  return codeLanguageAliasMap.get(normalizedValue) ?? normalizedValue
}

function getMarkdownFenceForCode(code: string): string {
  const longestBacktickFence = (code.match(/`{3,}/g) ?? []).reduce(
    (maxLength, match) => Math.max(maxLength, match.length),
    2,
  )
  return '`'.repeat(longestBacktickFence + 1)
}

export function createMarkdownCodeFence(language: string, code: string): string {
  const normalizedCode = code.replace(/\r\n?/g, '\n')
  const codeBody = normalizedCode.endsWith('\n') ? normalizedCode : `${normalizedCode}\n`
  const fence = getMarkdownFenceForCode(normalizedCode)

  return `${fence}${normalizeCodeBlockLanguage(language)}\n${codeBody}${fence}`
}

export function parseMarkdownCodeFence(value: string): { language: string; code: string } | null {
  const normalizedValue = value.replace(/\r\n?/g, '\n').trim()
  const match = normalizedValue.match(/^(`{3,}|~{3,})([A-Za-z0-9_+#.-]*)[^\n]*\n([\s\S]*?)\n\1\s*$/)
  if (!match) {
    return null
  }

  return {
    language: normalizeCodeBlockLanguage(match[2] ?? ''),
    code: match[3] ?? '',
  }
}

export const markdownTextSerializers: NonNullable<
  Parameters<Editor['getText']>[0]
>['textSerializers'] = {
  codeBlock: ({ node }) => createMarkdownCodeFence(node.attrs.language, node.textContent),
}

export function isMarkdownCodeBlockLanguage(language: string): boolean {
  return ['md', 'markdown'].includes(language)
}

export function looksLikeMarkdown(text: string): boolean {
  const lines = text.split('\n')
  let tableSeparatorCount = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^\|[-:| ]+\|$/.test(trimmed)) {
      tableSeparatorCount++
    }
  }
  if (tableSeparatorCount >= 1) {
    return true
  }
  const markdownPatterns =
    /^#{1,6}\s|^\s*[-*+]\s|^\s*>\s|^\d+\.\s|```|~~~|\*\*[^*]+\*\*|\[.+\]\(.+\)/m
  return markdownPatterns.test(text)
}

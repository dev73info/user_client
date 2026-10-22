// 协议正文（纯文本）→ 页面区块的共用解析（R043 任务-03）。
//
// 为什么要有它：后端 `contract_template` 存的是**纯文本**（与四份主协议、签署页一致），
// 而《隐私政策》《支付与退款说明》页面原先渲染的是前端 JSON 的 block 结构。
// 两种结构并存就会出现"页面改了、库里没改"的分叉，所以统一按纯文本解析。
//
// 解析规则（与 `src/views/TermsView.vue` 原来的 splitLines 同一套口径）：
//   * 「一、」「第一节」开头 → 章节标题；
//   * 「1. 2.」开头且**不以句号结尾** → 章节标题（配套附件的节标题就是这种，
//     而主协议正文里的「1. …。」是条目、不是标题，靠句号区分开）；
//   * 「-」「•」开头 → 列表项；
//   * 其余非空行 → 段落。
//
// 锚点：章节标题的 id **由标题文本自动生成**（不写死常量）。
// 改章节名会让旧链接失效，但手写常量在改章节名时不会跟着变，更糟；
// 而且提示组件的跳转目标必须跟着协议正文走，不能两边各写一份。
// 跳转用 `#` + encodeURIComponent(标题)——中文锚点必须编码，否则浏览器定位不到。

export type LegalTextBlock =
  | { type: 'heading'; text: string; id: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }

/**
 * 把前端 JSON 兜底快照转成与纯文本解析同构的区块。
 *
 * 兜底快照只在前端接口不可用时用（构建期静态快照也用它），
 * 所以链接退化成文字（纯文本正文里本来就没有链接）。
 */
export function legalDocumentToBlocks(doc: {
  blocks?: {
    type: string
    text?: string
    label?: string
    items?: string[]
    before?: string
    linkText?: string
    to?: string
    after?: string
  }[]
}): LegalTextBlock[] {
  const blocks: LegalTextBlock[] = []
  for (const block of doc.blocks ?? []) {
    if (block.type === 'heading' && block.text) {
      blocks.push({ type: 'heading', text: block.text, id: legalSectionId(block.text) })
    } else if (block.type === 'paragraph' && block.text) {
      blocks.push({ type: 'paragraph', text: block.text })
    } else if (block.type === 'effective') {
      blocks.push({ type: 'paragraph', text: `${block.label ?? ''}：${block.text ?? ''}` })
    } else if (block.type === 'list' && block.items) {
      blocks.push({ type: 'list', items: [...block.items] })
    } else if (block.type === 'paragraph-link') {
      blocks.push({
        type: 'paragraph',
        text: `${block.before ?? ''}${block.linkText ?? ''}（${block.to ?? ''}）${block.after ?? ''}`,
      })
    }
  }
  return blocks
}

/** 章节标题的 DOM id：直接用标题文本，页面里由渲染函数生成。 */
export function legalSectionId(title: string): string {
  return title.trim()
}

/** 指向某个章节的 hash 片段（中文需编码）。 */
export function legalSectionAnchor(title: string): string {
  return `#${encodeURIComponent(title.trim())}`
}

/** 判断一行是不是章节标题。 */
export function isLegalHeading(line: string): boolean {
  const text = line.trim()
  if (!text) return false
  // 「一、」「二、」这类中文序号：主协议的章节标题。
  if (/^第[一二三四五六七八九十百零\d]+[章节条]/.test(text)) return true
  if (/^[一二三四五六七八九十百]+[、.．]/.test(text)) return true
  // 「1. 2.」这类数字序号：配套附件的章节标题。
  // 主协议正文里的「1. …。」是条目，末尾有句号，不算标题。
  if (/^\d{1,2}[.．]\s*\S/.test(text)) return !/[。．]$/.test(text)
  return false
}

/** 把纯文本正文切成页面区块。 */
export function parseLegalText(content: string): LegalTextBlock[] {
  const blocks: LegalTextBlock[] = []
  let pendingList: string[] = []

  const flushList = () => {
    if (pendingList.length > 0) {
      blocks.push({ type: 'list', items: pendingList })
      pendingList = []
    }
  }

  for (const raw of String(content ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) {
      flushList()
      continue
    }
    if (/^[-•·]\s+/.test(line)) {
      pendingList.push(line.replace(/^[-•·]\s+/, ''))
      continue
    }
    flushList()
    if (isLegalHeading(line)) {
      blocks.push({ type: 'heading', text: line, id: legalSectionId(line) })
      continue
    }
    blocks.push({ type: 'paragraph', text: line })
  }

  flushList()
  return blocks
}

/** 从正文的区块里取出所有章节标题（供提示组件定位跳转目标）。 */
export function legalSectionHeadings(blocks: LegalTextBlock[]): { id: string; title: string }[] {
  return blocks
    .filter(
      (block): block is Extract<LegalTextBlock, { type: 'heading' }> => block.type === 'heading',
    )
    .map((block) => ({ id: block.id, title: block.text }))
}

/**
 * 按关键词在章节标题里找匹配项（返回标题原文，供拼 hash 锚点）。
 *
 * 提示组件的五个条目是**跨协议**的固定分类（责任限制 / 免责 / 费用与支付 /
 * 争议解决 / 协议变更），而各协议的章节名不一样（用户服务协议是「九、责任边界与
 * 责任限制」，开发者入驻协议是「八、违约责任」），所以只能按关键词找，不能写死锚点。
 */
export function findLegalSectionTitle(
  keyword: string,
  headings: { id: string; title: string }[],
): string | null {
  const hit = headings.find((item) => item.title.includes(keyword))
  return hit ? hit.title : null
}

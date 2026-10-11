// 法务页与「关于我们」的正文唯一出处。
//
// 为什么要单独抽一份：这些页面的正文原先只写在 `.vue` 模板里，构建期生成的静态快照
// （scripts/generate-seo-pages.mjs）拿不到，于是线上下发给爬虫的 HTML 只有「标题 + 一句话
// + 菜单」，是整站最薄的四页。抽成 JSON 之后，SPA 视图与静态快照脚本读同一份文案，
// 改文案不会再出现「页面改了、快照没改」的分叉。
//
// 注意：JSON 由 Node 直接读（`readFileSync` + `JSON.parse`），所以文案放在 `.json` 里而不是
// `.ts` 里；这里的类型与断言只是给前端用。
import raw from './legalContent.json'

export type LegalBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'effective'; label: string; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph-link'; before: string; linkText: string; to: string; after: string }

export type LegalDocument = {
  heading: string
  blocks: LegalBlock[]
}

export type AboutCard = {
  title: string
  text: string
}

export type AboutFact = {
  big: string
  small: string
}

export type AboutContent = {
  heroLines: string[]
  hint: string
  highlights: { heading: string; items: AboutCard[] }
  facts: { heading: string; items: AboutFact[] }
  forCreators: { heading: string; items: AboutCard[] }
  forClients: { heading: string; items: AboutCard[] }
  story: { heading: string; paragraphs: string[]; note: string }
  join: { heading: string; text: string }
}

export const privacyDocument = raw.privacy as LegalDocument

export const paymentRefundDocument = raw.paymentRefund as LegalDocument

export const aboutContent = raw.about as AboutContent

// 法务页与「关于我们」的正文出处。
//
// ⚠️ **R043 任务-02/03 之后的分工（2026-10-21）**：
//   * 后端 `contract_template` 是《隐私政策》《支付与退款说明》的**唯一事实源**；
//     页面直接展示后端下发的正文。
//   * 本文件 `privacy` / `paymentRefund` 两段**降级为"接口不可用时的构建期兜底快照"**，
//     只在前端拿不到后端接口时用（例如构建机连不上后端）。
//   * **改文案请改后端**（`backend_73info/src/db/schema_postgres/operations.sql`），
//     不要只改这里——只改这里会立刻出现"页面改了、库里没改"的分叉。
//   * `about` 段仍是前端的唯一出处，不动。
//
// 为什么要保留兜底快照：这些页面的正文原先只写在 `.vue` 模板里，构建期生成的静态快照
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

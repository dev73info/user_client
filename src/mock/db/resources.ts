import type { McResourcePayload, McResourceVersionPayload } from '@/api/mcResources'

import { DEV_NICKNAME, DEV_USERNAME, datetime, iso } from './shared'

/* ------------------------------------------------------------------ 资源与版本 */

/**
 * 演示用的开发者名录：门户贡献榜、卡片作者名都从这里取，别在别处再写一份用户名。
 * 用户名沿用 mock 里已有的演示账号（邀请榜里的 toolsmith_demo / zhang_demo）。
 */
export const MOCK_DEVELOPERS = {
  dev: { username: DEV_USERNAME, nickname: DEV_NICKNAME },
  toolsmith: { username: 'toolsmith_demo', nickname: '柒参演示·铁匠' },
  zhang: { username: 'zhang_demo', nickname: '柒参演示·小张' },
  mochi: { username: 'mochi_dev', nickname: '柒参演示·麻薯' },
} as const

/** 常用标签：id / 名称 / 别名，取自 `db/tags.ts` 的「类型」分组。 */
const TAG_EFFICIENCY = { id: 1301, name: '效率工具', alias: 'efficiency' }
const TAG_DATA_SYNC = { id: 1302, name: '数据同步', alias: 'data-sync' }
const TAG_CONNECTOR = { id: 1303, name: '连接器', alias: 'connector' }

/**
 * 资源归到哪个标签分组里。
 *
 * 门户列表与「类型」筛选读的是 `tag_selections`；只给 `platform` 不够，
 * 卡片上会显示成「未标注」、左侧筛选分区也勾不上。分组取自 `db/tags.ts` 同一棵树。
 */
function tagSelectionOf(tags: ReadonlyArray<{ id: number; name: string; alias: string }>) {
  return {
    group_id: 1201,
    group_name: '类型',
    group_alias: 'type',
    group_path: ['资源项目', '类型'],
    group_path_aliases: ['resources', 'type'],
    tag_ids: tags.map((tag) => tag.id),
    tag_names: tags.map((tag) => tag.name),
    tag_aliases: tags.map((tag) => tag.alias),
  }
}

/** 一条资源的种子参数：能少写就少写，其余走默认值。 */
type ResourceSeed = {
  id: number
  title: string
  description: string
  visibility?: McResourcePayload['visibility']
  /** 最近更新在几天前 */
  updatedDaysAgo: number
  createdDaysAgo?: number
  requirementCode?: string | null
  author?: { username: string; nickname: string }
  tags?: ReadonlyArray<{ id: number; name: string; alias: string }>
  /** 团队资源：归属团队并挂到团队名下 */
  team?: { id: number }
  origin?: { type: 'original' | 'repost'; author?: string | null; org?: string | null }
  price?: { buyoutFen?: number; priceFen?: number; points?: number }
  copyrightDeclared?: boolean
}

function buildResource(seed: ResourceSeed): McResourcePayload {
  const author = seed.author ?? MOCK_DEVELOPERS.dev
  const tags = seed.tags ?? [TAG_EFFICIENCY]
  return {
    id: seed.id,
    creator: author.username,
    ownership_type: seed.team ? 'team' : 'individual',
    team_id: seed.team?.id ?? null,
    requirement_id: seed.requirementCode ?? null,
    platform: '自研工具',
    title: seed.title,
    author: author.nickname,
    description: seed.description,
    tag_selections: [tagSelectionOf(tags)],
    file_name: `${seed.title}.zip`,
    source_url: '',
    cover_url: null,
    docs_url: null,
    visibility: seed.visibility ?? 'published',
    release_note: null,
    origin_type: seed.origin?.type ?? 'original',
    origin_author: seed.origin?.author ?? null,
    origin_url: null,
    origin_org: seed.origin?.org ?? null,
    origin_note: null,
    buyout_price_fen: seed.price?.buyoutFen ?? 0,
    price_fen: seed.price?.priceFen ?? 0,
    price_points: seed.price?.points ?? 0,
    copyright_declared: seed.copyrightDeclared ?? false,
    copyright_declared_at: seed.copyrightDeclared ? iso(-seed.updatedDaysAgo, 12, 0) : null,
    purchased_by_me: false,
    created_at: iso(-(seed.createdDaysAgo ?? 40), 9, 0),
    updated_at: iso(-seed.updatedDaysAgo, 15, 20),
    promo_share_bps: 0,
  }
}

export const mcResources: McResourcePayload[] = [
  buildResource({
    id: 9001,
    title: '跨境电商订单同步插件',
    description: '把 Amazon / Shopify / TikTok Shop 的订单聚合到一张表，支持库存对账。',
    updatedDaysAgo: 2,
    requirementCode: 'REQ-20260907-0051',
  }),
  buildResource({
    id: 9002,
    title: '企业微信审批流连接器',
    description: '接收企业微信审批回调并转发到内部系统，内置重试与日志。',
    updatedDaysAgo: 4,
    requirementCode: 'REQ-20260828-0042',
  }),
  buildResource({
    id: 9003,
    title: '小程序订单提醒机器人',
    description: '订单状态变更推送到企业微信，支持免打扰时段。',
    updatedDaysAgo: 6,
    price: { buyoutFen: 990, priceFen: 990 },
    copyrightDeclared: true,
  }),
  buildResource({
    id: 9004,
    title: '经营数据看板模板',
    description: '通用门店经营看板模板，含日报周报与导出。',
    visibility: 'review',
    updatedDaysAgo: 1,
  }),
  buildResource({
    id: 9005,
    title: '会议纪要整理助手',
    description: '把录音转写文本整理成待办与结论，输出可直接分发的纪要。',
    updatedDaysAgo: 3,
    createdDaysAgo: 26,
    author: MOCK_DEVELOPERS.mochi,
    tags: [TAG_EFFICIENCY],
  }),
  buildResource({
    id: 9006,
    title: '飞书多维表格同步器',
    description: '多维表格与内部系统双向同步，冲突按更新时间优先合并。',
    updatedDaysAgo: 5,
    createdDaysAgo: 33,
    author: MOCK_DEVELOPERS.toolsmith,
    tags: [TAG_CONNECTOR],
    requirementCode: 'REQ-20260912-0063',
  }),
  buildResource({
    id: 9007,
    title: '库存盘点对账脚本',
    description: '按仓库导出盘点表，与账面数量比对并生成差异清单。',
    updatedDaysAgo: 7,
    createdDaysAgo: 45,
    author: MOCK_DEVELOPERS.zhang,
    tags: [TAG_DATA_SYNC],
    requirementCode: 'REQ-20260912-0063',
  }),
  buildResource({
    id: 9008,
    title: '客服工单批量导出工具',
    description: '按筛选条件批量导出工单，含处理时长与满意度字段。',
    updatedDaysAgo: 9,
    createdDaysAgo: 52,
    tags: [TAG_EFFICIENCY],
    requirementCode: 'REQ-20260916-0069',
  }),
  buildResource({
    id: 9009,
    title: '物流轨迹查询接入示例',
    description: '统一三家物流商的轨迹查询接口，返回同一套轨迹结构。',
    updatedDaysAgo: 11,
    createdDaysAgo: 61,
    author: MOCK_DEVELOPERS.zhang,
    tags: [TAG_CONNECTOR],
  }),
  buildResource({
    id: 9010,
    title: '合同关键条款速查表',
    description: '按合同类型整理关键条款与常见风险点，供快速查阅。',
    updatedDaysAgo: 13,
    createdDaysAgo: 70,
    author: MOCK_DEVELOPERS.toolsmith,
    tags: [TAG_EFFICIENCY],
    origin: { type: 'repost', author: '开源法务手册', org: '法务开源社区' },
  }),
  buildResource({
    id: 9011,
    title: '报价单批量导入模板',
    description: '按标准报价单模板批量导入，支持多币种与阶梯价。',
    updatedDaysAgo: 15,
    createdDaysAgo: 77,
    author: MOCK_DEVELOPERS.mochi,
    tags: [TAG_DATA_SYNC],
  }),
  buildResource({
    id: 9012,
    title: '财务发票查验接口样例',
    description: '对接发票查验接口的请求示例与错误码对照表。',
    updatedDaysAgo: 18,
    createdDaysAgo: 88,
    tags: [TAG_CONNECTOR],
    requirementCode: 'REQ-20260910-0058',
  }),
  buildResource({
    id: 9013,
    title: '前端部署与回滚脚本',
    description: '柒叁工作室沉淀的前端部署脚本，含环境检查与一键回滚。',
    updatedDaysAgo: 6,
    createdDaysAgo: 40,
    team: { id: 1 },
    requirementCode: 'REQ-20260805-0017',
  }),
  buildResource({
    id: 9014,
    title: '需求验收清单模板',
    description: '团队通用的需求验收清单模板，逐项对照后签字确认。',
    updatedDaysAgo: 10,
    createdDaysAgo: 24,
    team: { id: 1 },
  }),
]

/** 团队名下的资源：团队资源页与门户「活跃团队」榜单看的是同一批。 */
export const mcTeamOwnedResources: McResourcePayload[] = mcResources.filter(
  (item) => item.ownership_type === 'team',
)

function buildVersion(
  id: number,
  resourceId: number,
  version: string,
  note: string,
  daysAgo: number,
): McResourceVersionPayload {
  return {
    id,
    resource_id: resourceId,
    version,
    resource: `resource-${resourceId}-${version}.zip`,
    note,
    creator: DEV_USERNAME,
    created_at: datetime(-daysAgo, 15, 10),
    is_current: false,
    price_fen: 0,
    purchasable: false,
  }
}

export const mcResourceVersions: McResourceVersionPayload[] = [
  buildVersion(1, 9001, 'v1.0.0', '首个可用版本：三平台订单拉取与合并。', 20),
  buildVersion(2, 9001, 'v1.1.0', '增加库存对账与差异重算。', 9),
  buildVersion(3, 9001, 'v1.2.0', '订单同步间隔可配置，补充失败重试。', 1),
  buildVersion(4, 9002, 'v1.0.0', '审批回调接收与转发。', 14),
  buildVersion(5, 9002, 'v1.1.0', '支持幂等与死信重投。', 3),
  buildVersion(6, 9003, 'v1.0.0', '订单提醒与免打扰时段。', 30),
  buildVersion(7, 9006, 'v1.0.0', '多维表格与内部系统首次双向同步。', 21),
  buildVersion(8, 9006, 'v1.1.0', '冲突按更新时间合并，补充同步日志。', 5),
  buildVersion(9, 9007, 'v1.0.0', '盘点表导出与账面数量比对。', 18),
  buildVersion(10, 9013, 'v1.0.0', '部署脚本与环境检查项。', 16),
  buildVersion(11, 9013, 'v1.1.0', '增加一键回滚与灰度发布开关。', 6),
]

export function versionsOf(resourceId: number): McResourceVersionPayload[] {
  return mcResourceVersions.filter((item) => item.resource_id === resourceId)
}

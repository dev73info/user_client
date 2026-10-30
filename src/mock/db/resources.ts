import type { McResourcePayload, McResourceVersionPayload } from '@/api/mcResources'

import { DEV_NICKNAME, DEV_USERNAME, datetime, iso } from './shared'

/* ------------------------------------------------------------------ 资源与版本 */

/**
 * 资源归到哪个标签分组里。
 *
 * 门户列表与「类型」筛选读的是 `tag_selections`；只给 `platform` 不够，
 * 卡片上会显示成「未标注」、左侧筛选分区也勾不上。分组取自 `db/tags.ts` 同一棵树。
 */
function tagSelectionOf(
  groupId: number,
  groupName: string,
  groupAlias: string,
  rootLabel: string,
  rootAlias: string,
  tagId: number,
  tagName: string,
  tagAlias: string,
) {
  return {
    group_id: groupId,
    group_name: groupName,
    group_alias: groupAlias,
    group_path: [rootLabel, groupName],
    group_path_aliases: [rootAlias, groupAlias],
    tag_ids: [tagId],
    tag_names: [tagName],
    tag_aliases: [tagAlias],
  }
}

function buildResource(
  id: number,
  platform: string,
  title: string,
  description: string,
  visibility: McResourcePayload['visibility'],
  updatedDaysAgo: number,
  requirementCode: string | null = null,
): McResourcePayload {
  return {
    id,
    creator: DEV_USERNAME,
    ownership_type: 'individual',
    team_id: null,
    requirement_id: requirementCode,
    platform,
    title,
    author: DEV_NICKNAME,
    description,
    tag_selections: [
      tagSelectionOf(1201, '类型', 'type', '资源项目', 'resources', 1301, '效率工具', 'efficiency'),
    ],
    file_name: `${title}.zip`,
    source_url: '',
    cover_url: null,
    docs_url: null,
    visibility,
    release_note: null,
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    buyout_price_fen: 0,
    price_fen: 0,
    price_points: 0,
    copyright_declared: false,
    copyright_declared_at: null,
    purchased_by_me: false,
    created_at: iso(-40, 9, 0),
    updated_at: iso(-updatedDaysAgo, 15, 20),
    promo_share_bps: 0,
  }
}

export const mcResources: McResourcePayload[] = [
  buildResource(
    9001,
    '自研工具',
    '跨境电商订单同步插件',
    '把 Amazon / Shopify / TikTok Shop 的订单聚合到一张表，支持库存对账。',
    'published',
    2,
    'REQ-20260907-0051',
  ),
  buildResource(
    9002,
    '自研工具',
    '企业微信审批流连接器',
    '接收企业微信审批回调并转发到内部系统，内置重试与日志。',
    'published',
    4,
    'REQ-20260828-0042',
  ),
  (() => {
    const paid = buildResource(
      9003,
      '自研工具',
      '小程序订单提醒机器人',
      '订单状态变更推送到企业微信，支持免打扰时段。',
      'published',
      6,
    )
    paid.buyout_price_fen = 990
    paid.price_fen = 990
    paid.copyright_declared = true
    paid.copyright_declared_at = iso(-6, 12, 0)
    return paid
  })(),
  buildResource(
    9004,
    '自研工具',
    '经营数据看板模板',
    '通用门店经营看板模板，含日报周报与导出。',
    'review',
    1,
  ),
]

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
]

export function versionsOf(resourceId: number): McResourceVersionPayload[] {
  return mcResourceVersions.filter((item) => item.resource_id === resourceId)
}

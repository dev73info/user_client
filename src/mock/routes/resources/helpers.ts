import type { McResourcePayload, McResourceVersionPayload } from '@/api/mcResources'
import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'

import { DEV_USERNAME, mcResources, versionsOf } from '../../db'
import { mockTeams } from '../../db/teams'
import { mcResourcePortalInfo } from '../../db/resourceStats'
import { currentMockProfile } from '../../identity'
import { jsonResponse, noContentResponse, readInt, readString, textResponse } from '../../response'

/**
 * mock 订单的内部形态：契约 `OrderResponse` 不返回 `version_id`，但下载权益要按粒度判断，
 * 所以在内存订单上补一份（不改进契约生成物）。
 * `version_id` 为空 = 买断单，覆盖该资源的全部版本；有值 = 单版本单，只覆盖同一版本。
 */
export type MockResourcePurchaseOrder = ResourcePurchaseOrder & {
  version_id?: number | null
}

export const mockPurchases: MockResourcePurchaseOrder[] = []

export function nowIso(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * 买断权益：只认没有 `version_id` 的已付订单（与后端 `find_entitlement(..., None)` 同口径）。
 * 不传 `versionId` 时不会命中单版本订单。
 */
export function findPaidEntitlement(
  buyer: string,
  resourceId: number,
  versionId?: number | null,
): MockResourcePurchaseOrder | undefined {
  return mockPurchases.find((item) => {
    if (item.buyer !== buyer || item.resource_id !== resourceId || item.status !== 'paid') {
      return false
    }
    const orderVersionId = item.version_id ?? null
    // 买断单覆盖全部版本
    if (orderVersionId === null) {
      return true
    }
    // 单版本单只匹配同一版本
    return versionId != null && orderVersionId === versionId
  })
}

/** 是否持有该资源任一已付权益（买断或任一变版本），对应后端 `owns_resource`。 */
export function hasAnyPaidEntitlement(buyer: string, resourceId: number): boolean {
  return mockPurchases.some(
    (item) => item.buyer === buyer && item.resource_id === resourceId && item.status === 'paid',
  )
}

export function mockBuyer(): string {
  return currentMockProfile().username
}

export function myResources(): McResourcePayload[] {
  return mcResources.filter((item) => item.creator === DEV_USERNAME)
}

export function publishedResources(): McResourcePayload[] {
  return mcResources.filter((item) => item.visibility === 'published')
}

/** 公开资源多带几个门户卡片要用的字段（与后端的 public 视图对齐）。 */
export function toPublicResource(resource: McResourcePayload, buyer?: string | null) {
  const withFeatured = resource as McResourcePayload & {
    is_featured?: boolean
    is_pinned?: boolean
    like_count?: number
  }
  const purchased = Boolean(buyer) && hasAnyPaidEntitlement(buyer!, resource.id)
  // 展示统计（浏览 / 下载 / 点赞 / 精选 / 置顶）来自 mock 的固定表，没有就回落缺省值。
  const info = mcResourcePortalInfo[resource.id]
  return {
    ...resource,
    price_fen: resource.price_fen ?? 0,
    price_points: resource.price_points ?? 0,
    copyright_declared: resource.copyright_declared ?? false,
    copyright_declared_at: resource.copyright_declared_at ?? null,
    purchased_by_me: purchased,
    versions: versionsOf(resource.id).length,
    view_count: info?.view_count ?? 0,
    download_count: info?.download_count ?? 12,
    like_count: info?.like_count ?? withFeatured.like_count ?? 0,
    is_featured: info?.is_featured ?? Boolean(withFeatured.is_featured),
    is_pinned: info?.is_pinned ?? Boolean(withFeatured.is_pinned),
    // 团队名：门户「活跃团队」榜单按它聚合，payload 里只有 team_id。
    team_name: mockTeams.find((team) => team.team_id === resource.team_id)?.name ?? null,
    updated_at: resource.updated_at,
  }
}

const MOCK_PACKAGE_CONTENT = 'mock resource package\n'.repeat(200)

export function downloadResponse(fileName: string): Response {
  return new Response(MOCK_PACKAGE_CONTENT, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(new Blob([MOCK_PACKAGE_CONTENT]).size),
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}

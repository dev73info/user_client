import type { McResourcePayload, McResourceVersionPayload } from '@/api/mcResources'
import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'

import { DEV_USERNAME, mcResources, versionsOf } from '../../db'
import { currentMockProfile } from '../../identity'
import { jsonResponse, noContentResponse, readInt, readString, textResponse } from '../../response'

export const mockPurchases: ResourcePurchaseOrder[] = []

export function nowIso(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

export function findPaidEntitlement(
  buyer: string,
  resourceId: number,
): ResourcePurchaseOrder | undefined {
  return mockPurchases.find(
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
    like_count?: number
  }
  const purchased = Boolean(buyer) && Boolean(findPaidEntitlement(buyer!, resource.id))
  return {
    ...resource,
    price_fen: resource.price_fen ?? 0,
    price_points: resource.price_points ?? 0,
    copyright_declared: resource.copyright_declared ?? false,
    copyright_declared_at: resource.copyright_declared_at ?? null,
    purchased_by_me: purchased,
    versions: versionsOf(resource.id).length,
    download_count: 12,
    like_count: withFeatured.like_count ?? 0,
    is_featured: Boolean(withFeatured.is_featured),
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

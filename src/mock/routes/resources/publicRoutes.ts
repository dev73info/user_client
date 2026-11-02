import type { MockRoute } from '../../router'

import { mcResources, versionsOf } from '../../db'
import { mockTagGroups } from '../../db/tags'
import { jsonResponse, textResponse } from '../../response'
import {
  downloadResponse,
  findPaidEntitlement,
  mockBuyer,
  nowIso,
  publishedResources,
  toPublicResource,
} from './helpers'

export const publicResourceRoutes: MockRoute[] = [
  /* ---------------------------------------------------------------- 门户公开 */
  {
    method: 'GET',
    path: '/resource/resources',
    note: '门户资源市场列表（已公开的资源）',
    handler: () =>
      jsonResponse(publishedResources().map((item) => toPublicResource(item, mockBuyer()))),
  },
  {
    method: 'GET',
    path: '/resource/resources/:resourceId',
    note: '门户资源详情',
    handler: (_request, params) => {
      const resource = mcResources.find((item) => String(item.id) === params.resourceId)
      return resource
        ? jsonResponse(toPublicResource(resource, mockBuyer()))
        : textResponse('资源不存在', 404)
    },
  },
  {
    method: 'GET',
    path: '/resource/resources/:resourceId/versions',
    note: '门户资源的版本列表',
    handler: (_request, params) => jsonResponse(versionsOf(Number(params.resourceId))),
  },
  {
    method: 'GET',
    path: '/resource/resources/:resourceId/versions/:versionId/download',
    note: '下载资源版本：返回一段占位内容，前端的下载进度与保存链路能完整跑通',
    handler: (_request, params) => {
      const resource = mcResources.find((item) => String(item.id) === params.resourceId)
      if (!resource) {
        return textResponse('资源不存在', 404)
      }
      const resourceId = Number(params.resourceId)
      const versions = versionsOf(resourceId)
      const version = versions.find((item) => item.id === Number(params.versionId))
      if (!version) {
        return textResponse('版本不存在', 404)
      }
      const buyer = mockBuyer()
      // 与后端一致：买断价 / 积分价 / 任一版本价大于 0 就是付费资源，
      // 付费资源下载任何版本都要权益（0 价版本不单卖，只能靠买断权益取得）。
      const isPaidResource =
        (resource.buyout_price_fen ?? 0) > 0 ||
        (resource.price_points ?? 0) > 0 ||
        versions.some((item) => (item.price_fen ?? 0) > 0)
      if (isPaidResource && buyer !== resource.creator) {
        const entitled = findPaidEntitlement(buyer, resource.id, version.id)
        if (!entitled) {
          return textResponse('请先购买该资源后再下载', 403)
        }
        if (!entitled.first_downloaded_at) {
          entitled.first_downloaded_at = nowIso()
          entitled.updated_at = entitled.first_downloaded_at
        }
      }
      return downloadResponse(`resource-${params.resourceId ?? '0'}-${params.versionId ?? '0'}.zip`)
    },
  },
  {
    method: 'GET',
    path: '/tag/tags',
    note: '资源标签树：根 = 专区、子 = 二级分区（列表按二级分区的名字过滤资源）',
    // 原来这条回 []：门户顶部选不到专区、列表拿一个不存在的分区去过滤，永远「共 0 个」。
    handler: () => jsonResponse(mockTagGroups()),
  },
]

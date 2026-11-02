/**
 * mock 的资源下载 / 购买闸口：与后端「付费资源下载任何版本都要权益」口径对齐。
 *
 * 钉住四件事：
 * - 付费资源（买断价 / 积分价 / 任一版本价大于 0）的 0 价版本，对非买家一律 403；
 * - 全免费资源（所有版本价 0）仍可下载；
 * - 版本下单按 `version_id` 取价：不存在 404、0 价版本 409、有价版本按该版本价成单；
 * - 权益粒度：买断单覆盖全部版本，单版本单只覆盖同一版本；`purchased_by_me` 仍是任一已付订单。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { McResourcePayload, McResourceVersionPayload } from '@/api/mcResources'
import {
  createResourceRecord,
  createVersionRecord,
  mcResources,
  mcResourceVersions,
} from '@/mock/db'
import type { MockIdentity } from '@/mock/identity'
import type { MockRequest, MockRoute } from '@/mock/router'
import { mockBuyer, mockPurchases, toPublicResource } from '@/mock/routes/resources/helpers'
import { publicResourceRoutes } from '@/mock/routes/resources/publicRoutes'
import { purchaseRoutes } from '@/mock/routes/resources/purchaseRoutes'

const DOWNLOAD_PATH = '/resource/resources/:resourceId/versions/:versionId/download'
const PURCHASE_PATH = '/resource/resources/:resourceId/purchase'

function requestWith(method: 'GET' | 'POST', body: unknown = null): MockRequest {
  return {
    method,
    path: '',
    key: '',
    query: new URLSearchParams(),
    url: new URL('http://localhost/'),
    headers: new Headers(),
    token: '',
    identity: 'client' as MockIdentity,
    body,
    rawBody: '',
    isFormData: false,
  }
}

async function callRoute(
  routes: readonly MockRoute[],
  path: string,
  method: 'GET' | 'POST',
  params: Record<string, string>,
  body: unknown = null,
): Promise<Response> {
  const route = routes.find((item) => item.path === path)
  if (!route) {
    throw new Error(`mock 路由不存在：${path}`)
  }
  const response = await route.handler(requestWith(method, body), params)
  if (!response) {
    throw new Error(`mock 路由没有返回响应：${path}`)
  }
  return response
}

function requireVersion(version: McResourceVersionPayload | null): McResourceVersionPayload {
  if (!version) {
    throw new Error('mock 版本创建失败')
  }
  return version
}

let resource: McResourcePayload
let freeVersion: McResourceVersionPayload
let paidVersion: McResourceVersionPayload

beforeEach(() => {
  mockPurchases.length = 0
  resource = createResourceRecord({
    title: '按版本售卖资源',
    author: 'mock_seller',
    description: '',
    platform: '自研工具',
    file_name: 'paid-zero-version.zip',
    source_url: '',
    requirement_id: null,
    visibility: 'published',
  })
  // 资源作者固定成一个与 mock 身份不同的用户名，避免「作者豁免」影响下载判定
  resource.creator = 'mock_seller_73'
  resource.buyout_price_fen = 0
  resource.price_fen = 0
  resource.price_points = 0

  freeVersion = requireVersion(createVersionRecord(resource.id, 'v1.0.0', null))
  freeVersion.price_fen = 0
  freeVersion.purchasable = false

  paidVersion = requireVersion(createVersionRecord(resource.id, 'v0.9.0', null))
  paidVersion.price_fen = 500
  paidVersion.purchasable = true
})

afterEach(() => {
  const index = mcResources.findIndex((item) => item.id === resource.id)
  if (index >= 0) {
    mcResources.splice(index, 1)
  }
  for (let cursor = mcResourceVersions.length - 1; cursor >= 0; cursor -= 1) {
    if (mcResourceVersions[cursor]?.resource_id === resource.id) {
      mcResourceVersions.splice(cursor, 1)
    }
  }
  mockPurchases.length = 0
})

function download(versionId: number, resourceId = resource.id) {
  return callRoute(publicResourceRoutes, DOWNLOAD_PATH, 'GET', {
    resourceId: String(resourceId),
    versionId: String(versionId),
  })
}

function purchase(body: Record<string, unknown>, resourceId = resource.id) {
  return callRoute(purchaseRoutes, PURCHASE_PATH, 'POST', { resourceId: String(resourceId) }, body)
}

describe('mock 资源下载 / 购买闸口', () => {
  it('付费资源的 0 价版本：非买家下载 403', async () => {
    // 9003 那种形态：资源有买断价，某个版本价是 0
    resource.buyout_price_fen = 990
    const response = await download(freeVersion.id)

    expect(response.status).toBe(403)
    expect(await response.text()).toContain('请先购买')
  })

  it('全免费资源（所有版本价 0）：下载 200', async () => {
    paidVersion.price_fen = 0
    paidVersion.purchasable = false

    expect((await download(freeVersion.id)).status).toBe(200)
    expect((await download(paidVersion.id)).status).toBe(200)
  })

  it('版本下单：不存在 404、0 价版本 409、有价版本按该版本价成单', async () => {
    const missing = await purchase({ pay_channel: 'alipay', version_id: 999999 })
    expect(missing.status).toBe(404)

    const zeroPrice = await purchase({ pay_channel: 'alipay', version_id: freeVersion.id })
    expect(zeroPrice.status).toBe(409)
    expect(await zeroPrice.text()).toContain('该版本不可单独购买')

    const paid = await purchase({ pay_channel: 'alipay', version_id: paidVersion.id })
    expect(paid.status).toBe(200)
    const order = (await paid.json()) as Record<string, unknown>
    expect(order.amount_fen).toBe(500)
    expect(order.version_id).toBe(paidVersion.id)
  })

  it('单版本单只覆盖同一版本：买过的版本可下载，0 价版本仍 403', async () => {
    expect((await purchase({ pay_channel: 'alipay', version_id: paidVersion.id })).status).toBe(200)

    expect((await download(paidVersion.id)).status).toBe(200)
    expect((await download(freeVersion.id)).status).toBe(403)
  })

  it('买断单覆盖全部版本；purchased_by_me 按任一已付订单算', async () => {
    // 买断需要资源级现金价 > 0（版本价仍保留，用于验证「任何版本都可下」）
    resource.buyout_price_fen = 2000
    resource.price_fen = 2000

    expect((await purchase({ pay_channel: 'alipay' })).status).toBe(200)

    expect((await download(freeVersion.id)).status).toBe(200)
    expect((await download(paidVersion.id)).status).toBe(200)
    expect(toPublicResource(resource, mockBuyer()).purchased_by_me).toBe(true)
  })
})

/**
 * 接入客户端（OAuth 2.0 应用）的假路由。
 *
 * 这一族原本没实现，`GET /oauth/clients` 落到兜底的 `[]`——列表页看起来「一个应用都没有」是
 * 正常空态，但新建 / 轮换 / 删除全都点了没反应，整页等于只读摆设。
 * 这里给一份能走完整条链的内存表：新建拿得到一次性密钥明文、轮换换得出新密钥、删除会真的移除。
 *
 * 密钥一律假的（`sk_mock_…`），只用于演示「明文只回一次」这条交互，不指向任何真实服务。
 */

import type { components } from '@/api/generated/schema'

import type { MockRoute } from '../../router'
import { jsonResponse, noContentResponse } from '../../response'

type OAuthClient = components['schemas']['ClientResponse']

const clients: OAuthClient[] = [
  {
    client_id: 'mock-client-7d3f',
    name: '柒叁演示站点',
    redirect_uris: ['https://demo.73info.local/oauth/callback'],
    allowed_scopes: ['profile'],
    is_active: true,
    client_secret_prefix: 'sk_mock_7d3f',
    client_secret: null,
  },
]

let nextClientSeq = 1

/** 密钥掩码：只留前缀，明文只在创建 / 轮换那一次的响应里出现。 */
function maskPrefix(secret: string): string {
  return secret.slice(0, 12)
}

export const oauthClientRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/oauth/clients',
    note: '我的接入客户端（契约是裸数组，密钥只回掩码前缀）',
    handler: () => jsonResponse(clients),
  },
  {
    method: 'POST',
    path: '/oauth/clients',
    note: '新建客户端：这一次的响应里带完整密钥明文',
    handler: (request) => {
      const body = (request.body ?? {}) as {
        name?: string
        redirect_uris?: string[]
        scopes?: string[]
      }
      const clientId = `mock-client-${nextClientSeq.toString().padStart(4, '0')}`
      const secret = `sk_mock_${nextClientSeq.toString().padStart(4, '0')}`
      nextClientSeq += 1

      const created: OAuthClient = {
        client_id: clientId,
        name: (body.name ?? '').trim() || '未命名应用',
        redirect_uris: body.redirect_uris ?? [],
        allowed_scopes: body.scopes ?? ['profile'],
        is_active: true,
        client_secret_prefix: maskPrefix(secret),
        client_secret: secret,
      }
      clients.unshift(created)

      return jsonResponse(created, 201)
    },
  },
  {
    method: 'PATCH',
    path: '/oauth/clients/:client_id',
    note: '改名称与回调地址',
    handler: (request, params) => {
      const client = clients.find((item) => item.client_id === params.client_id)
      if (!client) {
        return jsonResponse({ message: '客户端不存在' }, 404)
      }
      const body = (request.body ?? {}) as { name?: string; redirect_uris?: string[] }
      if (typeof body.name === 'string') client.name = body.name.trim()
      if (Array.isArray(body.redirect_uris)) client.redirect_uris = body.redirect_uris

      return jsonResponse(client)
    },
  },
  {
    method: 'POST',
    path: '/oauth/clients/:client_id/rotate',
    note: '轮换密钥：同样只在这一次响应里回明文',
    handler: (_request, params) => {
      const client = clients.find((item) => item.client_id === params.client_id)
      const secret = `sk_mock_rot_${Date.now().toString(36)}`
      if (client) {
        client.client_secret_prefix = maskPrefix(secret)
        client.client_secret = secret
      }

      return jsonResponse({ client_secret: secret })
    },
  },
  {
    method: 'GET',
    path: '/oauth/clients/:client_id/bindings',
    note: '已授权用户（演示数据没有真实授权关系）',
    handler: () => jsonResponse([]),
  },
  {
    method: 'DELETE',
    path: '/oauth/clients/:client_id',
    note: '删除客户端',
    handler: (_request, params) => {
      const index = clients.findIndex((item) => item.client_id === params.client_id)
      if (index >= 0) {
        clients.splice(index, 1)
      }

      return noContentResponse()
    },
  },
]

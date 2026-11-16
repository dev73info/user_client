/**
 * 第三方绑定 / 解绑与账号注销的 mock。
 *
 * 解绑的 mock 与真实后端保持同一口径：直接 `DELETE /auth/:provider/bind` 回 409，
 * 微信 / QQ 走扫码验证、GitHub / Gitee 走授权验证；扫码会话两轮后模拟成功。
 */

import { defineRouteTable, type MockRoute } from '../router'
import { errorResponse, jsonResponse, noContentResponse } from '../response'

function mockAuthorizeUrl(provider: string): { url: string } {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return { url: `${origin}/?mock=1&mock_provider=${encodeURIComponent(provider)}` }
}

function mockResultUrl(provider: string, action: 'bind' | 'unbind'): { url: string } {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const param = action === 'unbind' ? 'unbind=success' : 'bind=success'
  return {
    url: `${origin}/?mock=1&${param}&mock_provider=${encodeURIComponent(provider)}`,
  }
}

let mockBoundProviders: string[] = ['wechat', 'github', 'qq']
let mockQrAction: { provider: string; mode: 'bind' | 'unbind' } | null = null
let mockQrPolls = 0
let mockCloseRequestedAt: string | null = null
let mockCloseEffectiveAt: string | null = null

function mockQrPayload(provider: string, mode: 'bind' | 'unbind') {
  mockQrAction = { provider, mode }
  mockQrPolls = 0
  return jsonResponse({
    url: mockAuthorizeUrl(provider).url,
    state: `mock-${mode}-${provider}`,
    poll_secret: 'mock-secret',
  })
}

function mockQrStatusReply() {
  mockQrPolls += 1
  if (mockQrPolls >= 2 && mockQrAction?.mode === 'unbind') {
    mockBoundProviders = mockBoundProviders.filter((item) => item !== mockQrAction?.provider)
    return jsonResponse({ status: 'confirmed', token: null, username: 'mock-user' })
  }
  return jsonResponse({ status: 'pending', token: null, username: null })
}

function mockCloseRequestPayload() {
  return {
    pending: Boolean(mockCloseEffectiveAt),
    requested_at: mockCloseRequestedAt,
    effective_at: mockCloseEffectiveAt,
    days_remaining: mockCloseEffectiveAt ? 7 : null,
  }
}

const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/auth/oauth-status',
    note: '第三方登录开关：mock 打开微信/QQ，便于预览端内一键登录布局；真正授权仍走真实后端',
    handler: () => jsonResponse({ github: false, wechat: true, qq: true, gitee: false }),
  },
  {
    method: 'GET',
    path: '/auth/wechat/login/url',
    note: '微信端内授权入口（占位）：浏览器直接跳这里时不会被 fetch mock 拦截',
    handler: () => jsonResponse(mockAuthorizeUrl('wechat')),
  },
  {
    method: 'GET',
    path: '/auth/qq/login/url',
    note: 'QQ 端内授权入口（占位）',
    handler: () => jsonResponse(mockAuthorizeUrl('qq')),
  },
  {
    method: 'GET',
    path: '/auth/providers',
    note: '已绑定的第三方账号',
    handler: () => jsonResponse({ providers: mockBoundProviders }),
  },
  {
    method: 'GET',
    path: '/auth/github/url',
    note: 'GitHub 授权地址（占位）',
    handler: () => jsonResponse(mockAuthorizeUrl('github')),
  },
  {
    method: 'GET',
    path: '/auth/gitee/url',
    note: 'Gitee 授权地址（占位）',
    handler: () => jsonResponse(mockAuthorizeUrl('gitee')),
  },
  {
    method: 'GET',
    path: '/auth/:provider/bind/url',
    note: '第三方绑定授权地址（占位）',
    handler: (_request, params) =>
      jsonResponse(mockResultUrl(params.provider ?? 'provider', 'bind')),
  },
  {
    method: 'GET',
    path: '/auth/:provider/unbind/url',
    note: 'GitHub / Gitee 解绑验证授权地址（占位）',
    handler: (_request, params) =>
      jsonResponse(mockResultUrl(params.provider ?? 'provider', 'unbind')),
  },
  {
    method: 'DELETE',
    path: '/auth/:provider/bind',
    note: '直接解绑已被禁止：必须重新验证',
    handler: () =>
      jsonResponse(
        {
          code: 'UNBIND_VERIFICATION_REQUIRED',
          message: '解绑前必须重新验证当前绑定的第三方账号',
        },
        409,
      ),
  },
  {
    method: 'GET',
    path: '/auth/wechat/bind/qr/url',
    note: '微信扫码绑定（占位）',
    handler: () => mockQrPayload('wechat', 'bind'),
  },
  {
    method: 'GET',
    path: '/auth/wechat/bind/qr/status',
    note: '微信扫码绑定状态：两轮后模拟成功',
    handler: () => {
      mockQrPolls += 1
      if (mockQrPolls >= 2 && mockQrAction?.mode === 'bind') {
        if (!mockBoundProviders.includes(mockQrAction.provider)) {
          mockBoundProviders = [...mockBoundProviders, mockQrAction.provider]
        }
        return jsonResponse({ status: 'confirmed', token: null, username: 'mock-user' })
      }
      return jsonResponse({ status: 'pending', token: null, username: null })
    },
  },
  {
    method: 'GET',
    path: '/auth/wechat/unbind/qr/url',
    note: '微信扫码解绑验证（占位）',
    handler: () => mockQrPayload('wechat', 'unbind'),
  },
  {
    method: 'GET',
    path: '/auth/wechat/unbind/qr/status',
    note: '微信扫码解绑状态：两轮后模拟成功',
    handler: () => mockQrStatusReply(),
  },
  {
    method: 'GET',
    path: '/auth/qq/unbind/qr/url',
    note: 'QQ 扫码解绑验证（占位）',
    handler: () => mockQrPayload('qq', 'unbind'),
  },
  {
    method: 'GET',
    path: '/auth/qq/unbind/qr/status',
    note: 'QQ 扫码解绑状态：两轮后模拟成功',
    handler: () => mockQrStatusReply(),
  },
  {
    method: 'GET',
    path: '/auth/wechat/login/qr/url',
    note: '微信扫码登录：占位二维码（不会被轮询到成功）',
    handler: () =>
      jsonResponse({
        url: mockAuthorizeUrl('wechat').url,
        state: 'mock-state',
        poll_secret: 'mock-secret',
      }),
  },
  {
    method: 'GET',
    path: '/auth/wechat/login/qr/status',
    note: '微信扫码状态：mock 不自动登录，保持未扫码',
    handler: () => jsonResponse({ token: null, status: 'pending' }),
  },
  {
    method: 'GET',
    path: '/auth/qq/login/qr/url',
    note: 'QQ 扫码登录（占位）',
    handler: () =>
      jsonResponse({
        url: mockAuthorizeUrl('qq').url,
        state: 'mock-state',
        poll_secret: 'mock-secret',
      }),
  },
  {
    method: 'GET',
    path: '/auth/qq/login/qr/status',
    note: 'QQ 扫码状态：保持未扫码',
    handler: () => jsonResponse({ token: null, status: 'pending' }),
  },
  {
    method: 'POST',
    path: '/auth/account/close-code',
    note: '发送注销申请验证码（mock 不真的发信）',
    handler: () => noContentResponse(),
  },
  {
    method: 'POST',
    path: '/auth/account/close-request',
    note: '提交注销申请：进入 7 天等待期，不立即退出登录',
    handler: () => {
      const now = new Date()
      const effective = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      mockCloseRequestedAt = now.toISOString()
      mockCloseEffectiveAt = effective.toISOString()
      return jsonResponse(mockCloseRequestPayload())
    },
  },
  {
    method: 'GET',
    path: '/auth/account/close-request',
    note: '读取注销申请状态',
    handler: () => jsonResponse(mockCloseRequestPayload()),
  },
  {
    method: 'DELETE',
    path: '/auth/account/close-request',
    note: '撤销注销申请',
    handler: () => {
      mockCloseRequestedAt = null
      mockCloseEffectiveAt = null
      return noContentResponse()
    },
  },
  {
    method: 'DELETE',
    path: '/auth/account',
    note: '直接注销已被禁止：必须提交申请',
    handler: () => errorResponse(409, '需要先提交注销申请（ACCOUNT_CLOSE_REQUEST_REQUIRED）'),
  },
]

export const accountSecurityRoutes = defineRouteTable('account-security', routes)

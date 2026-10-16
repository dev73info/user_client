/**
 * 登录、会话与开发者资格。
 *
 * 这里决定「能不能进得去、进去是哪一侧」：
 * - `role` 由当前 mock 身份直接给出，所以客户身份进开发者工作台会被路由守卫拦到「无权限」页，
 *   这正是真实行为；要换视角请用右下角的身份切换器。
 * - `dev-access-status` 对开发者身份一律返回「已实名、已成年、已签入驻协议」，
 *   否则每次进开发者页面都会被弹去实名认证。
 * - 登录接口不校验账号密码（mock 不存凭据），但返回的用户名与角色以当前身份为准。
 */

import { defineRouteTable, type MockRequest, type MockRoute } from '../router'
import { MOCK_IDENTITY_PROFILES, currentMockIdentity, type MockIdentity } from '../identity'
import { jsonResponse, noContentResponse } from '../response'
import { createMockToken } from '../token'

type AuthPayload = {
  token: string
  username: string
  role: string
}

function identityOf(request: MockRequest): MockIdentity {
  return request.identity ?? currentMockIdentity()
}

function authPayload(identity: MockIdentity): AuthPayload {
  const profile = MOCK_IDENTITY_PROFILES[identity]

  return {
    token: createMockToken(identity),
    username: profile.username,
    role: profile.role,
  }
}

/** 第三方授权只给一个回到本站的地址：mock 不连任何外部平台。 */
function mockAuthorizeUrl(provider: string): { url: string } {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return { url: `${origin}/?mock=1&mock_provider=${encodeURIComponent(provider)}` }
}

const AGREEMENT_CONTENT = [
  '（演示文本）本协议为 mock 模式下的占位内容，不代表真实条款。',
  '',
  '一、服务内容：平台为需求方与开发者提供需求发布、撮合、合同签署与资金担保服务。',
  '二、担保模式：需求方缴纳定金与尾款，平台按约定比例分账给开发者。',
  '三、无担保模式：平台只提供信息与沟通能力，不参与资金流转。',
  '',
  '关闭 mock（地址上加 ?mock=0，或点左上角面板里的「关闭 mock」）即可看到真实协议。',
].join('\n')

const routes: MockRoute[] = [
  {
    method: 'POST',
    path: '/auth/login',
    note: '登录：不校验账号密码，按当前身份返回会话',
    handler: (request) => jsonResponse(authPayload(identityOf(request))),
  },
  {
    method: 'POST',
    path: '/auth/register',
    note: '注册：直接建成当前身份的账号',
    handler: (request) => jsonResponse(authPayload(identityOf(request))),
  },
  {
    method: 'POST',
    path: '/auth/refresh',
    note: '刷新令牌：返回用户名与角色，缺少角色会让前端报「未返回完整会话信息」',
    handler: (request) => jsonResponse(authPayload(identityOf(request))),
  },
  {
    method: 'POST',
    path: '/auth/reset-password',
    note: '邮箱重置密码：直接返回会话',
    handler: (request) => jsonResponse(authPayload(identityOf(request))),
  },
  {
    method: 'POST',
    path: '/auth/send-register-email-code',
    note: '注册邮箱验证码：不真的发信',
    handler: () => noContentResponse(),
  },
  {
    method: 'POST',
    path: '/auth/send-reset-password-email-code',
    note: '重置密码邮箱验证码：不真的发信',
    handler: () => noContentResponse(),
  },
  {
    method: 'GET',
    path: '/auth/dev-access-status',
    note: '开发者资格与入驻协议状态',
    handler: (request) => {
      const isDev = identityOf(request) === 'dev'

      return jsonResponse({
        is_dev: isDev,
        is_super_admin: false,
        realname_approved: true,
        is_adult: true,
        developer_agreement_signed: isDev,
      })
    },
  },
  {
    method: 'POST',
    path: '/auth/request-dev-role',
    note: '申请开发者角色：客户身份不会被提升，于是会落到「无权限」页',
    handler: (request) => {
      const identity = identityOf(request)

      return jsonResponse({
        username: MOCK_IDENTITY_PROFILES[identity].username,
        role: MOCK_IDENTITY_PROFILES[identity].role,
      })
    },
  },
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
    handler: () => jsonResponse({ providers: [] }),
  },
  {
    method: 'GET',
    path: '/auth/user-service-agreement',
    note: '用户服务协议正文',
    handler: () =>
      jsonResponse({
        code: 'user_service_agreement',
        title: '用户服务协议',
        content: AGREEMENT_CONTENT,
        version: 'mock-1.0',
        effective_at: '2026-01-01 00:00:00',
      }),
  },
  {
    method: 'POST',
    path: '/auth/agreement-acceptances',
    note: '协议留痕',
    handler: (request) => {
      const identity = identityOf(request)
      const body = (request.body ?? {}) as { agreement_code?: string; agreement_version?: string }

      return jsonResponse({
        username: MOCK_IDENTITY_PROFILES[identity].username,
        role: MOCK_IDENTITY_PROFILES[identity].role,
        agreement_code: body.agreement_code ?? 'user_service_agreement',
        agreement_version: body.agreement_version ?? 'mock-1.0',
        client_platform: 'web',
        agreed_at: '2026-01-01 00:00:00',
      })
    },
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
    handler: (_request, params) => jsonResponse(mockAuthorizeUrl(params.provider ?? 'provider')),
  },
  {
    method: 'DELETE',
    path: '/auth/:provider/bind',
    note: '解绑第三方账号',
    handler: () => noContentResponse(),
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
    handler: () => jsonResponse({ url: mockAuthorizeUrl('qq').url, state: 'mock-state' }),
  },
  {
    method: 'GET',
    path: '/auth/qq/login/qr/status',
    note: 'QQ 扫码状态：保持未扫码',
    handler: () => jsonResponse({ token: null }),
  },
  {
    method: 'GET',
    path: '/auth/wechat/bind/qr/url',
    note: '微信绑定二维码（占位）',
    handler: () => jsonResponse({ url: '', state: 'mock-state' }),
  },
  {
    method: 'GET',
    path: '/auth/wechat/bind/qr/status',
    note: '微信绑定状态：未完成',
    handler: () => jsonResponse({ done: false, success: false, error: null }),
  },
  {
    method: 'GET',
    path: '/auth/wechat/payment/status',
    note: '微信支付授权状态：mock 视为已授权，避免支付页反复跳授权',
    handler: () => jsonResponse({ authorized: true }),
  },
  {
    method: 'GET',
    path: '/auth/wechat/payment/url',
    note: '微信支付授权地址（占位）',
    handler: () => jsonResponse(mockAuthorizeUrl('wechat')),
  },
  {
    method: 'GET',
    path: '/adapay/union/payment/url',
    note: '云闪付授权地址（占位）',
    handler: () => jsonResponse(mockAuthorizeUrl('unionpay')),
  },
  {
    method: 'DELETE',
    path: '/auth/account',
    note: '注销账号',
    handler: () => noContentResponse(),
  },
]

export const authRoutes = defineRouteTable('auth', routes)

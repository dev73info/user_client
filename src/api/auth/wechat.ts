import { authHeaders, requestJson } from '@/api/http'

import type {
  WechatBindQrStatusResp,
  WechatBindQrUrlResp,
  WechatLoginQrStatusResp,
  WechatLoginQrUrlResp,
  WechatMpLoginQrUrlResp,
} from './types'

/**
 * 取服务号「扫码关注即登录」的二维码（`GET /auth/wechat/mp/login/qr/url`，免登录）。
 *
 * 与 `getWechatLoginQrUrl` 的区别：`url` 是**二维码图片**而不是要自己画的授权页地址。
 * 前端不需要 `redirect_to`——扫码关注后服务端直接把登录结果写回会话，没有手机侧落地页。
 */
export async function getWechatMpLoginQrUrl(): Promise<WechatMpLoginQrUrlResp> {
  return requestJson<WechatMpLoginQrUrlResp>(
    '/auth/wechat/mp/login/qr/url',
    { headers: {} },
    '微信服务号扫码登录暂不可用',
  )
}

/**
 * 轮询服务号扫码登录状态（`GET /auth/wechat/mp/login/qr/status`，免登录）。
 *
 * 响应与网页授权扫码**同一个形状**：服务号事件只负责把结果写回同一张会话，
 * 取令牌这一步两边没有区别，所以不需要第二套状态机。
 */
export async function getWechatMpLoginQrStatus(
  state: string,
  pollSecret: string,
): Promise<WechatLoginQrStatusResp> {
  const query = new URLSearchParams({ state, poll_secret: pollSecret })
  return requestJson<WechatLoginQrStatusResp>(
    `/auth/wechat/mp/login/qr/status?${query.toString()}`,
    { headers: {}, cache: 'no-store' },
    '查询微信扫码登录状态失败',
  )
}

/** 取微信扫码登录的二维码地址（`GET /auth/wechat/login/qr/url`，免登录）。 */
export async function getWechatLoginQrUrl(redirectTo: string): Promise<WechatLoginQrUrlResp> {
  const query = new URLSearchParams({ redirect_to: redirectTo })
  return requestJson<WechatLoginQrUrlResp>(
    `/auth/wechat/login/qr/url?${query.toString()}`,
    { headers: {} },
    '微信扫码登录暂不可用',
  )
}

/**
 * 轮询微信扫码登录状态（`GET /auth/wechat/login/qr/status`，免登录）。
 *
 * 契约要求两个查询参数：`state` 与 `poll_secret`。**凭据错误一律回过期**，
 * 所以这里不把失败当成「再等等」处理，由调用方按 `status` 分支。
 */
export async function getWechatLoginQrStatus(
  state: string,
  pollSecret: string,
): Promise<WechatLoginQrStatusResp> {
  const query = new URLSearchParams({ state, poll_secret: pollSecret })
  return requestJson<WechatLoginQrStatusResp>(
    `/auth/wechat/login/qr/status?${query.toString()}`,
    { headers: {}, cache: 'no-store' },
    '查询微信扫码登录状态失败',
  )
}

export async function getWechatBindQrUrl(
  token: string,
  redirectTo: string,
): Promise<WechatBindQrUrlResp> {
  const query = new URLSearchParams({ redirect_to: redirectTo })
  return requestJson<WechatBindQrUrlResp>(
    `/auth/wechat/bind/qr/url?${query.toString()}`,
    { headers: authHeaders(token) },
    '微信绑定暂不可用',
  )
}

export async function getWechatBindQrStatus(
  state: string,
  pollSecret: string,
): Promise<WechatBindQrStatusResp> {
  const query = new URLSearchParams({ state, poll_secret: pollSecret })
  return requestJson<WechatBindQrStatusResp>(
    `/auth/wechat/bind/qr/status?${query.toString()}`,
    { headers: {}, cache: 'no-store' },
    '查询微信绑定状态失败',
  )
}

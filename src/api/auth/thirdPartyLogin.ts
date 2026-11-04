import { requestJson } from '@/api/http'

import type { AuthorizeUrlResp, WechatLoginQrStatusResp, WechatLoginQrUrlResp } from './types'

/**
 * 取 QQ 网页授权地址（`GET /auth/qq/login/url`，免登录）。
 *
 * 给 QQ 内置浏览器用：端内没有「开小窗 + 轮询」那套，直接整页跳到授权页。
 * 这条返回的是 JSON，**必须把 `url` 取出来再跳**，不能拿接口地址当落地页。
 */
export async function getQqLoginUrl(redirectTo: string): Promise<AuthorizeUrlResp> {
  const query = new URLSearchParams({ redirect_to: redirectTo })
  return requestJson<AuthorizeUrlResp>(
    `/auth/qq/login/url?${query.toString()}`,
    { headers: {} },
    'QQ登录暂不可用',
  )
}

/** 取 QQ 扫码登录的二维码地址（`GET /auth/qq/login/qr/url`，免登录）。 */
export async function getQqLoginQrUrl(redirectTo: string): Promise<WechatLoginQrUrlResp> {
  const query = new URLSearchParams({ redirect_to: redirectTo })
  return requestJson<WechatLoginQrUrlResp>(
    `/auth/qq/login/qr/url?${query.toString()}`,
    { headers: {} },
    'QQ扫码登录暂不可用',
  )
}

/**
 * 轮询 QQ 扫码登录状态（`GET /auth/qq/login/qr/status`，免登录）。
 *
 * 与微信同构：`state` 与 `poll_secret` 两个查询参数缺一不可，凭据错误一律回过期。
 */
export async function getQqLoginQrStatus(
  state: string,
  pollSecret: string,
): Promise<WechatLoginQrStatusResp> {
  const query = new URLSearchParams({ state, poll_secret: pollSecret })
  return requestJson<WechatLoginQrStatusResp>(
    `/auth/qq/login/qr/status?${query.toString()}`,
    { headers: {}, cache: 'no-store' },
    '查询QQ扫码登录状态失败',
  )
}

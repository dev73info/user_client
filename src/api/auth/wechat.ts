import { requestJson } from '@/api/http'

import type { WechatLoginQrStatusResp, WechatLoginQrUrlResp } from './types'

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

import { CALLBACK_URL_MAX_LENGTH } from './limits'

/** 渠道配置的读 / 写响应里与本页有关的字段（两个接口同构）。 */
export type ResourceApiChannelLike = {
  callback_url?: string | null
  allowed_origins?: string[] | null
}

/**
 * 回调地址校验：http(s) 绝对地址。
 * 本地开发允许 `http://127.0.0.1:*` 与 `http://localhost:*`，所以这里不额外强制 https——
 * 「生产必须 https」由后端按环境判（任务-01 3.5 第 2 条）。
 */
export function isValidCallbackUrl(raw: string | null | undefined): boolean {
  const value = (raw ?? '').trim()
  if (!value || value.length > CALLBACK_URL_MAX_LENGTH) {
    return false
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false
  }

  return Boolean(url.hostname)
}

/**
 * 接口资源「暂不可被下单」的原因（空数组 = 可以下单）。
 * 保存不做要求（草稿允许半成品），但页面要把这些原因显出来，
 * 免得开发者以为「存上了就能卖」。
 */
export function listApiChannelBlockers(input: ResourceApiChannelLike): string[] {
  const blockers: string[] = []

  if (!(input.callback_url ?? '').trim()) {
    blockers.push('未配置回调地址，暂不可被下单')
  }

  const origins = (input.allowed_origins ?? []).map((item) => (item ?? '').trim()).filter(Boolean)
  if (origins.length === 0) {
    blockers.push('未配置允许来源，暂不可被下单')
  }

  return blockers
}

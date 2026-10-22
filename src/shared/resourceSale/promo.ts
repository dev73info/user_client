export const PROMO_SHARE_MAX_BPS = 5000

/** 比例校验失败时统一使用的文案（与后端 400 的那句一致）。 */

export const PROMO_SHARE_RANGE_MESSAGE = '推广分成比例必须在 0% 到 50% 之间'

export type ParsePromoShareResult = { ok: true; bps: number } | { ok: false; message: string }

/**
 * 百分比文本 → 万分比：空 / 空白 = 0（关闭）；越界或非数字返回错误与统一文案。
 *
 * 取整口径为 `Math.round(percent * 100)`，**越界判断放在取整之后**——
 * 否则 `50.005`（→ 5001）这类值会被放过。文案带不带尾随 `%` 都收。
 */

export function parsePromoSharePercentInput(
  raw: string | number | null | undefined,
): ParsePromoShareResult {
  if (raw === null || raw === undefined) {
    return { ok: true, bps: 0 }
  }

  let text = String(raw).trim()
  if (!text) {
    return { ok: true, bps: 0 }
  }

  if (text.endsWith('%')) {
    text = text.slice(0, -1).trim()
  }

  if (!/^\d+(\.\d+)?$/.test(text)) {
    return { ok: false, message: PROMO_SHARE_RANGE_MESSAGE }
  }

  const percent = Number(text)
  if (!Number.isFinite(percent)) {
    return { ok: false, message: PROMO_SHARE_RANGE_MESSAGE }
  }

  const bps = Math.round(percent * 100)
  if (bps > PROMO_SHARE_MAX_BPS) {
    return { ok: false, message: PROMO_SHARE_RANGE_MESSAGE }
  }

  return { ok: true, bps }
}

/** 万分比 → 回显用百分比文本（1000 → '10'；1250 → '12.5'；0 → ''）。 */

export function promoShareBpsToPercentText(bps: number | null | undefined): string {
  const value = Number(bps ?? 0)
  if (!Number.isFinite(value) || value <= 0) {
    return ''
  }

  // toFixed 兜住浮点噪声，Number 再抹掉末尾的 0（'10.00' → '10'、'12.50' → '12.5'）
  return String(Number((value / 100).toFixed(2)))
}

/** 万分比 → 展示用标签（1000 → '10%'；0 → '未开启'）。 */

export function promoShareBpsLabel(bps: number | null | undefined): string {
  const text = promoShareBpsToPercentText(bps)
  return text ? `${text}%` : '未开启'
}

/** 推广码归一化：trim 后必须是 ≤32 位纯 ASCII 字母数字，否则 null（与后端 `trimmed_invite_code` 同口径）。 */

export function normalizePromoCode(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') {
    return null
  }

  const text = value.trim()
  return /^[A-Za-z0-9]{1,32}$/.test(text) ? text : null
}

/** 未归因 / 不合格原因 → 中文标签；空值 → 空串，未知值原样返回（与管理端口径一致）。 */

export function promoRejectReasonLabel(reason: string | null | undefined): string {
  const value = (reason ?? '').trim()
  switch (value) {
    case '':
      return ''
    case 'promo_code_invalid':
      return '推广码无效'
    case 'promoter_is_buyer':
      return '推广者就是本单买家'
    case 'promoter_is_seller':
      return '推广者就是本单卖家'
    case 'promoter_not_realname':
      return '推广者未通过实名认证'
    case 'promoter_no_settlement_account':
      return '推广者没有可用的渠道结算账户'
    case 'promoter_fee_rounded_to_zero':
      return '分成金额不足 1 分，未产生分账'
    case 'promoter_member_unavailable':
      return '分账时推广者的结算账户已不可用'
    default:
      return value
  }
}

/** 推广分账状态 → 中文标签（none / pending / succeeded / failed）。 */

export function promoterSplitStatusLabel(status: string | null | undefined): string {
  switch ((status ?? '').trim()) {
    case 'none':
      return '未产生分账'
    case 'pending':
      return '分账中'
    case 'succeeded':
      return '分账完成'
    case 'failed':
      return '分账失败'
    default:
      return (status ?? '').trim() || '未知'
  }
}

/** 详情页现金支付渠道 UI 取值。 */

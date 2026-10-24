export type ResourceSaleLike = {
  price_fen?: number | null
  price_points?: number | null
  purchased_by_me?: boolean | null
  creator?: string | null
}

export type ResourcePurchaseOrderLike = {
  status: string
  first_downloaded_at?: string | null
  amount_fen?: number | null
  amount_points?: number | null
}

/** 元 → 分；非法或负数按 0。保留两位小数后四舍五入。 */

export function yuanToFen(yuan: number | string): number {
  const n = typeof yuan === 'string' ? Number(yuan.trim()) : yuan
  if (!Number.isFinite(n) || n <= 0) {
    return 0
  }
  return Math.round(n * 100)
}

export type ParseYuanPriceOk = { ok: true; fen: number }

export type ParseYuanPriceErr = { ok: false; message: string }

export type ParseYuanPriceResult = ParseYuanPriceOk | ParseYuanPriceErr

/**
 * 表单「售价（元）」解析：空/空白 = 免费 0 分；须为非负、最多两位小数。
 */

export function parseYuanPriceInput(raw: string | number | null | undefined): ParseYuanPriceResult {
  if (raw === null || raw === undefined) {
    return { ok: true, fen: 0 }
  }
  const text = String(raw).trim()
  if (!text) {
    return { ok: true, fen: 0 }
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return { ok: false, message: '售价须为非负数字，最多两位小数' }
  }
  const n = Number(text)
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, message: '售价须为非负数字，最多两位小数' }
  }
  return { ok: true, fen: Math.round(n * 100) }
}

/**
 * 表单「售价（元）」输入时的实时归一：只去掉整数部分的前导 0（`00100` → `100`）。
 *
 * 边界：单个 `0` 保持 `0`（不把输入框清空）、`0.5` 不会变成 `.5`（小数点前留一位数字）、
 * 小数部分原样保留（`001.50` → `1.50`，不四舍五入、不补位）、空串原样返回。
 * 只删前导 0，不做 trim / 取整 / 截断，也不加千分位。
 */

export function stripLeadingZeros(text: string): string {
  return text.replace(/^0+(?=\d)/, '')
}

/**
 * {@link stripLeadingZeros} 改写文本后光标该落在哪一位：被删掉的前导 0 在光标左侧时，光标左移同样多。
 *
 * 归一后的文本比原文短几位就是删掉了几个 0；`caret` 越界时按文本边界收敛。
 */

export function caretAfterStripLeadingZeros(text: string, caret: number): number {
  const removed = text.length - stripLeadingZeros(text).length
  const bounded = Math.min(Math.max(caret, 0), text.length)
  return Math.max(0, bounded - removed)
}

/**
 * 售价（元）输入实时归一：只保留数字与第一个小数点，小数最多两位，
 * 并去掉整数部分的前导 0（`00100` → `100`、`1.234` → `1.23`）。
 *
 * `caret` 传输入框当前光标位置；返回归一后的文本与光标该落的位置
 * （被丢弃的字符在光标左侧时，光标随之左移）。
 */

export function normalizeYuanPriceText(
  text: string,
  caret: number | null = null,
): { text: string; caret: number | null } {
  const caretLimit = caret === null ? null : Math.max(0, Math.min(caret, text.length))
  let filtered = ''
  let filteredCaret: number | null = caretLimit === null ? null : 0
  let dotSeen = false
  let decimals = 0

  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index)
    let keep = false
    if (char >= '0' && char <= '9') {
      if (!dotSeen) {
        keep = true
      } else if (decimals < 2) {
        keep = true
        decimals += 1
      }
    } else if (char === '.' && !dotSeen) {
      keep = true
      dotSeen = true
    }

    if (!keep) {
      continue
    }
    filtered += char
    if (caretLimit !== null && index < caretLimit) {
      filteredCaret = filtered.length
    }
  }

  // 以小数点开头时补 0（`.5` → `0.5`），光标一并右移
  if (filtered.startsWith('.')) {
    filtered = `0${filtered}`
    if (filteredCaret !== null) {
      filteredCaret += 1
    }
  }

  const normalized = stripLeadingZeros(filtered)
  if (filteredCaret !== null) {
    filteredCaret = caretAfterStripLeadingZeros(filtered, filteredCaret)
  }

  return { text: normalized, caret: filteredCaret }
}

export type ParsePointsPriceOk = { ok: true; points: number }

export type ParsePointsPriceErr = { ok: false; message: string }

export type ParsePointsPriceResult = ParsePointsPriceOk | ParsePointsPriceErr

/**
 * 表单「积分售价」解析：空/空白 = 0；须为非负整数。
 */

export function parsePointsPriceInput(
  raw: string | number | null | undefined,
): ParsePointsPriceResult {
  if (raw === null || raw === undefined) {
    return { ok: true, points: 0 }
  }
  const text = String(raw).trim()
  if (!text) {
    return { ok: true, points: 0 }
  }
  if (!/^\d+$/.test(text)) {
    return { ok: false, message: '积分售价须为非负整数' }
  }
  const n = Number(text)
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    return { ok: false, message: '积分售价须为非负整数' }
  }
  return { ok: true, points: n }
}

/** 分 → 元字符串（两位小数）。 */

export function fenToYuanText(fen: number | null | undefined): string {
  const n = Number(fen ?? 0)
  if (!Number.isFinite(n)) {
    return '0.00'
  }
  return (n / 100).toFixed(2)
}

/** 现金一口价（分 > 0）。 */

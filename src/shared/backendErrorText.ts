/**
 * 后端错误文案口径（BUG-012）。
 *
 * 后端已把「权限拒绝」与「参数校验失败」统一成中文（见 BUG-012：权限中间件此前固定回
 * `Forbidden` / `forbidden`，购买模块的参数错误是 `unsupported pay_channel` 这类英文常量）。
 * 前端按约定**原样展示**后端文案——后端给了具体原因，就不要在前端另编一套。
 *
 * 但「原样展示」有个下限：后端偶尔还会回英文裸串（状态短语、错误码、其它模块还没迁移的
 * 英文常量）。这类文案直接甩到页面上，用户看到的就是 `Forbidden`。所以判据是**含中文**：
 * 含中文就原样透出，纯英文 / 空 body 一律回落到调用方给的中文兜底。
 *
 * 放在 shared 里是为了能单测，调用方（composable / 组件）只做调用。
 */

/** 中日韩统一表意文字（含扩展 A 区），用来判断后端 body 是不是一句能给用户看的中文。 */
const HAS_CJK = /[㐀-鿿豈-﫿]/

/** HTML 片段：网关 / 代理挂掉时的常见响应，不能当文案透出去。 */
function isHtmlLike(body: string): boolean {
  const trimmed = body.trim().toLowerCase()
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')
}

/**
 * 后端错误体能不能直接展示给用户。
 *
 * - 含中文 → 能（后端给的是业务原因，原样透出）
 * - 纯英文 / 空串 / HTML → 不能（英文裸串不是给用户看的话）
 */
export function isShowableBackendText(body: string): boolean {
  const trimmed = body.trim()
  if (!trimmed) {
    return false
  }
  if (isHtmlLike(trimmed)) {
    return false
  }
  return HAS_CJK.test(trimmed)
}

/**
 * 取一句能直接展示给用户的后端错误文案。
 *
 * @param body   后端响应体（`HttpError.message` 就是它）
 * @param fallback 拿不到可读文案时的中文兜底
 */
export function readBackendErrorText(body: string, fallback: string): string {
  const trimmed = body.trim()
  return isShowableBackendText(trimmed) ? trimmed : fallback
}

/**
 * 从任意异常里取一句能展示给用户的中文文案。
 *
 * 后端错误（`HttpError`）按上面的口径取；网络异常等非 `HttpError` 的 `Error`
 * 也走同一口径，免得把 `Failed to fetch` 这种英文原样弹给用户。
 */
export function describeBackendError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return readBackendErrorText(error.message, fallback)
  }
  return fallback
}

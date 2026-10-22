/**
 * 统一错误结构：`{ code, message, field? }`。
 *
 * 与其余三个前端仓同一份口径（根仓规则《前端标准化》第二节第 7 条）：
 * - `code`：业务错误码；后端没给时按 HTTP 状态兜底成 `HTTP_<status>`；
 * - `message`：面向用户的中文文案；
 * - `field`：出错字段（表单 / 参数类错误），后端给了才带。
 *
 * 后端 2.0 之前统一返回纯文本，所以「错误体是 JSON 就按结构解析」这条分支
 * 现在多半不会命中——纯文本时用原文当 `message`、`code` 走 `HTTP_<status>` 兜底。
 * 后端按 R048 对齐成结构化错误之后，这条分支才会真正生效。
 */

/** 归一化后的错误形状。 */
export interface ApiErrorShape {
  /** 业务错误码；后端没给时按 HTTP 状态兜底，如 `HTTP_500` */
  code: string
  /** 面向用户的中文文案 */
  message: string
  /** 出错字段（表单类错误），后端给了才带 */
  field?: string
}

/**
 * 请求层抛出的错误。
 *
 * 向后兼容：`status` 与 `message` 的语义与含义都没变，现有调用点
 * （`err instanceof HttpError`、`err.status`、`err.message`）不受影响；
 * `code` / `field` 是新增的结构化字段。
 */
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly field?: string

  constructor(status: number, message: string, code?: string, field?: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code ?? `HTTP_${status}`
    this.field = field
  }
}

/** 把任意异常归一化成 `ApiErrorShape`（页面提示可直接用）。 */
export function toApiErrorShape(error: unknown, fallback = '请求失败'): ApiErrorShape {
  if (error instanceof HttpError) {
    return error.field
      ? { code: error.code, message: error.message, field: error.field }
      : { code: error.code, message: error.message }
  }

  if (error instanceof Error && error.message) {
    return { code: 'UNKNOWN', message: error.message }
  }

  return { code: 'UNKNOWN', message: fallback }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * 读错误响应体，归一化成 `ApiErrorShape`。
 *
 * - 响应体是 JSON 且含 `code` / `message` / `field` → 按结构取；
 * - 是 JSON 但没有这些字段 → 文案按 `message` → `detail` → `error` → 兜底文案 的顺序取，
 *   **不把 JSON 原文塞给用户看**，`code` 兜底 `HTTP_<status>`；
 * - 不是 JSON（后端部分端点用纯文本返回中文原因）→ `message` 用原文，`code` 兜底 `HTTP_<status>`。
 */
export async function readErrorShape(resp: Response, fallback: string): Promise<ApiErrorShape> {
  const status = resp.status

  let text = ''
  try {
    text = await resp.text()
  } catch {
    return { code: `HTTP_${status}`, message: fallback }
  }

  if (!text) {
    return { code: `HTTP_${status}`, message: fallback }
  }

  try {
    const parsed: unknown = JSON.parse(text)

    if (typeof parsed === 'string') {
      return { code: `HTTP_${status}`, message: parsed }
    }

    if (isRecord(parsed)) {
      const rawCode = parsed.code
      const rawMessage = parsed.message
      const rawDetail = parsed.detail
      const rawError = parsed.error
      const rawField = parsed.field
      const code = typeof rawCode === 'string' && rawCode.trim() ? rawCode : `HTTP_${status}`
      // 文案取不到就用兜底文案，不把 JSON 原文塞给用户看
      const message =
        (typeof rawMessage === 'string' && rawMessage.trim() && rawMessage) ||
        (typeof rawDetail === 'string' && rawDetail.trim() && rawDetail) ||
        (typeof rawError === 'string' && rawError.trim() && rawError) ||
        fallback
      const field = typeof rawField === 'string' && rawField.trim() ? rawField : undefined
      return field ? { code, message, field } : { code, message }
    }
  } catch {
    // 不是 JSON：按纯文本处理（下面统一走原文分支）
  }

  return { code: `HTTP_${status}`, message: text }
}

/**
 * 读错误响应体的文案。
 *
 * 与旧行为的差别只有一处：**错误体是 JSON 但没有 `message` / `detail` / `error`** 时，
 * 旧实现把 JSON 原文当文案，现在用兜底文案——不把 JSON 塞给用户看。
 * 纯文本错误体仍然返回原文，空响应体仍然用兜底文案。
 */
export async function readErrorMessage(resp: Response, fallback: string): Promise<string> {
  const shape = await readErrorShape(resp, fallback)
  return shape.message
}

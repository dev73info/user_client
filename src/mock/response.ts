/**
 * 假响应的构造工具。
 *
 * 所有假响应都走 JSON 文本，和真实后端一样由 `parseJsonResponse` 解析，
 * 这样前端的错误提示、空态、加载态走的是同一条代码路径。
 */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' } as const

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data ?? null), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  })
}

export function noContentResponse(): Response {
  return new Response(null, { status: 204 })
}

export function textResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

/** 业务失败。前端会把响应文本当作错误信息展示，所以中文写清楚一点。 */
export function errorResponse(status: number, message: string): Response {
  return textResponse(message, status)
}

export type ListPayload<T> = {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
  has_more: boolean
}

/** 统一的分页返回体。本项目里列表接口有两种约定（裸数组 / {items,total}），按接口实际形状取用。 */
export function listPayload<T>(items: T[], query?: URLSearchParams): ListPayload<T> {
  const page = readInt(query, 'page', 1)
  const pageSize = readInt(query, 'page_size', items.length || 20)
  const total = items.length

  return {
    items,
    total,
    page,
    page_size: pageSize,
    total_pages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    has_more: page * pageSize < total,
  }
}

export function readInt(
  query: URLSearchParams | undefined,
  name: string,
  fallback: number,
): number {
  const raw = query?.get(name)
  if (!raw) {
    return fallback
  }

  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) ? value : fallback
}

export function readString(query: URLSearchParams | undefined, name: string): string {
  return (query?.get(name) ?? '').trim()
}

/**
 * 未实现接口的兜底响应。
 *
 * GET 给空数组、其余给空对象。之所以 GET 默认返回数组：本项目的列表接口绝大多数是裸数组
 * （`/requirements/mine`、`/resource/resources`、`/community/posts`、`/conversations` …），
 * 分页对象（`{items,total}`）只有需求大厅与门户精选需求等少数几个、且都已单独实现。
 * 反过来给分页对象的话，页面里的 `.filter/.map` 会直接抛错把整页打断，
 * 而给数组对详情类接口只是渲染成空字段，代价小得多。
 *
 * 具体缺了哪些接口会打日志，也在身份切换器的面板里列出来。
 */
export function emptyFallbackResponse(method: string): Response {
  return jsonResponse(methodTypeIsRead(method) ? [] : {})
}

function methodTypeIsRead(method: string): boolean {
  return method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD'
}

/** 1×1 的灰色占位图，替换 mock 模式下拿不到的 /uploads 图片，避免整屏红叉。 */
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120">' +
  '<rect width="160" height="120" fill="#eef2f7"/>' +
  '<path d="M40 78l22-24 16 18 14-14 28 30H40z" fill="#c8d3e0"/>' +
  '<circle cx="58" cy="44" r="10" fill="#c8d3e0"/>' +
  '</svg>'

export function placeholderImageResponse(): Response {
  return new Response(PLACEHOLDER_SVG, {
    status: 200,
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' },
  })
}

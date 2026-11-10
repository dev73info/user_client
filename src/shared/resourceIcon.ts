/**
 * 资源图标上传的格式白名单。
 *
 * 与后端 `resource::domain::upload::is_allowed_cover_mime` 保持一致：只收
 * PNG / JPEG / WebP / GIF，SVG 这类可执行脚本的格式一律不收。前端提前按同一口径
 * 拦下，避免把文件传到后端才收到 400。
 */

/** 允许的图标 MIME（与后端白名单一致）。 */
export const RESOURCE_ICON_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

export type ResourceIconMime = (typeof RESOURCE_ICON_MIME_TYPES)[number]

/** 图标大小上限：与后端 `MAX_COVER_BYTES` 一致，2MB。 */
export const RESOURCE_ICON_MAX_BYTES = 2 * 1024 * 1024

/**
 * 解析文件的实际图标 MIME。
 *
 * 优先用浏览器给的 `File.type`；部分来源（拖拽、截图工具、Windows 某些扩展名）
 * 给的是空串或非标准值，这时按扩展名兜底。`image/jpg` 是非标准写法，统一成
 * `image/jpeg`，否则后端按声明 MIME 校验会拒。返回空串表示不在白名单内。
 */
export function resourceIconMime(file: { type: string; name: string }): ResourceIconMime | '' {
  const declared = file.type.trim().toLowerCase()
  if (declared === 'image/jpg') {
    return 'image/jpeg'
  }
  if ((RESOURCE_ICON_MIME_TYPES as readonly string[]).includes(declared)) {
    return declared as ResourceIconMime
  }

  const name = file.name.trim().toLowerCase()
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.gif')) return 'image/gif'
  return ''
}

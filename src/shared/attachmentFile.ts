/**
 * 需求会话附件相关的纯函数：MIME 猜测、命名兜底、字节格式化与大小上限。
 *
 * 从 `RequirementConversationModal.vue` 里搬出来的。会话附件只收图片，这里的判断都按
 * 「文件名 / 浏览器给的 type」推，不读任何响应式状态，可以单独测。
 */

/** 附件大小上限：8MB。超了前端直接拦下，不把大图塞进请求。 */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024

/**
 * 按扩展名猜图片 MIME。
 *
 * 有些来源（拖拽、部分截图工具）给的 `File.type` 是空的，只靠 type 判断会把正常图片拦掉，
 * 这时用扩展名兜一次。猜不出返回空串，调用方据此给「仅支持图片附件」。
 */
export function mimeTypeFromName(name: string): string {
  const lowerName = name.toLowerCase()
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (lowerName.endsWith('.webp')) {
    return 'image/webp'
  }
  if (lowerName.endsWith('.gif')) {
    return 'image/gif'
  }
  if (lowerName.endsWith('.png')) {
    return 'image/png'
  }
  return ''
}

/**
 * 没有文件名的附件（粘贴进来的位图常常如此）用这个命名，
 * 让上传后列表里有个像样的文件名，而不是 `blob`。
 */
export function defaultAttachmentName(mimeType: string): string {
  if (mimeType === 'image/jpeg') {
    return 'screenshot.jpg'
  }
  if (mimeType === 'image/webp') {
    return 'screenshot.webp'
  }
  if (mimeType === 'image/gif') {
    return 'screenshot.gif'
  }
  return 'screenshot.png'
}

/**
 * 字节数转人读文案：整数位按「B 档与 ≥10 不带小数，其余留 1 位」，
 * 免得 1.02 MB 这种精度在气泡里占地方。
 */
export function formatBytes(value?: number | null): string {
  if (!value || value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const precision = unitIndex === 0 || size >= 10 ? 0 : 1
  return `${size.toFixed(precision)} ${units[unitIndex]}`
}

/**
 * 历史消息里的附件是不是图片（决定气泡里放缩略图还是文件占位）。
 * 先看后端记的 MIME，取不到再按 URL 后缀兜底——早期消息只有 URL。
 */
export function isImageAttachment(message: {
  attachment_mime?: string | null
  attachment_url?: string | null
}): boolean {
  const mimeType = message.attachment_mime ?? ''
  if (mimeType.startsWith('image/')) {
    return true
  }
  return /\.(png|jpe?g|webp|gif)$/i.test(message.attachment_url ?? '')
}

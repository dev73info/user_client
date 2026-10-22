/**
 * 写剪贴板：优先 `navigator.clipboard`，非安全上下文（`http://` 非 localhost、
 * 内嵌 WebView、浏览器禁用剪贴板权限）时退回 `document.execCommand('copy')`。
 *
 * 非安全上下文下 `navigator.clipboard` 是 `undefined`，直接 `.writeText()` 会抛
 * `TypeError`，调用方只能报一句「复制失败」——用户已经把明文取回来了却拿不到。
 * 兜底口径原先是 `useCodeBlockCopy` 里的一份私有实现，两处各写一遍容易走偏，
 * 这里合一（移植自 R044）。
 */
export async function writeTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.append(textarea)
  textarea.select()

  try {
    if (!document.execCommand('copy')) {
      throw new Error('copy failed')
    }
  } finally {
    textarea.remove()
  }
}

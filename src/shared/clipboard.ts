/**
 * 写剪贴板：优先 `navigator.clipboard`，非安全上下文（`http://` 非 localhost、
 * 内嵌 WebView、浏览器禁用剪贴板权限）时退回 `document.execCommand('copy')`。
 *
 * 与 `src/composables/useCodeBlockCopy.ts` 同一套兜底口径；那边绑定的是
 * 代码块点击交互，这里给「按需复制一段文本」的调用方用。
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

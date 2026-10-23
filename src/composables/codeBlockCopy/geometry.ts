/** 代码块复制按钮的 DOM 结构与几何口径（`useCodeBlockCopy` 的纯辅助）。 */

export const hostClass = 'rich-code-copy-host'
export const buttonClass = 'rich-code-copy-button'
export const visibleClass = 'is-visible'
export const copiedClass = 'is-copied'
export const activeClass = 'is-copy-target'
export const viewportGap = 12
export const codeBlockGap = 10
export const fallbackButtonWidth = 66
export const fallbackButtonHeight = 30

export function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}

export function getFloatingTopBoundary(root: HTMLElement): number {
  let top = viewportGap
  const header = document.querySelector<HTMLElement>('.portal-header')
  const headerRect = header?.getBoundingClientRect()
  if (headerRect && headerRect.height > 0 && headerRect.bottom > 0) {
    top = Math.max(top, Math.round(headerRect.bottom + codeBlockGap))
  }

  const floatingToolbar = root.querySelector<HTMLElement>('.rich-text-editor__toolbar.is-floating')
  const toolbarRect = floatingToolbar?.getBoundingClientRect()
  if (toolbarRect && toolbarRect.height > 0 && toolbarRect.bottom > 0) {
    top = Math.max(top, Math.round(toolbarRect.bottom + codeBlockGap))
  }

  return top
}

export function findCodeBlock(target: EventTarget | null, root: HTMLElement): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null
  }

  const preElement = target.closest('pre')
  if (!(preElement instanceof HTMLElement) || !root.contains(preElement)) {
    return null
  }

  return preElement.querySelector('code') ? preElement : null
}

export function getCodeText(preElement: HTMLElement): string {
  return preElement.querySelector('code')?.textContent ?? ''
}

/** 计算复制按钮的左上角位置；可用区域装不下按钮时返回 null（按钮隐藏）。 */
export function computeButtonPlacement(input: {
  rootRect: DOMRect
  preRect: DOMRect
  buttonWidth: number
  buttonHeight: number
  viewportWidth: number
  viewportHeight: number
  topBoundary: number
}): { left: number; top: number } | null {
  const {
    rootRect,
    preRect,
    buttonWidth,
    buttonHeight,
    viewportWidth,
    viewportHeight,
    topBoundary,
  } = input
  const visibleLeft = Math.max(preRect.left, rootRect.left, viewportGap)
  const visibleRight = Math.min(preRect.right, rootRect.right, viewportWidth - viewportGap)
  const visibleTop = Math.max(preRect.top, rootRect.top, topBoundary)
  const visibleBottom = Math.min(preRect.bottom, rootRect.bottom, viewportHeight - viewportGap)

  if (
    visibleRight - visibleLeft < buttonWidth + codeBlockGap * 2 ||
    visibleBottom - visibleTop < buttonHeight + codeBlockGap * 2
  ) {
    return null
  }

  const left = clamp(
    visibleRight - buttonWidth - codeBlockGap,
    visibleLeft + codeBlockGap,
    visibleRight - buttonWidth - codeBlockGap,
  )
  const top = clamp(
    Math.max(preRect.top + codeBlockGap, visibleTop + codeBlockGap),
    visibleTop + codeBlockGap,
    visibleBottom - buttonHeight - codeBlockGap,
  )

  return { left: Math.round(left), top: Math.round(top) }
}

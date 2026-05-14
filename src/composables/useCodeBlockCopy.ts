import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

type NotifyType = 'success' | 'warning' | 'error'
type Notify = (message: string, type?: NotifyType) => void

type UseCodeBlockCopyOptions = {
  rootRef: Ref<HTMLElement | null>
  notify?: Notify
}

const hostClass = 'rich-code-copy-host'
const buttonClass = 'rich-code-copy-button'
const visibleClass = 'is-visible'
const copiedClass = 'is-copied'
const activeClass = 'is-copy-target'
const viewportGap = 12
const codeBlockGap = 10
const fallbackButtonWidth = 66
const fallbackButtonHeight = 30

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}

function getFloatingTopBoundary(root: HTMLElement): number {
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

function findCodeBlock(target: EventTarget | null, root: HTMLElement): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null
  }

  const preElement = target.closest('pre')
  if (!(preElement instanceof HTMLElement) || !root.contains(preElement)) {
    return null
  }

  return preElement.querySelector('code') ? preElement : null
}

function getCodeText(preElement: HTMLElement): string {
  return preElement.querySelector('code')?.textContent ?? ''
}

function writeTextWithFallback(value: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.append(textarea)
  textarea.select()

  try {
    return document.execCommand('copy')
  } finally {
    textarea.remove()
  }
}

async function writeTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value)
    return
  }

  if (!writeTextWithFallback(value)) {
    throw new Error('copy failed')
  }
}

export function useCodeBlockCopy({ rootRef, notify }: UseCodeBlockCopyOptions) {
  let activeCodeBlock: HTMLElement | null = null
  let copyButton: HTMLButtonElement | null = null
  let rootElement: HTMLElement | null = null
  let mutationObserver: MutationObserver | null = null
  let hideTimer: number | null = null
  let resetTimer: number | null = null
  let frameId: number | null = null

  function clearHideTimer() {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  function clearResetTimer() {
    if (resetTimer !== null) {
      window.clearTimeout(resetTimer)
      resetTimer = null
    }
  }

  function resetButtonLabel() {
    if (!copyButton) {
      return
    }

    copyButton.textContent = '复制'
    copyButton.classList.remove(copiedClass)
    copyButton.setAttribute('aria-label', '复制代码')
    copyButton.title = '复制代码'
  }

  function hideButton() {
    activeCodeBlock?.classList.remove(activeClass)
    activeCodeBlock = null
    copyButton?.classList.remove(visibleClass, copiedClass)
    clearHideTimer()
    clearResetTimer()
    resetButtonLabel()
  }

  function positionButton() {
    const root = rootElement
    const preElement = activeCodeBlock
    const button = copyButton
    if (!root || !preElement || !button || !root.contains(preElement)) {
      hideButton()
      return
    }

    const rootRect = root.getBoundingClientRect()
    const preRect = preElement.getBoundingClientRect()
    const buttonWidth = button.offsetWidth || fallbackButtonWidth
    const buttonHeight = button.offsetHeight || fallbackButtonHeight
    const visibleLeft = Math.max(preRect.left, rootRect.left, viewportGap)
    const visibleRight = Math.min(preRect.right, rootRect.right, window.innerWidth - viewportGap)
    const visibleTop = Math.max(preRect.top, rootRect.top, getFloatingTopBoundary(root))
    const visibleBottom = Math.min(preRect.bottom, rootRect.bottom, window.innerHeight - viewportGap)

    if (
      visibleRight - visibleLeft < buttonWidth + codeBlockGap * 2 ||
      visibleBottom - visibleTop < buttonHeight + codeBlockGap * 2
    ) {
      button.classList.remove(visibleClass)
      return
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

    button.style.left = `${Math.round(left)}px`
    button.style.top = `${Math.round(top)}px`
    button.classList.add(visibleClass)
  }

  function schedulePositionButton() {
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId)
    }

    frameId = window.requestAnimationFrame(() => {
      frameId = null
      positionButton()
    })
  }

  function ensureButton(root: HTMLElement): HTMLButtonElement {
    if (!copyButton) {
      copyButton = document.createElement('button')
      copyButton.type = 'button'
      copyButton.className = buttonClass
      copyButton.contentEditable = 'false'
      resetButtonLabel()

      copyButton.addEventListener('mousedown', (event) => {
        event.preventDefault()
      })

      copyButton.addEventListener('pointerenter', clearHideTimer)

      copyButton.addEventListener('pointerleave', handlePointerLeave)

      copyButton.addEventListener('click', async (event) => {
        event.preventDefault()
        event.stopPropagation()

        const code = activeCodeBlock ? getCodeText(activeCodeBlock) : ''
        if (!code) {
          notify?.('没有可复制的代码', 'warning')
          return
        }

        try {
          await writeTextToClipboard(code)
          copyButton?.classList.add(copiedClass)
          if (copyButton) {
            copyButton.textContent = '已复制'
            copyButton.setAttribute('aria-label', '代码已复制')
            copyButton.title = '代码已复制'
          }
          notify?.('代码已复制', 'success')
          clearResetTimer()
          resetTimer = window.setTimeout(resetButtonLabel, 1200)
        } catch {
          notify?.('复制失败，请手动选择代码', 'error')
        }
      })
    }

    if (copyButton.parentElement !== root) {
      root.append(copyButton)
    }

    return copyButton
  }

  function activateCodeBlock(preElement: HTMLElement) {
    const root = rootElement
    if (!root) {
      return
    }

    clearHideTimer()
    clearResetTimer()
    resetButtonLabel()
    activeCodeBlock?.classList.remove(activeClass)
    activeCodeBlock = preElement
    activeCodeBlock.classList.add(activeClass)

    const button = ensureButton(root)
    button.classList.add(visibleClass)
    schedulePositionButton()
  }

  function handlePointerOver(event: PointerEvent) {
    const root = rootElement
    if (!root) {
      return
    }

    const preElement = findCodeBlock(event.target, root)
    if (preElement) {
      activateCodeBlock(preElement)
    }
  }

  function handleClick(event: MouseEvent) {
    const root = rootElement
    if (!root || event.target === copyButton) {
      return
    }

    const preElement = findCodeBlock(event.target, root)
    if (preElement) {
      activateCodeBlock(preElement)
    }
  }

  function handleFocusIn(event: FocusEvent) {
    const root = rootElement
    if (!root) {
      return
    }

    const preElement = findCodeBlock(event.target, root)
    if (preElement) {
      activateCodeBlock(preElement)
    }
  }

  function handlePointerLeave() {
    clearHideTimer()
    hideTimer = window.setTimeout(hideButton, 180)
  }

  function handlePointerEnter() {
    clearHideTimer()
  }

  function handleRootMutation() {
    if (activeCodeBlock && (!rootElement || !rootElement.contains(activeCodeBlock))) {
      hideButton()
      return
    }

    schedulePositionButton()
  }

  function attach(root: HTMLElement) {
    rootElement = root
    root.classList.add(hostClass)
    root.addEventListener('pointerover', handlePointerOver)
    root.addEventListener('pointerenter', handlePointerEnter)
    root.addEventListener('pointerleave', handlePointerLeave)
    root.addEventListener('click', handleClick)
    root.addEventListener('focusin', handleFocusIn)
    window.addEventListener('scroll', schedulePositionButton, true)
    window.addEventListener('resize', schedulePositionButton)

    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(handleRootMutation)
      mutationObserver.observe(root, { childList: true, subtree: true })
    }
  }

  function detach(root: HTMLElement | null) {
    mutationObserver?.disconnect()
    mutationObserver = null
    root?.classList.remove(hostClass)
    root?.removeEventListener('pointerover', handlePointerOver)
    root?.removeEventListener('pointerenter', handlePointerEnter)
    root?.removeEventListener('pointerleave', handlePointerLeave)
    root?.removeEventListener('click', handleClick)
    root?.removeEventListener('focusin', handleFocusIn)
    window.removeEventListener('scroll', schedulePositionButton, true)
    window.removeEventListener('resize', schedulePositionButton)
    copyButton?.remove()
    hideButton()
    rootElement = null
  }

  watch(
    rootRef,
    (nextRoot, previousRoot) => {
      if (previousRoot && previousRoot !== nextRoot) {
        detach(previousRoot)
      }

      if (nextRoot) {
        void nextTick(() => attach(nextRoot))
      }
    },
    { immediate: true, flush: 'post' },
  )

  onBeforeUnmount(() => {
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId)
      frameId = null
    }
    detach(rootElement)
  })
}
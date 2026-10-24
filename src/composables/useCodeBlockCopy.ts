import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'
import { writeTextToClipboard } from '@/shared/clipboard'

type NotifyType = 'success' | 'warning' | 'error'
type Notify = (message: string, type?: NotifyType) => void

type UseCodeBlockCopyOptions = {
  rootRef: Ref<HTMLElement | null>
  notify?: Notify
}

import {
  buttonClass,
  computeButtonPlacement,
  copiedClass,
  fallbackButtonHeight,
  fallbackButtonWidth,
  findCodeBlock,
  getCodeText,
  getFloatingTopBoundary,
  hostClass,
  visibleClass,
} from './codeBlockCopy/geometry'

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

    const placement = computeButtonPlacement({
      rootRect: root.getBoundingClientRect(),
      preRect: preElement.getBoundingClientRect(),
      buttonWidth: button.offsetWidth || fallbackButtonWidth,
      buttonHeight: button.offsetHeight || fallbackButtonHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      topBoundary: getFloatingTopBoundary(root),
    })

    if (!placement) {
      button.classList.remove(visibleClass)
      return
    }

    button.style.left = `${placement.left}px`
    button.style.top = `${placement.top}px`
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

      // 预先将按钮添加到 body，确保 fixed 定位始终相对视口
      // 从而干扰 ProseMirror 的 mousedown/mouseup 事件处理
      document.body.append(copyButton)
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
    // 不修改 pre 元素的 class，避免触发 ProseMirror 的 MutationObserver
    // 改用内部变量追踪活跃的代码块
    if (activeCodeBlock && activeCodeBlock !== preElement) {
      // 之前活跃的代码块不再活跃
    }
    activeCodeBlock = preElement

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

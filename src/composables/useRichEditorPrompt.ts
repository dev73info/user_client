import { ref } from 'vue'

/* ---------------------------------------------------------------------------
   单行输入弹窗（替代 ElMessageBox.prompt）
   ---------------------------------------------------------------------------
   ui_73info 的 TMessageBox 只有 confirm / alert，没有带输入框的 prompt
   （见 ui_73info/doc/架构.md 第八节），所以这里用库的 TDialog + TInput 就地搭一个。

   语义与原 prompt 保持一致：确定交出输入值，取消 / Esc / 点遮罩交出 null。
   三条出口都走 settlePrompt，它先把 resolve 取走再置空，所以重复触发是安全的
   ——与库内 TMessageBox 的 finish() 同一个理由。

   状态放在这里而不是弹窗组件里：编辑器要按「等用户填完再插入」的顺序串两次询问
   （先地址、后名称），调用方持有 Promise，弹窗组件只负责渲染。
   --------------------------------------------------------------------------- */

export function useRichEditorPrompt() {
  const promptOpen = ref(false)
  const promptTitle = ref('')
  const promptMessage = ref('')
  const promptInput = ref('')
  let promptResolve: ((value: string | null) => void) | null = null

  function promptValue(message: string, title: string, defaultValue = ''): Promise<string | null> {
    promptMessage.value = message
    promptTitle.value = title
    promptInput.value = defaultValue
    promptOpen.value = true
    return new Promise<string | null>((resolve) => {
      promptResolve = resolve
    })
  }

  function settlePrompt(value: string | null) {
    const resolve = promptResolve
    promptResolve = null
    promptOpen.value = false
    resolve?.(value)
  }

  return { promptOpen, promptTitle, promptMessage, promptInput, promptValue, settlePrompt }
}

import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import type RichTextEditor from '@/components/RichTextEditor.vue'
import { acceptanceTemplates, type AcceptanceTemplate } from '@/utils/acceptanceTemplates'
import { requirementRichTextHasMeaningfulContent } from '@/utils/requirementRichText'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

export type AcceptanceTemplateMenuOptions = {
  /** 当前验收标准（富文本 HTML）。 */
  acceptance: () => string
  /** 选中模板后写回验收标准（组件那一侧就是 `emit('update:publishAcceptance', ...)`）。 */
  applyAcceptance: (html: string) => void
}

/**
 * 发布弹窗「验收标准模板」菜单（R047 从 `components/PublishModal.vue` 拆出）。
 *
 * 模板入口固定在「验收标准」标签行右侧。选择模板后在编辑器中填入结构化骨架，
 * 编辑器已有内容时先弹站内样式的覆盖确认，避免误操作丢掉已写内容。
 *
 * 指针与键盘监听由本 composable 自己挂（`document` 级，`pointerdown` 用捕获阶段），
 * 挂载 / 卸载时序与拆出前一致；`Escape` 只在覆盖确认没开时关菜单。
 */
export function useAcceptanceTemplateMenu(options: AcceptanceTemplateMenuOptions) {
  const menuOpen = ref(false)
  const pendingTemplate = ref<AcceptanceTemplate | null>(null)
  const rootRef = ref<HTMLElement | null>(null)
  const triggerRef = ref<HTMLButtonElement | null>(null)
  const confirmRef = ref<HTMLButtonElement | null>(null)
  const editorRef = ref<InstanceType<typeof RichTextEditor> | null>(null)

  function toggleMenu() {
    menuOpen.value = !menuOpen.value
  }

  function closeMenu() {
    menuOpen.value = false
  }

  /** 弹窗关闭时收起菜单与覆盖确认，避免下次打开残留。 */
  function resetMenu() {
    closeMenu()
    pendingTemplate.value = null
  }

  function handlePointerDown(event: PointerEvent) {
    if (!menuOpen.value) {
      return
    }

    const target = event.target
    // 点击入口或菜单内部不关闭，由其自身交互处理
    if (target instanceof Node && rootRef.value?.contains(target)) {
      return
    }

    closeMenu()
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') {
      return
    }

    // 覆盖确认打开时，Escape 只关闭确认框
    if (pendingTemplate.value) {
      cancelTemplate()
      return
    }

    closeMenu()
  }

  function fillAcceptanceTemplate(template: AcceptanceTemplate) {
    options.applyAcceptance(sanitizeRichHtml(template.html))
    void nextTick(() => {
      // 填入后聚焦编辑器，方便直接按括号提示补充内容
      editorRef.value?.focus()
    })
  }

  function requestTemplate(template: AcceptanceTemplate) {
    closeMenu()

    if (requirementRichTextHasMeaningfulContent(String(options.acceptance() ?? ''))) {
      pendingTemplate.value = template
      void nextTick(() => confirmRef.value?.focus())
      return
    }

    fillAcceptanceTemplate(template)
  }

  function cancelTemplate() {
    if (!pendingTemplate.value) {
      return
    }

    pendingTemplate.value = null
    void nextTick(() => triggerRef.value?.focus())
  }

  function confirmTemplate() {
    const template = pendingTemplate.value
    pendingTemplate.value = null

    if (template) {
      fillAcceptanceTemplate(template)
    }
  }

  onMounted(() => {
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeydown)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', handlePointerDown, true)
    document.removeEventListener('keydown', handleKeydown)
  })

  return {
    acceptanceTemplates,
    menuOpen,
    pendingTemplate,
    rootRef,
    triggerRef,
    confirmRef,
    editorRef,
    toggleMenu,
    closeMenu,
    resetMenu,
    requestTemplate,
    cancelTemplate,
    confirmTemplate,
  }
}

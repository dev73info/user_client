import { ref } from 'vue'

/**
 * 工作台标题栏的二级标题。
 * 详情页加载到具体业务对象后写入（如合同详情页写入合同标题），
 * 工作台外壳渲染成「合同详情/开发者入驻协议」；详情页卸载时清空，避免残留到别的页面。
 */
const workbenchSubtitle = ref('')

export function useWorkbenchSubtitle() {
  return workbenchSubtitle
}

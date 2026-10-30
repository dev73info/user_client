import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 图标栏按钮的悬浮提示（显示在按钮右侧）。
 *
 * 提示不能挂在按钮内部：按钮都在 `.workbench-icon-rail__items` 里，那是个
 * `overflow-y: auto` 的滚动容器（为了放得下十几个入口必须滚），横向也一并裁切，
 * 挂在里面的气泡会被切掉大半 —— 表现为「只有齿轮图标有提示，上面一排一个都不亮」。
 * 所以气泡由组件 Teleport 到 body，这里只给出视口坐标。
 */
export function useRailTooltip() {
  const label = ref('')
  const style = ref<Record<string, string>>({})
  const visible = ref(false)

  function show(text: string, event: Event) {
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) {
      return
    }
    const rect = target.getBoundingClientRect()
    label.value = text
    style.value = {
      top: `${rect.top + rect.height / 2}px`,
      left: `${rect.right + 10}px`,
    }
    visible.value = true
  }

  function hide() {
    visible.value = false
  }

  // 一滚就收起：气泡是按滚动前的坐标算的，跟着滚会飘到别处。
  onMounted(() => {
    window.addEventListener('scroll', hide, true)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', hide, true)
  })

  return { label, style, visible, show, hide }
}

import { onUnmounted, ref } from 'vue'

type MultiSelectAction = 'select' | 'deselect'

export function useMultiSelectTags() {
  const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const activeList = ref<string[] | null>(null)
  const action = ref<MultiSelectAction>('select')
  const active = ref(false)
  const suppressClick = ref(false)
  const suppressClickTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const touchedItems = ref<Set<string>>(new Set())

  function removeGlobalListeners() {
    window.removeEventListener('pointerup', globalPointerUp)
    window.removeEventListener('pointercancel', globalPointerCancel)
  }

  function clearMultiSelect() {
    if (longPressTimer.value) {
      clearTimeout(longPressTimer.value)
      longPressTimer.value = null
    }
    if (suppressClickTimer.value) {
      clearTimeout(suppressClickTimer.value)
      suppressClickTimer.value = null
    }
    active.value = false
    suppressClick.value = false
    activeList.value = null
    touchedItems.value.clear()
    removeGlobalListeners()
  }

  function applyMultiSelect(list: string[], item: string) {
    if (touchedItems.value.has(item)) return
    touchedItems.value.add(item)
    if (action.value === 'select') {
      if (!list.includes(item)) {
        list.push(item)
      }
      return
    }

    const index = list.indexOf(item)
    if (index >= 0) {
      list.splice(index, 1)
    }
  }

  function startMultiSelect(list: string[], item: string) {
    activeList.value = list
    action.value = list.includes(item) ? 'deselect' : 'select'
    active.value = true
    applyMultiSelect(list, item)
    window.addEventListener('pointerup', globalPointerUp)
    window.addEventListener('pointercancel', globalPointerCancel)
  }

  function endMultiSelect() {
    if (longPressTimer.value) {
      clearTimeout(longPressTimer.value)
      longPressTimer.value = null
    }

    if (active.value) {
      active.value = false
      activeList.value = null
      touchedItems.value.clear()
      removeGlobalListeners()
    }
  }

  function globalPointerUp() {
    endMultiSelect()
  }

  function globalPointerCancel() {
    clearMultiSelect()
  }

  function onTagPointerDown(list: string[], item: string, event: PointerEvent) {
    if (event.button !== 0) {
      return
    }

    // 防止长按拖拽时选中文字
    event.preventDefault()

    // 重置上次残留的 suppressClick
    if (suppressClickTimer.value) {
      clearTimeout(suppressClickTimer.value)
      suppressClickTimer.value = null
    }
    suppressClick.value = false

    clearMultiSelect()
    longPressTimer.value = setTimeout(() => {
      startMultiSelect(list, item)
      suppressClick.value = true
      // 安全兜底：如果 click 事件未触发，300ms 后自动重置 suppressClick
      suppressClickTimer.value = setTimeout(() => {
        suppressClick.value = false
        suppressClickTimer.value = null
      }, 300)
      longPressTimer.value = null
    }, 240)
  }

  function onTagPointerEnter(list: string[], item: string) {
    if (!active.value || activeList.value !== list) {
      return
    }
    applyMultiSelect(list, item)
  }

  function onTagPointerUp() {
    endMultiSelect()
  }

  function onTagPointerCancel() {
    clearMultiSelect()
  }

  function onTagClick(
    list: string[],
    item: string,
    toggleHandler: (list: string[], item: string) => void,
  ) {
    if (suppressClick.value) {
      suppressClick.value = false
      if (suppressClickTimer.value) {
        clearTimeout(suppressClickTimer.value)
        suppressClickTimer.value = null
      }
      return
    }

    toggleHandler(list, item)
  }

  onUnmounted(() => {
    clearMultiSelect()
  })

  return {
    onTagPointerDown,
    onTagPointerEnter,
    onTagPointerUp,
    onTagPointerCancel,
    onTagClick,
  }
}

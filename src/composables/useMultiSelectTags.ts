import { ref } from 'vue'

type MultiSelectAction = 'select' | 'deselect'

export function useMultiSelectTags() {
  const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const activeList = ref<string[] | null>(null)
  const action = ref<MultiSelectAction>('select')
  const active = ref(false)
  const suppressClick = ref(false)
  const touchedItems = ref<Set<string>>(new Set())

  function clearMultiSelect() {
    if (longPressTimer.value) {
      clearTimeout(longPressTimer.value)
      longPressTimer.value = null
    }
    active.value = false
    suppressClick.value = false
    activeList.value = null
    touchedItems.value.clear()
  }

  function applyMultiSelect(list: string[], item: string) {
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
  }

  function onTagPointerDown(list: string[], item: string, event: PointerEvent) {
    if (event.button !== 0) {
      return
    }

    clearMultiSelect()
    longPressTimer.value = setTimeout(() => {
      startMultiSelect(list, item)
      suppressClick.value = true
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
    if (longPressTimer.value) {
      clearTimeout(longPressTimer.value)
      longPressTimer.value = null
    }

    if (active.value) {
      active.value = false
      activeList.value = null
      touchedItems.value.clear()
    }
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
      return
    }

    toggleHandler(list, item)
  }

  return {
    onTagPointerDown,
    onTagPointerEnter,
    onTagPointerUp,
    onTagPointerCancel,
    onTagClick,
  }
}

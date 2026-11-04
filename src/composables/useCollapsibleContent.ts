import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'

const COLLAPSED_HEIGHT = 420
const COLLAPSED_CLASS = 'community-detail-card__content--collapsed'

export function useCollapsibleContent(content: Ref<string>) {
  const contentRef = ref<HTMLElement | null>(null)
  const expanded = ref(false)
  const canToggle = ref(false)

  function measureOverflow(): void {
    const target = contentRef.value
    if (!target) return

    const wasCollapsed = target.classList.contains(COLLAPSED_CLASS)
    if (wasCollapsed) target.classList.remove(COLLAPSED_CLASS)
    const naturalHeight = target.scrollHeight
    if (wasCollapsed) target.classList.add(COLLAPSED_CLASS)

    canToggle.value = naturalHeight > COLLAPSED_HEIGHT + 2
    if (!canToggle.value) expanded.value = false
  }

  function bindMediaMeasurements(): void {
    const target = contentRef.value
    if (!target) return
    target.querySelectorAll('img, video').forEach((media) => {
      const eventName = media instanceof HTMLVideoElement ? 'loadedmetadata' : 'load'
      media.addEventListener(eventName, measureOverflow, { once: true })
    })
  }

  function refresh(): void {
    expanded.value = false
    void nextTick(() => {
      measureOverflow()
      bindMediaMeasurements()
    })
  }

  watch(content, refresh)
  onMounted(() => {
    refresh()
    window.addEventListener('resize', measureOverflow)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', measureOverflow)
  })

  return { contentRef, contentExpanded: expanded, contentCanToggle: canToggle }
}

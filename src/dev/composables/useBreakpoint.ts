import { onBeforeUnmount, onMounted, readonly, ref } from 'vue'

const MOBILE_BREAKPOINT = 960

export function useBreakpoint() {
  const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1440)
  const isMobile = ref(width.value < MOBILE_BREAKPOINT)

  function update() {
    width.value = window.innerWidth
    isMobile.value = width.value < MOBILE_BREAKPOINT
  }

  onMounted(() => {
    update()
    window.addEventListener('resize', update, { passive: true })
    window.addEventListener('orientationchange', update, { passive: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', update)
    window.removeEventListener('orientationchange', update)
  })

  return {
    width: readonly(width),
    isMobile: readonly(isMobile),
  }
}

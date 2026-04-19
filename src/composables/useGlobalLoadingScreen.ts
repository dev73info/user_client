import { computed, ref } from 'vue'

const activeLoadingCount = ref(0)
const fetchPatchFlag = '__73hubFetchLoadingPatched__'

const isGlobalLoadingVisible = computed(() => activeLoadingCount.value > 0)

export function startGlobalLoading() {
  activeLoadingCount.value += 1
  let finished = false

  return () => {
    if (finished) {
      return
    }

    finished = true
    activeLoadingCount.value = Math.max(0, activeLoadingCount.value - 1)
  }
}

export async function withGlobalLoading<T>(task: () => Promise<T>) {
  const finish = startGlobalLoading()

  try {
    return await task()
  } finally {
    finish()
  }
}

export function installGlobalFetchLoadingTracker() {
  const runtime = globalThis as typeof globalThis & {
    fetch?: typeof fetch
    [fetchPatchFlag]?: boolean
  }

  if (runtime[fetchPatchFlag] || typeof runtime.fetch !== 'function') {
    return
  }

  const originalFetch = runtime.fetch.bind(runtime)

  runtime.fetch = async (...args: Parameters<typeof fetch>) => {
    const finish = startGlobalLoading()

    try {
      const response = await originalFetch(...args)

      if (!response.body) {
        finish()
        return response
      }

      try {
        void response
          .clone()
          .arrayBuffer()
          .catch(() => undefined)
          .finally(() => {
            finish()
          })
      } catch {
        finish()
      }

      return response
    } catch (error) {
      finish()
      throw error
    }
  }

  runtime[fetchPatchFlag] = true
}

export function useGlobalLoadingScreen() {
  return {
    isGlobalLoadingVisible,
    startGlobalLoading,
    withGlobalLoading,
  }
}

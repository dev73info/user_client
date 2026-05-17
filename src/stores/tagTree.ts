import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import {
  getProcessedTagTree,
  invalidateTagTreeCache,
  type McProcessedTagTree,
} from '@/api/resourceTags'

export const useTagTreeStore = defineStore('tagTree', () => {
  const tree = shallowRef<McProcessedTagTree | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  let inflight: Promise<McProcessedTagTree> | null = null

  async function ensure(): Promise<McProcessedTagTree> {
    if (tree.value) {
      return tree.value
    }

    if (inflight) {
      return inflight
    }

    loading.value = true
    error.value = null

    inflight = getProcessedTagTree()
      .then((data) => {
        tree.value = data
        error.value = null
        return data
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : '加载标签失败'
        error.value = msg
        throw e
      })
      .finally(() => {
        loading.value = false
        inflight = null
      })

    return inflight
  }

  /** 强制刷新（例如开发者修改标签后调用） */
  function refresh() {
    invalidateTagTreeCache()
    tree.value = null
    return ensure()
  }

  return { tree, loading, error, ensure, refresh }
})

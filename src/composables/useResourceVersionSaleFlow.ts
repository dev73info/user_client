import { computed, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { submitMcResourceReview, type McResourcePayload } from '@/api/mcResources'
import { useAuthStore } from '@/stores/auth'

/** 单版本创建后的首版开窗、公开送审与失败重试。 */
export function useResourceVersionSaleFlow(options: {
  resource: Ref<McResourcePayload | null>
  openCreateVersionDialog: () => void
}) {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()
  const reviewError = ref('')
  const reviewing = ref(false)
  const requireVersionPrice = computed(() => route.query.sale === 'version')

  watch(
    () => [options.resource.value, route.query.create] as const,
    ([resource]) => {
      if (!resource || route.query.sale !== 'version' || route.query.create !== '1') {
        return
      }
      options.openCreateVersionDialog()
      const query = { ...route.query }
      delete query.create
      void router.replace({ query })
    },
    { flush: 'post' },
  )

  async function completeVersionSale() {
    if (route.query.sale !== 'version') {
      return
    }

    if (route.query.review === '1') {
      if (!auth.token || !options.resource.value) {
        reviewError.value = '登录状态已失效，请重新登录后重试公开申请'
        return
      }
      reviewing.value = true
      reviewError.value = ''
      try {
        options.resource.value = await submitMcResourceReview(auth.token, options.resource.value.id)
      } catch (error) {
        reviewError.value = `首版已发布，公开申请未完成：${error instanceof Error ? error.message : '提交审核失败'}`
        return
      } finally {
        reviewing.value = false
      }
    }

    const query = { ...route.query }
    delete query.create
    delete query.sale
    delete query.review
    reviewError.value = ''
    await router.replace({ query })
  }

  return {
    requireVersionPrice,
    reviewError,
    reviewing,
    completeVersionSale,
  }
}

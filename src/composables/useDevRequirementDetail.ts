import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getRequirementHallItem, type RequirementItem } from '@/api/devRequirements'
import { useAuthStore } from '@/stores/auth'

/**
 * 需求详情页的「这一单是什么」：路由里的需求号、需求单本身、加载态。
 *
 * 与接取侧的准入读数 / 资源清单分开取（见 `useDevOrderGate`、
 * `useDevRequirementBinding`）：详情读失败就整页空态，接取侧读失败只影响右栏，
 * 两块生命周期不同，不该绑在一个加载态里。
 */
export function useDevRequirementDetail() {
  const route = useRoute()
  const auth = useAuthStore()

  const loading = ref(false)
  const requirement = ref<RequirementItem | null>(null)

  /** 路由参数 `requirementId`：数组形态取首项，统一 trim，空串表示编号无效。 */
  const requirementId = computed(() => {
    const value = route.params.requirementId
    if (Array.isArray(value)) {
      return value[0]?.trim() ?? ''
    }

    return typeof value === 'string' ? value.trim() : ''
  })

  async function loadRequirement(): Promise<RequirementItem> {
    return getRequirementHallItem(auth.token, requirementId.value)
  }

  return {
    auth,
    loading,
    requirement,
    requirementId,
    loadRequirement,
  }
}

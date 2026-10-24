import { ref, watch } from 'vue'

import { listMyRequirements } from '@/api/devRequirements'
import { listRequirements, type RequirementPaymentMode } from '@/api/requirements'

/**
 * 需求详情抽屉的状态与取数。
 *
 * 从 `RequirementConversationModal.vue` 抽出：抽屉本身（`RequirementDetailDrawer.vue`）只摆字段，
 * 「开/关、拉哪条、拉失败怎么办」这些留在这里，弹窗那一侧只解构几个 ref 与两个动作。
 */

/**
 * 抽屉只读这几个字段。
 *
 * 用户端（api/requirements）与开发者侧（api/devRequirements）各有一份 `RequirementItem`，
 * 字段与必填性略有差异；这里收敛成本地形状，免得把两边类型搅成一个 union 再往下传。
 */
export type DrawerRequirement = {
  requirement_id: string
  title: string
  /** 只用来消歧 `deposit_paid` 的文案（一码两义），取值与两侧 `RequirementItem` 一致。 */
  payment_mode: RequirementPaymentMode
  status: string
  budget?: number | null
  created_time?: string
  creator?: string
  developer?: string | null
  description?: string | null
  acceptance_criteria?: string | null
}

/** 抽屉要的那几项入参：直接传 `() => props`，props 变了这里跟着变。 */
type DetailDrawerSources = {
  token: string
  requirementId: string
  apiMode?: 'user' | 'dev'
  currentUsername?: string
}

export function useRequirementDetailDrawer(readSources: () => DetailDrawerSources) {
  const drawerOpen = ref(false)
  const drawerLoading = ref(false)
  const drawerRequirement = ref<DrawerRequirement | null>(null)

  function close() {
    drawerOpen.value = false
  }

  // 换了需求就收起抽屉，否则会停在上一笔单据的速览上（内嵌形态里切会话不会重建组件）。
  watch(
    () => readSources().requirementId,
    () => {
      drawerOpen.value = false
    },
  )

  /**
   * 需求详情抽屉：从右侧划出、覆盖在会话之上，不打断会话上下文。
   *
   * 数据按需自取，做法与 downloadDeliveryArtifact 一致（拉一次「我的需求」列表再按编号取那一条）：
   * 这样四个调用方都不必额外传 prop，也不依赖会话接口多返回字段；开发者侧对应 /dev/requirements/mine。
   * `apiMode === 'dev'` 时走开发者侧列表——这是 apiMode 在会话弹窗里的唯一真实用途。
   */
  async function toggle() {
    if (drawerOpen.value) {
      close()
      return
    }

    drawerOpen.value = true

    const { token, apiMode, currentUsername, requirementId: rawRequirementId } = readSources()
    const requirementId = rawRequirementId.trim()
    if (!requirementId || !token || drawerLoading.value) {
      return
    }
    // 已经取过同一条就直接用缓存；换了需求则重新取。
    if (drawerRequirement.value?.requirement_id === requirementId) {
      return
    }

    drawerLoading.value = true
    try {
      const rows =
        apiMode === 'dev' ? await listMyRequirements(token) : await listRequirements(token)
      const found = rows.find((row) => row.requirement_id === requirementId)
      drawerRequirement.value = found
        ? {
            requirement_id: found.requirement_id,
            title: found.title,
            payment_mode: found.payment_mode,
            status: found.status,
            budget: found.budget ?? null,
            created_time: found.created_time,
            creator: found.creator,
            // 开发者侧那份 RequirementItem 没有 developer 字段（那侧自己就是开发者），退回当前登录名
            developer:
              'developer' in found && typeof found.developer === 'string'
                ? found.developer
                : currentUsername?.trim() || null,
            description: found.description ?? null,
            acceptance_criteria: found.acceptance_criteria ?? null,
          }
        : null
    } catch {
      drawerRequirement.value = null
    } finally {
      drawerLoading.value = false
    }
  }

  return {
    drawerOpen,
    drawerLoading,
    drawerRequirement,
    toggle,
    close,
  }
}

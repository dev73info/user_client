import { computed, watch } from 'vue'

/**
 * 发布弹窗的草稿系统（R047 从 `components/PublishModal.vue` 拆出）。
 *
 * 所有使用场景（新建发布、重新编辑、重新提交审核）都启用草稿自动保存，`draftScope` 用于隔离
 * 不同场景 / 不同用户的数据，避免互相覆盖：
 * - 新建发布：`username`（或 `default`）
 * - 重新编辑 / 重提：`edit-<id>` / `resubmit-<id>` 等独立作用域
 *
 * 草稿在关闭弹窗后仍保留在 localStorage，下次打开自动恢复，防止误关丢失内容。
 * 时序与拆出前逐条一致：打开（`visible` 变真或 `draftScope` 变）恢复一次 →
 * 输入变化即写回 → 关闭后把「已恢复」标记复位，下次打开再恢复一次。
 * `draftRestored` 仍是**模块内的一份状态**（每次挂载的实例各一份），不能提到外面。
 */

type PublishDraft = {
  title: string
  description: string
  budget: string
  acceptance: string
  paymentMode: 'platform_guarantee' | 'self_managed'
  /** 开发周期（天，R014）：担保需求必填；无担保需求不显示该字段，草稿里存空串。 */
  developmentCycleDays: string
  savedAt: number
}

/** 草稿读的那几个字段：组件把 `props` 原样传进来即可（响应式跟踪仍然生效）。 */
export type PublishDraftProps = {
  visible: boolean
  draftScope: string
  publishTitle: string | number
  publishDescription: string
  publishBudget: string | number
  publishAcceptance: string
  publishPaymentMode: 'platform_guarantee' | 'self_managed'
  publishDevelopmentCycleDays: string | number
}

export type PublishDraftWriter = {
  (event: 'update:publishTitle', value: string): void
  (event: 'update:publishDescription', value: string): void
  (event: 'update:publishBudget', value: string): void
  (event: 'update:publishAcceptance', value: string): void
  (event: 'update:publishPaymentMode', value: 'platform_guarantee' | 'self_managed'): void
  (event: 'update:publishDevelopmentCycleDays', value: string): void
}

const DRAFT_STORAGE_PREFIX = '73info_publish_draft_'

export function usePublishDraft(props: PublishDraftProps, emit: PublishDraftWriter) {
  const draftEnabled = computed(() => props.draftScope !== '')

  function draftStorageKey(scope = props.draftScope): string | null {
    if (!scope) {
      return null
    }
    return `${DRAFT_STORAGE_PREFIX}${scope}`
  }

  const hasMeaningfulDraft = computed(() => {
    const title = String(props.publishTitle ?? '').trim()
    const description = String(props.publishDescription ?? '').trim()
    const budget = String(props.publishBudget ?? '').trim()
    const acceptance = String(props.publishAcceptance ?? '').trim()
    const developmentCycleDays = String(props.publishDevelopmentCycleDays ?? '').trim()
    return Boolean(title || description || budget || acceptance || developmentCycleDays)
  })

  // 草稿是否已恢复过（避免组件在父组件主动重置表单时又覆盖回去）
  let draftRestored = false

  function savePublishDraft() {
    const key = draftStorageKey()
    if (!draftEnabled.value || !key || !props.visible) {
      return
    }

    if (!hasMeaningfulDraft.value) {
      // 用户主动清空全部内容时删除草稿，避免下次打开又「复活」
      clearPublishDraft()
      return
    }

    if (!draftRestored) {
      return
    }

    const draft: PublishDraft = {
      title: String(props.publishTitle ?? ''),
      description: String(props.publishDescription ?? ''),
      budget: String(props.publishBudget ?? ''),
      acceptance: String(props.publishAcceptance ?? ''),
      paymentMode: props.publishPaymentMode,
      developmentCycleDays: String(props.publishDevelopmentCycleDays ?? ''),
      savedAt: Date.now(),
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(draft))
    } catch {
      // localStorage 不可用或超限时静默忽略，不影响正常发布流程
    }
  }

  function clearPublishDraft(scope?: string) {
    const key = draftStorageKey(scope)
    if (!key) {
      return
    }
    try {
      window.localStorage.removeItem(key)
    } catch {
      // 同上，静默忽略
    }
  }

  function restorePublishDraft() {
    const key = draftStorageKey()
    if (!draftEnabled.value || !key || !props.visible || draftRestored) {
      return
    }

    try {
      const raw = window.localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PublishDraft>
        if (typeof parsed !== 'object' || parsed === null) {
          return
        }

        // 校验字段类型，避免脏数据导致表单异常
        const title = typeof parsed.title === 'string' ? parsed.title : ''
        const description = typeof parsed.description === 'string' ? parsed.description : ''
        const budget = typeof parsed.budget === 'string' ? parsed.budget : ''
        const acceptance = typeof parsed.acceptance === 'string' ? parsed.acceptance : ''
        const developmentCycleDays =
          typeof parsed.developmentCycleDays === 'string' ? parsed.developmentCycleDays : ''
        const paymentMode =
          parsed.paymentMode === 'platform_guarantee' || parsed.paymentMode === 'self_managed'
            ? parsed.paymentMode
            : 'self_managed'

        if (title || description || budget || acceptance || developmentCycleDays) {
          emit('update:publishTitle', title)
          emit('update:publishDescription', description)
          emit('update:publishBudget', budget)
          emit('update:publishAcceptance', acceptance)
          emit('update:publishPaymentMode', paymentMode)
          emit('update:publishDevelopmentCycleDays', developmentCycleDays)
        }
      }
    } catch {
      // 草稿损坏时忽略，下次输入会重新覆盖
    } finally {
      draftRestored = true
    }
  }

  // 打开弹窗时恢复草稿（immediate：页面通过 URL 直接带 modal=publish 加载时也能恢复）
  watch(
    () => [props.visible, props.draftScope] as const,
    ([visible, draftScope]) => {
      if (visible && draftScope !== '') {
        restorePublishDraft()
      }
    },
    { immediate: true },
  )

  // 输入过程中自动保存草稿
  watch(
    () => [
      props.publishTitle,
      props.publishDescription,
      props.publishBudget,
      props.publishAcceptance,
      props.publishPaymentMode,
      props.publishDevelopmentCycleDays,
    ],
    () => {
      savePublishDraft()
    },
  )

  // 弹窗关闭后重置恢复标记，下次打开重新恢复
  watch(
    () => props.visible,
    (visible) => {
      if (!visible) {
        draftRestored = false
      }
    },
  )

  return { draftEnabled, clearPublishDraft }
}

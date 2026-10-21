import { computed } from 'vue'

import type { RequirementPaymentMode } from '@/api/requirements'
import type { RequirementPublishFormValues } from '@/shared/requirementPublishForm'

type UseRequirementPublishModalBindingsOptions = {
  /** 弹窗可见性（`PublishModal` 的 `visible`）。 */
  visible: () => boolean
  /** 草稿作用域（`PublishModal` 的 `draftScope`）。 */
  draftScope: () => string
  /** 提交中的 loading（`PublishModal` 的 `publishLoading`）。 */
  loading: () => boolean
  /** 表单本体：`v-model` 在这里展开成「字段 + onUpdate:字段」。 */
  form: RequirementPublishFormValues
  /** 表单里有没有「开发周期（天）」这一项：`false` 时那一对键**不铺**。 */
  includeDevelopmentCycle: boolean
  /** 编辑实例的三处文案（标题 / 按钮 / loading）与发布实例不同。 */
  isEdit: boolean
  onNotify: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  onClose: () => void
  onSubmit: () => void
}

/**
 * 「发布需求」/「重新编辑需求」弹窗的挂点：把表单状态铺成一份 `v-bind` 对象。
 *
 * 单独一层是因为状态机那支已经贴着 300 行上限，而这里只是**形状转换**：
 * 一次都没改判定，也不发请求。沿用 `useRequirementBreachModalBindings` 的同一条分工。
 *
 * `includeDevelopmentCycle = false`（需求大厅 / 个人中心）时**不铺**开发周期那一对键：
 * 那两个弹窗今天就没有这两个绑定，铺上去会让 props / emit 集合变宽 —— 等于顺手改了行为。
 */
export function useRequirementPublishModalBindings(
  options: UseRequirementPublishModalBindingsOptions,
) {
  const form = options.form

  return computed(() => ({
    visible: options.visible(),
    draftScope: options.draftScope(),
    publishLoading: options.loading(),
    publishTitle: form.title,
    publishDescription: form.description,
    publishBudget: form.budget,
    publishAcceptance: form.acceptance,
    publishPaymentMode: form.paymentMode,
    ...(options.includeDevelopmentCycle
      ? { publishDevelopmentCycleDays: form.developmentCycleDays }
      : {}),
    ...(options.isEdit
      ? { modalTitle: '重新编辑需求', submitText: '重新提交审核', loadingText: '提交中...' }
      : {}),
    'onUpdate:publishTitle': (value: string) => {
      form.title = value
    },
    'onUpdate:publishDescription': (value: string) => {
      form.description = value
    },
    'onUpdate:publishBudget': (value: string | number) => {
      form.budget = value
    },
    'onUpdate:publishAcceptance': (value: string) => {
      form.acceptance = value
    },
    'onUpdate:publishPaymentMode': (value: RequirementPaymentMode) => {
      form.paymentMode = value
    },
    ...(options.includeDevelopmentCycle
      ? {
          'onUpdate:publishDevelopmentCycleDays': (value: string | number) => {
            form.developmentCycleDays = value
          },
        }
      : {}),
    onNotify: options.onNotify,
    onClose: options.onClose,
    onSubmit: options.onSubmit,
  }))
}

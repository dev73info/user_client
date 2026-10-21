import type { RequirementPaymentMode } from '@/api/requirements'
import {
  normalizeDevelopmentCycle,
  validateDevelopmentCycleInput,
} from '@/shared/requirementArchive'
import { validateRequirementRichText } from '@/utils/requirementRichText'

/**
 * 「发布需求」（`PublishModal` 的新建态）与「重新编辑需求」（同一组件的编辑态）共用的纯校验。
 *
 * 两个实例原先各自把标题 / 描述富文本 / 预算 / 验收标准 / 开发周期串了一遍，逐行重复；
 * 重复的纯判定下沉到这里，页面与 `useRequirementPublishForm` 只负责搬结果。
 * 放在 shared 里是为了能单测——这个页面没有挂载测试，纯函数层是唯一的回归网。
 *
 * 校验顺序与原页面一致：标题 → 描述 → 预算非空 → 预算数值 → 验收标准 → 开发周期，
 * 谁先报错就只报谁（用户一次只看到一条提示）。
 */

/** 表单现状：与 `PublishModal` 的六个 `v-model:publish*` 一一对应。 */
export type RequirementPublishFormValues = {
  title: string
  description: string
  budget: string | number
  acceptance: string
  paymentMode: RequirementPaymentMode
  developmentCycleDays: string | number
}

/** 校验通过后可直接交给建单 / 重提交接口的载荷（字段名与接口一致）。 */
export type RequirementPublishPayload = {
  title: string
  description: string
  budget: number
  acceptance_criteria: string
  payment_mode: RequirementPaymentMode
  /**
   * 只在 `includeDevelopmentCycle` 时出现（见 `validateRequirementPublishForm`）。
   * 三个入口今天都是 `true`：担保模式给正整数；自管模式归一化成 `undefined`——
   * 键在、值不带（`JSON.stringify` 把键丢掉），后端因此收到「未填」而不是 `null`。
   */
  development_cycle_days?: number
}

export type RequirementPublishFormCheck =
  | { ok: true; payload: RequirementPublishPayload }
  | { ok: false; error: string }

export type RequirementPublishValidateOptions = {
  /**
   * 表单里是否有「开发周期（天）」这一项：默认 `true`（三个入口今天都是 `true`）。
   *
   * 传 `false` 即「模板里确实没有这一项」：跳过周期校验、载荷里不带 `development_cycle_days`。
   * 注意大厅 / 个人中心早先误传 `false`，担保模式填了也丢 —— 后端对 `platform_guarantee` 必填正数。
   */
  includeDevelopmentCycle?: boolean
}

/**
 * 校验表单并归一化成提交载荷。
 *
 * 归一两处：标题去首尾空白；富文本先过 `validateRequirementRichText` 的清洗（返回 `value` 才是
 * 落库内容，直接用原始输入会把未清洗的 HTML 提交上去）。
 *
 * 预算用 `Number.isFinite` 判：`<input type="number">` 里拿不到 `Infinity` / `1e999` 这类值，
 * 所以与编辑态原来的 `Number.isNaN` 是等价的，这里统一成一个口径。
 *
 * `options.includeDevelopmentCycle = false`（大厅 / 个人中心）时，周期那一步**整步跳过**：
 * 那两个表单没有这个字段，历史上也就没有这条报错。前面五步的顺序与文案一个字都不变。
 */
export function validateRequirementPublishForm(
  values: RequirementPublishFormValues,
  options: RequirementPublishValidateOptions = {},
): RequirementPublishFormCheck {
  const includeDevelopmentCycle = options.includeDevelopmentCycle ?? true
  const title = values.title.trim()
  const description = validateRequirementRichText(values.description, '需求描述', {
    minTextLength: 10,
  })
  const acceptance = validateRequirementRichText(values.acceptance, '验收标准', {
    required: true,
  })
  const budgetRaw = String(values.budget ?? '').trim()

  if (title.length < 4) {
    return { ok: false, error: '需求标题至少 4 个字符' }
  }

  if (description.error) {
    return { ok: false, error: description.error }
  }

  if (!budgetRaw) {
    return { ok: false, error: '预算不能为空' }
  }

  const budget = Number(budgetRaw)

  if (!Number.isFinite(budget) || budget < 0) {
    return { ok: false, error: '预算必须是大于等于0的数字' }
  }

  if (acceptance.error) {
    return { ok: false, error: acceptance.error }
  }

  // R014：担保需求必填「开发周期（天）」，且必须是正整数；配置下限由后端校验并回中文提示。
  // 表单里没有这一项（`includeDevelopmentCycle: false`）才整步跳过：既不报错，载荷里也不带这个键。
  const cycleError = includeDevelopmentCycle
    ? validateDevelopmentCycleInput(values.developmentCycleDays, values.paymentMode)
    : ''

  if (cycleError) {
    return { ok: false, error: cycleError }
  }

  return {
    ok: true,
    payload: {
      title,
      description: description.value,
      budget,
      acceptance_criteria: acceptance.value,
      payment_mode: values.paymentMode,
      ...(includeDevelopmentCycle
        ? {
            development_cycle_days: normalizeDevelopmentCycle(
              values.developmentCycleDays,
              values.paymentMode,
            ),
          }
        : {}),
    },
  }
}

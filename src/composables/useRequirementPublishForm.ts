import { computed, reactive, ref } from 'vue'

import { TMessage } from 'ui_73info'

import type { RequirementItem } from '@/api/requirements'
import PublishModal from '@/components/PublishModal.vue'
import {
  validateRequirementPublishForm,
  type RequirementPublishFormValues,
  type RequirementPublishPayload,
} from '@/shared/requirementPublishForm'

/**
 * 「发布需求」与「重新编辑需求」两个 `PublishModal` 实例的一份共用逻辑。
 *
 * **一个实例一个工厂**：视图里调两次（`publish` / `edit`），状态各自独立。
 * 绝不做成单例——编辑「A 需求」时写进表单的草稿会串到另一个实例，甚至串到新建发布里
 * （两个实例的 `draft-scope` 不同，正是为了让 `PublishModal` 的 localStorage 草稿互不覆盖）。
 *
 * 分工：
 * - 跳转一律留在视图：实名门禁（`workbench-realname` / `home?modal=auth`）是注入的
 *   `ensureApproved`，`?modal=publish` 的 query 清理是注入的 `onClosed` / `onSubmitted`；
 * - 后端调用是注入的 `submit`（两个实例的接口与入参不同：建单 vs 按需求 ID 重提）；
 * - 这里只管表单状态、校验、loading 与 toast。
 */

export type RequirementPublishFormMode = 'publish' | 'edit'

type UseRequirementPublishFormOptions = {
  /** 实例身份：只影响「关弹窗复位多少」与提交前的登录守卫，校验与提交链完全一致。 */
  mode: RequirementPublishFormMode
  /**
   * 草稿作用域（`PublishModal` 的 `draft-scope`）：每次现取，编辑按需求 ID 隔离。
   * 作用域传空串即关闭该实例的草稿功能（编辑态在还没选中需求时不写草稿）。
   */
  draftScope: (requirement: RequirementItem | null) => string
  /**
   * 开弹窗与提交前各跑一次的门禁（发布＝实名认证；含跳转，所以由视图注入）。
   * 编辑重提不需要，省略即可。
   */
  ensureApproved?: () => Promise<boolean>
  /** 登录态读取：编辑重提要先登录（发布的登录由实名门禁兜住，不必重复判）。 */
  isAuthed?: () => boolean
  /** 校验通过后的后端调用；抛错即视为失败，由这里兜 toast。 */
  submit: (payload: RequirementPublishPayload, requirement: RequirementItem | null) => Promise<void>
  /** 成功提示（两个实例文案不同：发布 vs 重新提交）。 */
  successMessage: string
  /** 失败兜底文案（后端没给 message 时用）。 */
  failureMessage: string
  /** 提交成功后的收尾：发布清 `?modal=publish` 再刷新列表，编辑只刷新列表。 */
  onSubmitted?: () => void | Promise<void>
  /** 用户手动关闭弹窗后的收尾：发布要把 `?modal=publish` 从 query 里摘掉。 */
  onClosed?: () => void
}

function emptyForm(): RequirementPublishFormValues {
  return {
    title: '',
    description: '',
    budget: '',
    acceptance: '',
    paymentMode: 'self_managed',
    developmentCycleDays: '',
  }
}

export function useRequirementPublishForm(options: UseRequirementPublishFormOptions) {
  const visible = ref(false)
  const loading = ref(false)
  /** 模板里的 `ref="publishModalRef"` / `ref="editModalRef"`：只为调 `clearDraft`。 */
  const modalRef = ref<InstanceType<typeof PublishModal> | null>(null)
  /** 编辑实例的目标需求；发布实例恒为 null。 */
  const requirement = ref<RequirementItem | null>(null)
  const form = reactive<RequirementPublishFormValues>(emptyForm())

  const draftScope = computed(() => options.draftScope(requirement.value))

  function reset() {
    Object.assign(form, emptyForm())
  }

  /** 编辑态回填：字段顺序与原来 `openRequirementEditModal` 一致。 */
  function fillFrom(item: RequirementItem) {
    form.title = item.title
    form.description = item.description ?? ''
    form.budget = item.budget ?? ''
    form.acceptance = item.acceptance_criteria ?? ''
    form.paymentMode = item.payment_mode
    // R014：担保需求回填已填的开发周期；无担保需求后端给 null，输入框显示为空（该模式下也不展示）。
    form.developmentCycleDays = item.development_cycle_days ?? ''
  }

  /**
   * 关弹窗时复位到哪一步：
   * - 发布：六个字段全清（下次打开是干净的空表单）；
   * - 编辑：只把「付款模式 / 开发周期」复位，标题等留给 `PublishModal` 的草稿恢复——
   *   全清会把用户没提交的修改一起抹掉（与原来 `forceCloseEditModal` 同口径）。
   */
  function resetOnClose() {
    if (options.mode === 'publish') {
      reset()
      return
    }

    form.paymentMode = 'self_managed'
    form.developmentCycleDays = ''
    requirement.value = null
  }

  /** 直接关（提交成功后用）：不看 loading，也不碰 query。 */
  function forceClose() {
    visible.value = false
    resetOnClose()
  }

  /**
   * 打开弹窗。传 `target` 即编辑态（回填该需求）。
   *
   * 顺序与原来两处入口一致：先跑门禁（`await`），通过后才复位 / 回填并显示——
   * 门禁没过时不会闪一下空弹窗；编辑实例没有门禁，回填与显示都是同步的。
   */
  async function open(target?: RequirementItem) {
    if (options.ensureApproved) {
      const approved = await options.ensureApproved()
      if (!approved) {
        return
      }
    }

    if (target) {
      requirement.value = target
      fillFrom(target)
    } else {
      requirement.value = null
      reset()
    }

    visible.value = true
  }

  /**
   * `?modal=publish` 直接进页面时的打开路径：**不跑实名门禁**。
   *
   * 与原 `syncPublishModalFromRoute` 一致——实名 / 登录的提示与跳转留给用户在弹窗里点提交时再走，
   * 免得刚进页面就被踢去实名页。
   */
  function openFromRoute() {
    requirement.value = null
    reset()
    visible.value = true
  }

  /** 用户关闭：请求在跑时忽略（否则弹窗关了请求还在飞，回来又把列表刷一遍）。 */
  function close() {
    if (loading.value) {
      return
    }

    forceClose()
    options.onClosed?.()
  }

  /**
   * 提交。两个实例走同一条链：
   * 登录守卫（编辑）→ 实名门禁（发布，开弹窗时跑过一次，这里是复检）→ 纯校验 → 请求 → 清草稿 → 收尾。
   */
  async function submit() {
    if (options.mode === 'edit' && (!(options.isAuthed?.() ?? true) || !requirement.value)) {
      TMessage.error('请先登录后再重新提交需求')
      return
    }

    if (options.ensureApproved) {
      const approved = await options.ensureApproved()
      if (!approved) {
        return
      }
    }

    const check = validateRequirementPublishForm({ ...form })

    if (!check.ok) {
      TMessage.error(check.error)
      return
    }

    loading.value = true
    try {
      await options.submit(check.payload, requirement.value)
      TMessage.success(options.successMessage)

      // 清草稿的作用域必须与 `draft-scope` 一致：发布清当前用户、编辑按需求 ID 清。
      // 编辑要在 `forceClose` 之前取作用域（那一步会把 requirement 置空）。
      const scope = draftScope.value
      if (options.mode === 'edit') {
        modalRef.value?.clearDraft(scope)
        forceClose()
      } else {
        forceClose()
        modalRef.value?.clearDraft()
      }

      await options.onSubmitted?.()
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : options.failureMessage)
    } finally {
      loading.value = false
    }
  }

  return {
    form,
    visible,
    loading,
    modalRef,
    draftScope,
    open,
    openFromRoute,
    close,
    forceClose,
    submit,
  }
}

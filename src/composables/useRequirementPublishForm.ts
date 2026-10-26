import { computed, reactive, ref, toRef, watch } from 'vue'
import { useRoute } from 'vue-router'

import { TMessage } from 'ui_73info'

import type { RequirementItem } from '@/api/requirements'
import PublishModal from '@/components/PublishModal.vue'
import { useRequirementPublishModalBindings } from '@/composables/useRequirementPublishModalBindings'
import { describeBackendError } from '@/shared/backendErrorText'
import {
  validateRequirementPublishForm,
  type RequirementPublishFormValues,
  type RequirementPublishPayload,
} from '@/shared/requirementPublishForm'
import { consumePendingAgentDraft } from '@/shared/requirementAssistant'

/**
 * 「发布需求」与「重新编辑需求」两个 `PublishModal` 实例的一份共用逻辑。
 *
 * **一个实例一个工厂**：视图里调两次（`publish` / `edit`），状态各自独立，绝不做成单例——
 * 那样编辑「A 需求」的草稿会串到新建发布里（两个实例的 `draft-scope` 不同，
 * 正是为了让 `PublishModal` 的 localStorage 草稿互不覆盖）。
 *
 * R047：三个入口（我的需求 / 需求大厅 / 个人中心）原先各写一份几乎逐字同构的状态机，
 * 现在都收到这里，另两处是薄包装（`useRequirementHallPublish` / `useProfilePublishRequirement`）。
 * **差异做成显式选项**，不做「顺手统一」。`includeDevelopmentCycle` 三个入口今天都是 `true`
 * （大厅 / 个人中心曾传 `false`，那让担保需求必然 400，见 `useRequirementHallPublish`）。
 * 跳转、后端调用都注入进来，这里只管表单状态、校验、loading 与 toast。
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
   * 表单里有没有「开发周期（天）」这一项，默认 `true`。
   *
   * 三个入口（我的需求 / 需求大厅 / 个人中心）的 `PublishModal` 都有这个字段（担保模式才显示），
   * 也都是 `true`。留成选项只为「模板里确实没有这一项」的将来实例：传 `false` 即跳过校验、载荷不带该键。
   */
  includeDevelopmentCycle?: boolean
  /**
   * 开弹窗与提交前各跑一次的门禁（发布＝实名认证；含跳转，所以由视图注入）。
   * 编辑重提不需要，省略即可。
   */
  ensureApproved?: () => Promise<boolean>
  /** 登录态读取：编辑重提要先登录（发布的登录由实名门禁兜住，不必重复判）。 */
  isAuthed?: () => boolean
  /** 校验通过后的后端调用；抛错即视为失败，由这里兜 toast。 */
  submit: (payload: RequirementPublishPayload, requirement: RequirementItem | null) => Promise<void>
  /** 成功提示（三个入口文案不同：发布 vs 重新提交）。 */
  successMessage: string
  /** 失败兜底文案（后端没给 message 时用）。 */
  failureMessage: string
  /** 提交成功后的收尾：发布清 `?modal=publish` 再刷新列表，编辑只刷新列表。 */
  onSubmitted?: () => void | Promise<void>
  /** 用户手动关闭弹窗后的收尾：发布要把 `?modal=publish` 从 query 里摘掉。 */
  onClosed?: () => void
  /**
   * 是否自己盯 `?modal=publish` 这条 query 来开窗（大厅 / 个人中心为 `true`）。
   *
   * 我的需求不开：那一页的 `?modal=publish` 由视图显式调 `openFromRoute()`，
   * 因为「读参数」与「摘参数」在那一页分属两处（见 `useRequirementPageActions`）。
   * 需要 `useRoute`，所以默认关——没挂路由的单测也能直接调这个工厂。
   */
  syncModalQuery?: boolean
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
  const pendingAgentDraft = options.mode === 'publish' ? consumePendingAgentDraft() : null
  const form = reactive<RequirementPublishFormValues>({
    ...emptyForm(),
    ...(pendingAgentDraft ?? {}),
  })
  const includeDevelopmentCycle = options.includeDevelopmentCycle ?? true

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
   * 顺序与原来各处入口一致：先跑门禁（`await`），通过后才复位 / 回填并显示——
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
   * 与原 `syncPublishModalFromRoute` / 大厅与个人中心那两条 watch 一致——实名 / 登录的提示与
   * 跳转留给用户在弹窗里点提交时再走，免得刚进页面就被踢去实名页。
   */
  function openFromRoute() {
    requirement.value = null
    reset()
    visible.value = true
  }

  if (options.syncModalQuery) {
    // 读参数在这里，摘参数在 `onClosed` / `onSubmitted`（由视图注入）——同一件事的两端。
    // `immediate: true` 保证「带参数挂载」当场重放一次：`PublishModal` 被 `v-if`
    // 卸过再挂不会补这一段。只开窗、**不跑实名门禁**（门禁留给提交前那一次）。
    const route = useRoute()
    watch(
      () => route.query.modal,
      (value) => {
        if (value === 'publish' && !visible.value) {
          openFromRoute()
        }
      },
      { immediate: true },
    )
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
   * 弹窗内部的提示转发：`PublishModal` 不直接引 toast，统一把消息抛给页面。
   * 三个入口共用这一份（大厅把它直接当 `@notify` 用）。
   */
  function notify(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    TMessage[type](message)
  }

  /**
   * 提交。三个入口走同一条链：
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

    const check = validateRequirementPublishForm({ ...form }, { includeDevelopmentCycle })

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
      TMessage.error(describeBackendError(err, options.failureMessage))
    } finally {
      loading.value = false
    }
  }

  /**
   * 模板挂点：`<PublishModal v-bind="modalBindings" />` 一行铺完。
   * 装配细节（含开发周期那一对键铺不铺）在 `useRequirementPublishModalBindings` 里 ——
   * 这里只为把返回值收在一个名字下。
   */
  const modalBindings = useRequirementPublishModalBindings({
    visible: () => visible.value,
    draftScope: () => draftScope.value,
    loading: () => loading.value,
    form,
    includeDevelopmentCycle,
    isEdit: options.mode === 'edit',
    onNotify: notify,
    onClose: close,
    onSubmit: submit,
  })

  return {
    // ---- 内部命名：我的需求用这几个（两个实例各调一次）----
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
    notify,
    /** 一份 `v-bind` 铺完的挂点（我的需求 / 个人中心用它）。 */
    modalBindings,
    // ---- `publishXxx` 别名：沿用这组命名的视图（需求大厅）不必改模板 ----
    publishVisible: visible,
    publishLoading: loading,
    publishModalRef: modalRef,
    publishTitle: toRef(form, 'title'),
    publishDescription: toRef(form, 'description'),
    publishBudget: toRef(form, 'budget'),
    publishAcceptance: toRef(form, 'acceptance'),
    publishPaymentMode: toRef(form, 'paymentMode'),
    // 别名一律给全（不按 `includeDevelopmentCycle` 收窄）：那一项只决定校验 / 载荷 / 挂点上带不带它，
    // 别名少给一个只会让调用方拿到 `Ref | undefined`，顺手写出的 `undefined.value` 正是本 bug 的形状。
    publishDevelopmentCycleDays: toRef(form, 'developmentCycleDays'),
  }
}

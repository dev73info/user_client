import { createRequirement as createRequirementApi } from '@/api/requirements'
import { usePublishModalRoute } from '@/composables/usePublishModalRoute'
import { useRequirementPublishForm } from '@/composables/useRequirementPublishForm'
import { useAuthStore } from '@/stores/auth'

type UseProfilePublishRequirementOptions = {
  /** 发布成功后重取需求列表：视图首屏那条串行链的唯一口子（读数条与进度面板吃同一份列表）。 */
  reloadRequirements: () => Promise<void>
  /** 未登录：跳登录。`redirectTarget` 是登录后回到「总览 + ?modal=publish」的完整路径。 */
  onNeedLogin: (redirectTarget: string) => void
  /** 未实名 / 被驳回 / 查无记录：跳实名页，`redirectTarget` 同上。 */
  onNeedRealname: (redirectTarget: string) => void
}

/**
 * 个人中心总览的「发布需求」域 —— R047 起是 `useRequirementPublishForm` 的**薄包装**：只剩本域自己的
 * 三件事（门禁两个去向由视图注入、摘 `?modal=publish`、发布后重取列表），共用 `usePublishModalRoute`。
 *
 * **`includeDevelopmentCycle: true`**：个人中心的 `PublishModal` 与大厅是同一个组件，担保模式下同样有
 * 「开发周期（天）」输入框，后端对 `platform_guarantee` 必填正数。早先这里传 `false`，用户填的值随
 * emit 无人接而丢掉、载荷里也不带 `development_cycle_days` —— 选「电签担保」发布必然 400。
 * 现在走 `publishModalBindings`（`v-bind` 一次铺完），那一对 `publishDevelopmentCycleDays` 键也随之铺上。
 * 自管模式（`self_managed`）仍不要求周期，值归 `undefined`。
 */
export function useProfilePublishRequirement(options: UseProfilePublishRequirementOptions) {
  const auth = useAuthStore()
  const { ensureApproved, clearPublishModalQuery } = usePublishModalRoute({
    routeName: 'workbench',
    onNeedLogin: options.onNeedLogin,
    onNeedRealname: options.onNeedRealname,
  })

  const publish = useRequirementPublishForm({
    mode: 'publish',
    /** 草稿按用户隔离：多账号共用浏览器时，`PublishModal` 的 localStorage 草稿不互相覆盖。 */
    draftScope: () => (auth.isAuthed ? auth.username : 'default'),
    includeDevelopmentCycle: true,
    ensureApproved,
    submit: async (payload) => {
      await createRequirementApi(auth.token, payload)
    },
    successMessage: '需求已发布',
    failureMessage: '发布失败',
    syncModalQuery: true,
    onClosed: clearPublishModalQuery,
    onSubmitted: async () => {
      clearPublishModalQuery()
      await options.reloadRequirements()
    },
  })

  return {
    publishVisible: publish.publishVisible,
    publishLoading: publish.publishLoading,
    publishModalRef: publish.publishModalRef,
    draftScope: publish.draftScope,
    ensurePublishRealnameApproved: ensureApproved,
    clearPublishModalQuery,
    closePublishModal: publish.close,
    submitRequirementPublish: publish.submit,
    publishModalBindings: publish.modalBindings,
  }
}

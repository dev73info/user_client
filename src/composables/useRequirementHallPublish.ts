import { createRequirement } from '@/api/requirements'
import { usePublishModalRoute } from '@/composables/usePublishModalRoute'
import { useRequirementPublishForm } from '@/composables/useRequirementPublishForm'
import { useAuthStore } from '@/stores/auth'

/**
 * 需求大厅的「发布需求」弹窗 —— R047 起是 `useRequirementPublishForm` 的**薄包装**：只剩大厅自己的
 * 四件事（门禁两个去向、摘 `?modal=publish`、发布后重拉大厅），路由与门禁共用 `usePublishModalRoute`。
 *
 * **`includeDevelopmentCycle: true`**：大厅的 `PublishModal` 有「开发周期（天）」输入框（担保模式才显示），
 * 后端 `POST /requirements/` 对 `platform_guarantee` 明写「必须填写正数的开发周期」，早先这里传 `false`
 * 等于把用户填的值连同载荷一起丢掉 —— 大厅选「电签担保」必然被后端 400 拒掉。所以必须接上这一项：
 * 校验它、载荷里带 `development_cycle_days`，模板侧（`RequirementHallView`）绑 `v-model:publishDevelopmentCycleDays`。
 * 自管模式（`self_managed`）仍不要求周期，值归 `undefined`（见 `shared/requirementPublishForm.ts`）。
 */
export function useRequirementHallPublish(options: { reloadHall: () => Promise<void> | void }) {
  const auth = useAuthStore()
  // 大厅的两个去向就是站内默认值（登录页 / 实名页），所以只给路由名。
  const { ensureApproved, clearPublishModalQuery } = usePublishModalRoute({
    routeName: 'requirement-hall',
  })

  const publish = useRequirementPublishForm({
    mode: 'publish',
    // 草稿按用户隔离：多账号共用浏览器时 `PublishModal` 的 localStorage 草稿不互相覆盖。
    // 大厅的模板自己传 `:draft-scope`（不走 bindings），这里给同一个表达式，两处口径不打架。
    draftScope: () => (auth.isAuthed ? auth.username : 'default'),
    includeDevelopmentCycle: true,
    ensureApproved,
    submit: async (payload) => {
      await createRequirement(auth.token, payload)
    },
    successMessage: '需求已发布，等待审核',
    failureMessage: '发布失败',
    syncModalQuery: true,
    onClosed: clearPublishModalQuery,
    onSubmitted: async () => {
      clearPublishModalQuery()
      await options.reloadHall()
    },
  })

  return {
    publishVisible: publish.publishVisible,
    publishLoading: publish.publishLoading,
    publishModalRef: publish.publishModalRef,
    publishTitle: publish.publishTitle,
    publishDescription: publish.publishDescription,
    publishBudget: publish.publishBudget,
    publishAcceptance: publish.publishAcceptance,
    publishPaymentMode: publish.publishPaymentMode,
    // 担保模式的「开发周期（天）」：大厅模板用 `v-model:publishDevelopmentCycleDays` 接这一路，
    // 少了它输入框还能渲染（`PublishModal` 只在担保模式显示），但用户键入的值会原地丢掉。
    publishDevelopmentCycleDays: publish.publishDevelopmentCycleDays,
    openPublishModal: publish.open,
    closePublishModal: publish.close,
    submitPublishRequirement: publish.submit,
    notify: publish.notify,
  }
}

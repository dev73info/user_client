import { createRequirement } from '@/api/requirements'
import { usePublishModalRoute } from '@/composables/usePublishModalRoute'
import { useRequirementPublishForm } from '@/composables/useRequirementPublishForm'
import { useAuthStore } from '@/stores/auth'

/**
 * 需求大厅的「发布需求」弹窗 —— R047 起是 `useRequirementPublishForm` 的**薄包装**：只剩大厅自己的
 * 四件事（门禁两个去向、摘 `?modal=publish`、发布后重拉大厅），路由与门禁共用 `usePublishModalRoute`。
 * **`includeDevelopmentCycle: false` 是刻意的**：大厅表单没有开发周期字段，载荷里也不带
 * `development_cycle_days`（与拆分前逐字节一致；缺口待产品确认，见任务报告）。对外名字不变。
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
    includeDevelopmentCycle: false,
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
    openPublishModal: publish.open,
    closePublishModal: publish.close,
    submitPublishRequirement: publish.submit,
    notify: publish.notify,
  }
}

import { useRoute, useRouter } from 'vue-router'

import {
  createRequirement as createRequirementApi,
  resubmitRequirement as resubmitRequirementApi,
  type RequirementItem,
} from '@/api/requirements'
import type { useMyRequirementsData } from '@/composables/useMyRequirementsData'
import { useRealnameApprovalGate } from '@/composables/useRealnameApprovalGate'
import { useRequirementBreach } from '@/composables/useRequirementBreach'
import { useRequirementBreachModalBindings } from '@/composables/useRequirementBreachModalBindings'
import { useRequirementConfirmActions } from '@/composables/useRequirementConfirmActions'
import { useRequirementContract } from '@/composables/useRequirementContract'
import { useRequirementPayFlow } from '@/composables/useRequirementPayFlow'
import { useRequirementPublishForm } from '@/composables/useRequirementPublishForm'
import { useRequirementRowDialogs } from '@/composables/useRequirementRowDialogs'
import type { RequirementPublishPayload } from '@/shared/requirementPublishForm'
import { canPay, type RequirementRowFacts } from '@/shared/requirementRowRules'
import { useAuthStore } from '@/stores/auth'

type UseRequirementPageActionsOptions = {
  /** 列表数据源：`reload()` 与四张按条 map 的唯一出口，动作域都从这里取。 */
  data: ReturnType<typeof useMyRequirementsData>
  rowFacts: (item: RequirementItem) => RequirementRowFacts
}

/**
 * 「我的需求」页的动作域总装：支付、合同、取消 / 完成 / 验收 / 售后 / 评价、
 * 会话 / 发票 / 转为我的资源、解除合作、发布与编辑。
 *
 * 每个域仍是自己的工厂（`useRequirementContract` / `useRequirementConfirmActions` / …），
 * 这里只做两件事：
 * 1. **注入**：token、按条事实、`reload()`、跨域的入口（验收通过后打开支付弹窗）；
 * 2. **拼挂点**：每个弹窗的 props / 监听由各自的域拼成一份 `v-bind` 对象。
 *
 * 页面级的「跳转」也在这里收口（站内路由与 `window.location` 两种导航都留在这一层，
 * 域与弹窗组件都不碰 router）。
 */
export function useRequirementPageActions(options: UseRequirementPageActionsOptions) {
  const router = useRouter()
  const route = useRoute()
  const auth = useAuthStore()
  const { data } = options

  // ---- 支付：金额比例来自数据源、可否支付按行事实判定，建单后的跳转在这里执行 ----
  const pay = useRequirementPayFlow({
    token: () => auth.token,
    depositRatioPercent: () => data.depositRatioPercent.value,
    canPayRequirement: (item) => canPay(item, options.rowFacts(item)),
    onPaid: data.reload,
  })

  /**
   * 支付按钮的收尾：`useRequirementPayFlow` 只返回「去哪儿」——建单成功后返回支付页的 query，
   * 导航在这里执行。
   *
   * 没有「跳外部授权地址」这一支：那条是云闪付中间页的老链路，对应接口在当前契约里没有，
   * 分支留着只会让人以为还有第二条支付路。
   */
  async function submitRequirementPayment() {
    const outcome = await pay.submitPayment()

    if (outcome.kind === 'redirect-page') {
      void router.push({ name: 'payment', query: outcome.query })
    }
  }

  // ---- 合同：发起 / 签署 / 只看（含爱签预览回退）----
  const contract = useRequirementContract({
    token: () => auth.token,
    isAuthed: () => auth.isAuthed,
    onOpenContractSign: (item) => {
      void router.push({
        name: 'contract-sign',
        query: { requirement_id: item.requirement_id, from: 'user' },
      })
    },
    onOpenPreviewUrl: (url) => {
      window.location.href = url
    },
    onCreated: data.reload,
  })

  // ---- 取消 / 确认完成 / 验收 / 售后 / 评价 ----
  const confirmActions = useRequirementConfirmActions({
    token: () => auth.token,
    username: () => auth.username,
    isAuthed: () => auth.isAuthed,
    rowFacts: options.rowFacts,
    myRequirements: () => data.myRequirements.value,
    reload: data.reload,
    openPayModal: pay.openPayModal,
  })

  // ---- 会话 / 发票 / 转为我的资源 ----
  const rowDialogs = useRequirementRowDialogs({
    token: () => auth.token,
    username: () => auth.username,
    reload: data.reload,
    applyConversationDetail: data.applyConversationDetail,
    refreshProfile: async () => {
      await auth.fetchProfile(true)
    },
    onGoDevResourceList: () => {
      void router.push({ name: 'dev-resource-list' })
    },
  })

  // ---- 解除合作 ----
  const breach = useRequirementBreach({
    token: () => auth.token,
    username: () => auth.username,
    contractOf: (item) => data.signingStatusForRequirement(item),
  })
  const breachBindings = useRequirementBreachModalBindings(breach)

  // ---- 发布前的实名门禁：只取状态，两个跳转（登录 / 实名页）在这里 ----
  const publishRealnameGate = useRealnameApprovalGate({
    token: () => auth.token,
    isAuthed: () => auth.isAuthed,
    hydrate: () => auth.hydrate(),
    onNeedLogin: () => {
      void router.push({
        name: 'home',
        query: { modal: 'auth', mode: 'login', redirect_to: publishRedirectTarget() },
      })
    },
    onNeedRealname: (redirectTarget) => {
      void router.push({ name: 'workbench-realname', query: { redirect_to: redirectTarget } })
    },
  })

  /** 登录 / 实名完成后要回到的地址：当前页 + `?modal=publish`。 */
  function publishRedirectTarget() {
    return router.resolve({
      name: 'workbench-requirements',
      query: { ...route.query, modal: 'publish' },
    }).fullPath
  }

  /** `?modal=publish` 的清 query：由发布实例的 `onClosed` / `onSubmitted` 回头调用。 */
  function clearPublishModalQuery() {
    if (route.query.modal !== 'publish') {
      return
    }

    const nextQuery = { ...route.query }
    delete nextQuery.modal
    void router.replace({ query: nextQuery })
  }

  // ---- 两个发布实例：同一个工厂调两次，状态各归各的（做成单例会串草稿）----
  const submitRequirementCreate = async (payload: RequirementPublishPayload) => {
    // 接口入参由 `shared/requirementPublishForm` 归一化好，这里只补 token 与接口地址。
    await createRequirementApi(auth.token, payload)
  }

  const publishForm = useRequirementPublishForm({
    mode: 'publish',
    // 草稿按用户名隔离：多账号共用浏览器时不互相覆盖。
    draftScope: () => (auth.isAuthed ? auth.username : 'default'),
    // 开弹窗时跑一次、提交前再复检一次（两处都得留：用户可能开着弹窗去别处提交实名）。
    ensureApproved: () => publishRealnameGate.ensureApproved(publishRedirectTarget()),
    submit: submitRequirementCreate,
    successMessage: '需求已发布，等待审核',
    failureMessage: '发布失败',
    onClosed: clearPublishModalQuery,
    onSubmitted: async () => {
      clearPublishModalQuery()
      await data.reload()
    },
  })

  const submitRequirementResubmitRequest = async (
    payload: RequirementPublishPayload,
    item: RequirementItem | null,
  ) => {
    if (!item) {
      return
    }
    await resubmitRequirementApi(auth.token, item.requirement_id, payload)
  }

  const editForm = useRequirementPublishForm({
    mode: 'edit',
    // 草稿按需求隔离：编辑同一条需求才恢复同一份草稿。
    draftScope: (item) => (item ? `edit-${item.requirement_id}` : ''),
    isAuthed: () => auth.isAuthed,
    submit: submitRequirementResubmitRequest,
    successMessage: '需求已重新提交，等待审核',
    failureMessage: '重新提交失败',
    onSubmitted: data.reload,
  })

  return {
    payChannel: pay.payChannel,
    openPayModal: pay.openPayModal,
    updatePayChannel: pay.updatePayChannel,
    payModal: pay.modalBindings,
    submitRequirementPayment,
    ...contract,
    ...confirmActions,
    ...rowDialogs,
    breachModal: breachBindings.modalBindings,
    openBreachReport: breach.openBreachReport,
    publishVisible: publishForm.visible,
    openPublishModal: publishForm.open,
    openPublishModalFromRoute: publishForm.openFromRoute,
    publishModalRef: publishForm.modalRef,
    publishModal: publishForm.modalBindings,
    editModalRef: editForm.modalRef,
    editModal: editForm.modalBindings,
    openRequirementEditForm: editForm.open,
  }
}

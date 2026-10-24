import { computed, ref } from 'vue'

import { getRequirementBreachCase, type RequirementBreachCaseItem } from '@/api/afterSales'
import {
  fetchContractSigningStatus,
  fetchDevContractSigningStatus,
  type ContractSigningStatus,
} from '@/api/contracts'
import {
  listMyRequirements,
  type RequirementItem as DevRequirementItem,
} from '@/api/devRequirements'
import {
  listRequirements,
  type RequirementItem,
  type RequirementPaymentMode,
  type RequirementStatus,
} from '@/api/requirements'
import { getDepositRatio } from '@/api/settings'

export type ViewerRole = 'customer' | 'developer'

/** 动作栏只读需求单的这几个字段，需求方与开发者的列表结构合并成同一份。 */
export type ActionRequirement = {
  requirement_id: string
  title: string
  status: RequirementStatus
  budget?: number | null
  payment_mode: RequirementPaymentMode
  bound_resource_id?: number | null
  bound_resource_version_count?: number | null
}

type ActionStateSources = {
  token: string
  requirementId: string
  role: ViewerRole
}

/**
 * 会话底部工具条的取数与可用性判断。
 *
 * 从 `RequirementConversationActions.vue` 抽出：需求单 + 合同签署状态 + 定金比例 + 解除合作案件，
 * 以及「按当前身份与需求状态，哪一步能做」。三条数据并行拉取，任一失败都不拦其它两条；
 * 需求单本身拉不到时整条操作栏不展示——涉及资金与合同的入口宁可少给，不能给错。
 */
export function useConversationActionState(readSources: () => ActionStateSources) {
  const requirement = ref<ActionRequirement | null>(null)
  const signing = ref<ContractSigningStatus | null>(null)
  const breachCase = ref<RequirementBreachCaseItem | null>(null)
  const depositRatioPercent = ref(20)
  const loadFailed = ref(false)

  const isDeveloper = computed(() => readSources().role === 'developer')
  const isSelfManaged = computed(() => requirement.value?.payment_mode === 'self_managed')
  const status = computed<RequirementStatus | null>(() => requirement.value?.status ?? null)
  const hasContract = computed(() => Boolean(signing.value?.has_contract))
  const contractSigned = computed(() =>
    Boolean(signing.value?.party_a_signed && signing.value?.party_b_signed),
  )
  const myPartySigned = computed(() =>
    isDeveloper.value
      ? Boolean(signing.value?.party_b_signed)
      : Boolean(signing.value?.party_a_signed),
  )
  const hasBoundResource = computed(() => requirement.value?.bound_resource_id != null)
  const publishedVersionCount = computed(() => requirement.value?.bound_resource_version_count ?? 0)

  const canCreateContract = computed(
    () =>
      !isSelfManaged.value &&
      hasBoundResource.value &&
      (status.value === 'pending_deposit' || status.value === 'deposit_paid') &&
      !hasContract.value,
  )
  const canOpenContract = computed(() => !isSelfManaged.value && hasContract.value)
  // 定金与尾款只能由甲方（需求方）缴纳：后端 adapay service 会校验付款人必须是合同甲方，
  // 开发者点了只会拿到 403，因此这两个入口对开发者一律不展示。
  const canPayDeposit = computed(
    () =>
      !isDeveloper.value &&
      !isSelfManaged.value &&
      contractSigned.value &&
      status.value === 'pending_deposit',
  )
  const canPayFinal = computed(
    () =>
      !isDeveloper.value &&
      !isSelfManaged.value &&
      contractSigned.value &&
      status.value === 'pending_final',
  )
  /**
   * 当前是否有可缴的款（定金或尾款）。
   *
   * 与上面两个分开：工具条按阶段分开给「支付定金 / 支付尾款」两枚 chip，而会话卡片只需要知道
   * 「现在有没有款可缴」——卡片自己已经按需求状态决定按钮写「支付定金」还是「支付尾款」，
   * 弹窗打开后按阶段算该付的金额。两个条件都从这里过，卡片与工具条不会各写一套而走偏。
   */
  const canPay = computed(() => canPayDeposit.value || canPayFinal.value)
  /**
   * 无担保模式的「确认完成」：没有合同也没有尾款，确认即结单。
   *
   * 担保模式不能走这里：它的验收与尾款是两个动作，分别由「验收」和「支付尾款」承担。
   * 后端 `request-final-payment` 在担保模式下除状态外还要求已存在一条「验收通过」留档，
   * 而验收通过本身就会把状态推到 `pending_final`——所以在 `in_development` 上放一个调该接口
   * 的入口必然被拒（曾经就是这样：按钮写着「确认验收并支付尾款」，点下去只报
   * `only in-development requirements may request final payment`）。
   */
  const canRequestFinal = computed(
    () =>
      !isDeveloper.value &&
      isSelfManaged.value &&
      hasBoundResource.value &&
      status.value === 'in_development' &&
      publishedVersionCount.value > 0,
  )
  /**
   * 担保模式的验收入口：开发中与待付尾款都能提交，与「我的需求」页的 `canOpenAcceptance` 同口径。
   *
   * 验收可反复提交——不通过会留档并通知开发者整改：「开发中」留在原状态；
   * 「待付尾款」会退回「开发中」并挡住宿尾款（后端 `accept_delivery` 的 rolling_back 分支），
   * 所以要给到待付尾款这一步。
   */
  const canAcceptDelivery = computed(
    () =>
      !isDeveloper.value &&
      !isSelfManaged.value &&
      contractSigned.value &&
      hasBoundResource.value &&
      publishedVersionCount.value > 0 &&
      (status.value === 'in_development' || status.value === 'pending_final'),
  )
  const canDeliver = computed(
    () =>
      isDeveloper.value &&
      hasBoundResource.value &&
      (status.value === 'in_development' || status.value === 'pending_final'),
  )
  /** 在办的解除合作案件（`is_open` 由后端按状态机算，前端不自己列终态表）。 */
  const hasLiveBreachCase = computed(() => breachCase.value?.is_open === true)
  /** 开发者在待付尾款阶段可催告付款（只通知，不动钱）。 */
  const canCureFinalPay = computed(
    () =>
      isDeveloper.value &&
      !isSelfManaged.value &&
      contractSigned.value &&
      status.value === 'pending_final' &&
      !hasLiveBreachCase.value,
  )

  const canUseBreach = computed(
    () =>
      hasLiveBreachCase.value ||
      (!isSelfManaged.value &&
        (status.value === 'deposit_paid' ||
          status.value === 'in_development' ||
          status.value === 'pending_final' ||
          // 已签约未缴定金：甲方拒缴定金同样是违约，可以在这一阶段申报——那种案件没有支付单，
          // 只作责任认定，不动钱。合同还没生效时没有可裁决的对象，入口不给。
          (status.value === 'pending_deposit' && contractSigned.value) ||
          // 待分账时尾款已缴、排队分账尚未执行，解除合作仍能取消排队（与需求卡片同口径）。
          status.value === 'pending_settlement')),
  )

  /**
   * 结单后的唯一业务入口：解除合作（与需求列表页的 `canOpenAfterSales` 同一口径）。
   *
   * 只在担保模式、需求 `completed` 时给：结单之前的问题走「解除合作」，结单之后资金已分账出账，
   * 只有解除合作这一条线能退尾款、扣接单保证金；无担保模式没有托管资金，也没有可裁决的对象。
   * 两侧都能看到这个入口（乙方要在这里表态接受或不接受），但发起只有需求方，见 `canOpenCase`。
   */
  const canUseAfterSales = computed(() => status.value === 'completed' && !isSelfManaged.value)

  /**
   * 下载交付产物时已经确认过版本列表：列表接口偶发仍给 `bound_resource_version_count = 0`，
   * 会把「验收」卡住。用刚查到的真实版本数兜底抬一下，再触发 capabilities 重算。
   */
  function applyPublishedVersionCount(count: number) {
    const item = requirement.value
    if (!item || count <= 0) {
      return
    }
    const current = item.bound_resource_version_count ?? 0
    if (count <= current) {
      return
    }
    requirement.value = { ...item, bound_resource_version_count: count }
  }

  function toActionRequirement(row: RequirementItem | DevRequirementItem): ActionRequirement {
    return {
      requirement_id: row.requirement_id,
      title: row.title,
      status: row.status,
      budget: row.budget,
      payment_mode: row.payment_mode,
      bound_resource_id: row.bound_resource_id,
      bound_resource_version_count: row.bound_resource_version_count,
    }
  }

  async function loadActions() {
    const { token, requirementId, role } = readSources()
    if (!token || !requirementId) {
      requirement.value = null
      return
    }

    try {
      const rows =
        role === 'developer' ? await listMyRequirements(token) : await listRequirements(token)
      const matched = rows.find((row) => row.requirement_id === requirementId)
      requirement.value = matched ? toActionRequirement(matched) : null
      loadFailed.value = false
    } catch {
      // 需求单加载失败时整条操作栏不展示：涉及资金与合同的入口宁可少给，不能给错。
      requirement.value = null
      loadFailed.value = true
      return
    }

    const item = requirement.value
    const [statusResult, ratioResult, breachResult] = await Promise.all([
      (role === 'developer'
        ? fetchDevContractSigningStatus(token, requirementId)
        : fetchContractSigningStatus(token, requirementId)
      ).catch(() => null),
      getDepositRatio(token).catch(() => null),
      item && item.payment_mode === 'platform_guarantee'
        ? getRequirementBreachCase(token, requirementId)
            .then((response) => (response.has_case ? (response.case ?? null) : null))
            .catch(() => null)
        : Promise.resolve(null),
    ])

    signing.value = statusResult
    if (ratioResult && Number.isFinite(ratioResult.deposit_ratio_percent)) {
      depositRatioPercent.value = ratioResult.deposit_ratio_percent
    }
    breachCase.value = breachResult
  }

  /** 打开解除合作弹窗前重拉一次案件：缓存一份反而会显示上一轮的结果。 */
  async function refreshBreachCase() {
    const item = requirement.value
    if (!item) {
      return
    }
    breachCase.value = await getRequirementBreachCase(readSources().token, item.requirement_id)
      .then((response) => (response.has_case ? (response.case ?? null) : null))
      .catch(() => null)
  }

  return {
    requirement,
    signing,
    breachCase,
    depositRatioPercent,
    loadFailed,
    isDeveloper,
    isSelfManaged,
    status,
    hasContract,
    contractSigned,
    myPartySigned,
    hasBoundResource,
    publishedVersionCount,
    canCreateContract,
    canOpenContract,
    canPayDeposit,
    canPayFinal,
    canPay,
    canRequestFinal,
    canAcceptDelivery,
    canDeliver,
    hasLiveBreachCase,
    canCureFinalPay,
    canUseBreach,
    canUseAfterSales,
    applyPublishedVersionCount,
    loadActions,
    refreshBreachCase,
  }
}

import { computed, reactive, ref, type Ref } from 'vue'

import {
  changeMyAdapaySettlementAccount,
  closeMyAdapaySettlementAccount,
  createMyAdapaySettlementAccount,
  getMyAdapayMember,
  getMySettlementAccountSnapshot,
  type AdapayMemberStatus,
  type MySettlementAccountSnapshot,
} from '@/api/adapay'
import type { UserRealnameVerification } from '@/api/realname'
import { missingEnterpriseOnboardingLabels } from '@/shared/realnameMaterials'
import {
  isSettleBound,
  isSettleRejected,
  isSettleUnderReview,
  settleAccountStage,
  settleProviderErrorText,
} from '@/shared/settleAccountStage'
import { useAuthStore } from '@/stores/auth'
import { getSettlementCities, prepareSettlementAccount } from '@/utils/settlementAccount'
import { TMessage } from 'ui_73info'

/**
 * 收款银行卡（Adapay 结算账户）域：四态进度、缺资料清单、省市联动、脱敏明细回填、绑卡与换卡、
 * 注销结算账户。弹窗模板在 `components/account/SettlementDialog.vue`。
 * `current` 与 `adapayMember` 跨 hero / 入口卡 / 结算 / onMounted 共用，必须注入。
 */
export type SettlementAccountOptions = {
  /** 当前实名记录（跨块共用，注入）。 */
  realname: Ref<UserRealnameVerification | null>
  /** 渠道会员状态（跨块共用，注入）。 */
  adapayMember: Ref<AdapayMemberStatus | null>
  /** 当前实名主体是不是企业 / 个体工商户：决定绑对公账户还是个人银行卡。 */
  isEnterpriseSubject: () => boolean
}

/**
 * 会员状态的类型直接复用 `@/api/adapay` 那一份，不在这里重写一份投影：视图只需要这个类型，
 * 从本文件再导出一次，就省得为一个类型去直连 api 层（api-deps 按模块计）。
 */
export type { AdapayMemberStatus }

export function useSettlementAccount(options: SettlementAccountOptions) {
  const auth = useAuthStore()
  const { realname, adapayMember, isEnterpriseSubject } = options

  const settleDialogVisible = ref(false)
  const settleSaving = ref(false)
  const settleLoading = ref(false)
  const closeSettleDialogVisible = ref(false)
  const closeSettleLoading = ref(false)
  /** 注销确认词：与「注销账号」同一道防误触，必须原样键入「注销结算账户」才允许提交。 */
  const closeSettleConfirmation = ref('')
  /** 已绑卡的**脱敏**明细：只回填开户行 / 省市区 / 账户类型，脱敏卡号只作提示、不回填输入框。 */
  const settleSnapshot = ref<MySettlementAccountSnapshot | null>(null)
  const settleForm = reactive({
    card_id: '',
    bank_code: '',
    prov_code: '',
    area_code: '',
    bank_acct_type: '2',
  })

  /** 是否已绑定结算账户（决定提交时走「绑定」还是「更换」接口）。口径见 `@/shared/settleAccountStage`。 */
  const settleBound = computed(() => isSettleBound(adapayMember.value?.settleAccountId))

  /** 四态分开看：`failed` 是「去整改」不是「等」。口径见 `@/shared/settleAccountStage`。 */
  const settleStage = computed(() =>
    settleAccountStage(adapayMember.value?.onboardingStatus, adapayMember.value?.settleAccountId),
  )

  /** 已绑的卡是否还挂在旧主体上：主体变更后渠道侧账户不会自动跟着换，必须先说清原因。 */
  const settleSubjectMismatch = computed(() => {
    const expected = isEnterpriseSubject() ? 'enterprise' : 'personal'
    return Boolean(adapayMember.value?.memberType) && adapayMember.value?.memberType !== expected
  })

  /** 企业主体的收款账户只能是对公账户，持证人固定取实名主体，因此不给用户改。 */
  const settleCorporateLocked = computed(() => isEnterpriseSubject())

  /** 当前实名主体的中文口径，用于把「这张卡为什么不能继续用」讲清楚。 */
  const settleSubjectLabel = computed(() =>
    settleCorporateLocked.value ? '企业 / 个体工商户' : '个人',
  )

  /** 该主体要绑的账户类型：企业 / 个体工商户是对公账户，其余是银行卡。 */
  const settleAccountWord = computed(() => (settleCorporateLocked.value ? '对公账户' : '银行卡'))

  /** 企业进件资料缺任一项渠道都会拒绝建会员，所以提前拦在界面层并说清缺哪几项。 */
  const settleMaterialMissing = computed(
    () =>
      settleCorporateLocked.value && missingEnterpriseOnboardingLabels(realname.value).length > 0,
  )
  const settleMaterialMissingText = computed(() =>
    missingEnterpriseOnboardingLabels(realname.value).join('、'),
  )

  /** 渠道会员是否还在审核中：审核期间绑不了对公账户。口径见 `@/shared/settleAccountStage`。 */
  const settleUnderReview = computed(() =>
    isSettleUnderReview(adapayMember.value?.onboardingStatus),
  )

  /** 「审核中」那句提示：企业与个人绑的不是同一种账户，不能共用一句写死对公账户的话。 */
  const settleUnderReviewText = computed(() =>
    settleCorporateLocked.value
      ? '企业收款账户正在渠道审核中，审核通过后即可绑定对公账户'
      : '收款账户正在渠道审核中，审核通过后即可绑定银行卡',
  )

  /** `onboarding_status = failed` 是唯一表示「渠道给了否定结论」的取值。 */
  const settleRejected = computed(() => isSettleRejected(adapayMember.value?.onboardingStatus))

  /** 渠道侧最近一次拒绝的原话；已开通且卡还在时不提旧伤，换卡失败解绑时必留。 */
  const settleProviderError = computed(() =>
    settleProviderErrorText(
      adapayMember.value?.onboardingStatus,
      adapayMember.value?.providerError,
      adapayMember.value?.settleAccountId,
    ),
  )

  const settleCities = computed(() => getSettlementCities(settleForm.prov_code))

  /** 省份一换就把城市重算：只有一个城市时直接替用户选上。 */
  function setSettleProvince(provinceCode: string) {
    settleForm.prov_code = provinceCode
    settleForm.area_code = settleCities.value.length === 1 ? settleCities.value[0]!.value : ''
  }

  /** 清空表单，避免上次未提交的输入（尤其是更换时取消）残留到下一次打开。 */
  function resetSettleForm() {
    settleForm.card_id = ''
    settleForm.bank_code = ''
    settleForm.prov_code = ''
    settleForm.area_code = ''
    // 账户类型跟着实名主体走：企业主体只能绑对公账户，个人主体默认个人卡。
    settleForm.bank_acct_type = settleCorporateLocked.value ? '1' : '2'
  }

  /** 重新拉取会员状态；失败时置空，让界面退化为「未绑定」而不是继续显示旧卡。 */
  async function refreshAdapayMember() {
    if (!auth.token) return
    try {
      adapayMember.value = await getMyAdapayMember(auth.token)
    } catch {
      adapayMember.value = null
    }
  }

  /** 拉取脱敏明细并回填能提交出去的字段（开户行 / 省 / 市 / 账户类型）；卡号留空让用户重填。 */
  async function loadSettleSnapshot() {
    settleSnapshot.value = null
    if (!auth.token || !settleBound.value) return
    try {
      const snapshot = await getMySettlementAccountSnapshot(auth.token)
      settleSnapshot.value = snapshot
      if (snapshot.bankCode) settleForm.bank_code = snapshot.bankCode
      if (snapshot.provCode) settleForm.prov_code = snapshot.provCode
      if (snapshot.areaCode) settleForm.area_code = snapshot.areaCode
      if (snapshot.bankAcctType === '1' || snapshot.bankAcctType === '2') {
        settleForm.bank_acct_type = snapshot.bankAcctType
      }
    } catch {
      // 拿不到明细不影响换卡：表单已按实名主体给了默认账户类型，用户自己填即可
      settleSnapshot.value = null
    }
  }

  /** 卡号输入框的提示：已绑卡时直接显示渠道给的脱敏卡号，一眼看清当前是哪张卡。 */
  const settleCardPlaceholder = computed(() => {
    if (!settleBound.value) return '请输入收款银行卡号'
    const masked = (settleSnapshot.value?.cardIdMasked ?? '').trim()
    return masked ? `当前 ${masked}（更换请整卡重填）` : '请输入收款银行卡号（需整卡重填）'
  })

  /** 打开弹窗即进入表单：已绑卡时回填脱敏明细，未绑卡时按实名主体给默认值。 */
  async function openSettleDialog() {
    settleDialogVisible.value = true
    resetSettleForm()
    settleLoading.value = true
    try {
      await refreshAdapayMember()
      await loadSettleSnapshot()
    } finally {
      settleLoading.value = false
    }
  }

  /** 关掉弹窗（取消更换 / 未绑定时放弃填写），顺手清掉未提交的输入。 */
  function closeSettleDialog() {
    settleDialogVisible.value = false
    resetSettleForm()
    settleSnapshot.value = null
  }

  async function saveSettleAccount() {
    if (!auth.token || settleSaving.value) return
    let payload
    try {
      payload = prepareSettlementAccount(settleForm)
    } catch (err) {
      TMessage.warning(err instanceof Error ? err.message : '请检查银行卡信息')
      return
    }
    // 提交前定一次语义：更换会先解绑旧卡，失败时界面要按真实状态回落
    const changing = settleBound.value
    settleSaving.value = true
    try {
      const member = changing
        ? await changeMyAdapaySettlementAccount(auth.token, payload)
        : await createMyAdapaySettlementAccount(auth.token, payload)
      adapayMember.value = member
      TMessage.success(changing ? '收款银行卡已更换' : '结算账户已设置')
      settleDialogVisible.value = false
      resetSettleForm()
      settleSnapshot.value = null
    } catch (err) {
      TMessage.error(
        err instanceof Error ? err.message : changing ? '更换收款银行卡失败' : '设置结算账户失败',
      )
      // 更换是「先解绑再重建」，失败可能停在已解绑的中间态，刷新后按真实状态展示
      if (changing) {
        await refreshAdapayMember()
      }
    } finally {
      settleSaving.value = false
    }
  }

  /** 确认词键入正确、也没有正在提交时才允许点「确认注销」。 */
  const closeSettleReady = computed(() => closeSettleConfirmation.value.trim() === '注销结算账户')

  /** 打开注销弹窗：每次都清空确认词，避免上一次的输入残留（与注销账号同口径）。 */
  function openCloseSettleDialog() {
    closeSettleConfirmation.value = ''
    closeSettleDialogVisible.value = true
  }

  /** 注销结算账户：先让渠道删掉，成功才清本地绑定；渠道的拒绝原话透给用户。 */
  async function handleCloseSettleAccount() {
    if (!auth.token.trim()) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }
    if (!closeSettleReady.value) {
      TMessage.warning('请输入“注销结算账户”确认操作')
      return
    }
    closeSettleLoading.value = true
    try {
      adapayMember.value = await closeMyAdapaySettlementAccount(auth.token)
      TMessage.success('结算账户已注销')
      closeSettleDialogVisible.value = false
      closeSettleConfirmation.value = ''
      settleSnapshot.value = null
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '注销结算账户失败')
      // 失败可能停在「渠道已删、本地未更新」之外的任何状态，刷新一次按真实状态展示
      await refreshAdapayMember()
    } finally {
      closeSettleLoading.value = false
    }
  }

  return {
    settleDialogVisible,
    settleSaving,
    settleLoading,
    settleForm,
    settleBound,
    settleStage,
    settleCorporateLocked,
    settleSubjectLabel,
    settleAccountWord,
    settleSubjectMismatch,
    settleMaterialMissing,
    settleMaterialMissingText,
    settleUnderReview,
    settleUnderReviewText,
    settleRejected,
    settleProviderError,
    settleCities,
    settleCardPlaceholder,
    setSettleProvince,
    refreshAdapayMember,
    openSettleDialog,
    closeSettleDialog,
    saveSettleAccount,
    closeSettleDialogVisible,
    closeSettleConfirmation,
    closeSettleReady,
    closeSettleLoading,
    openCloseSettleDialog,
    handleCloseSettleAccount,
  }
}

import { computed, reactive, ref, type Ref } from 'vue'

import {
  changeMyAdapaySettlementAccount,
  closeMyAdapaySettlementAccount,
  createMyAdapaySettlementAccount,
  getMyAdapayMember,
  getMySettlementAccountSnapshot,
  openMyAdapaySettlementAccount,
  type AdapayMemberStatus,
  type MySettlementAccountSnapshot,
} from '@/api/adapay'
import type { UserRealnameVerification } from '@/api/realname'
import { useSettlementAccountLabels } from '@/composables/useSettlementAccountLabels'
import { useAuthStore } from '@/stores/auth'
import {
  findBankCodeByName,
  getSettlementCities,
  prepareSettlementAccount,
  prepareSettlementOpen,
} from '@/utils/settlementAccount'
import { TMessage } from 'ui_73info'

/**
 * 收款银行卡（结算账户）域：表单草稿、脱敏回填、绑定与更换、注销账户。
 *
 * 弹窗模板在 `components/account/SettlementDialog.vue`；派生读数（阶段、主体、缺资料、渠道原话）
 * 在 `useSettlementAccountLabels`。
 *
 * 首次绑定走**自动开户** `POST /api/payment/settlement-account/open`：个人主体一次提交完整卡号、
 * 银行预留手机号、证件号与开户省市，后端直接向渠道建会员 + 绑卡。完整卡号只在请求体里出现一次，
 * 平台不落库。企业主体仍走人工资料通道（对公进件另有三证流程，不在本弹窗）。
 * 已绑账户的改绑走 `POST /api/payment/settlement-account/change`。
 *
 * `realname` 与 `adapayMember` 跨 hero / 入口卡 / 结算 / onMounted 共用，必须注入。
 */
export type SettlementAccountOptions = {
  /** 当前实名记录（跨块共用，注入）。 */
  realname: Ref<UserRealnameVerification | null>
  /** 结算账户读数（跨块共用，注入）。 */
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
  const { realname, adapayMember } = options

  const labels = useSettlementAccountLabels(options)
  const { settleBound, settleCorporateLocked } = labels

  const settleDialogVisible = ref(false)
  const settleSaving = ref(false)
  const settleLoading = ref(false)
  const closeSettleDialogVisible = ref(false)
  const closeSettleLoading = ref(false)
  /** 注销确认词：与「注销账号」同一道防误触，必须原样键入「注销结算账户」才允许提交。 */
  const closeSettleConfirmation = ref('')
  /** 已绑账户的**脱敏**明细：只回填户名 / 开户行 / 尾号，卡号只有后四位可回显。 */
  const settleSnapshot = ref<MySettlementAccountSnapshot | null>(null)
  const settleForm = reactive({
    /** 自动开户时是完整卡号（只进请求体）；改绑 / 企业人工通道时是卡号后四位。 */
    card_id: '',
    bank_code: '',
    bank_acct_type: '2',
    /** 银行预留手机号（自动开户必填）。 */
    tel_no: '',
    /** 证件号（对私自动开户必填，默认取实名记录里的本人证件号）。 */
    cert_id: '',
    /** 开户省市编码（自动开户必填）。 */
    prov_code: '',
    area_code: '',
  })

  /** 首次绑定走自动开户：个人主体、未绑卡。企业主体仍走人工资料通道。 */
  const settleOpenMode = computed(() => !settleBound.value && !settleCorporateLocked.value)

  /** 开户城市：跟着省份走，空省份时没有可选城市。 */
  const settleCities = computed(() => getSettlementCities(settleForm.prov_code))

  /** 清空表单，避免上次未提交的输入（尤其是更换时取消）残留到下一次打开。 */
  function resetSettleForm() {
    settleForm.card_id = ''
    settleForm.bank_code = ''
    settleForm.tel_no = ''
    settleForm.prov_code = ''
    settleForm.area_code = ''
    // 账户类型跟着实名主体走：企业主体只能绑对公账户，个人主体默认个人卡。
    settleForm.bank_acct_type = settleCorporateLocked.value ? '1' : '2'
    // 自动开户要的证件号与手机号先按实名记录带上；用户可以改（银行预留手机号可能不同）。
    settleForm.cert_id = settleOpenMode.value ? (realname.value?.id_card_no ?? '') : ''
    settleForm.tel_no = settleOpenMode.value ? (realname.value?.mobile ?? '') : ''
  }

  /**
   * 重新拉取结算账户读数；失败时置空，让界面退化为「未绑定」而不是继续显示旧账户。
   * 这里不把失败原因抛给用户：入口卡与 hero 都会各自读到「未绑定」，多弹一个错误只是噪音。
   */
  async function refreshAdapayMember() {
    if (!auth.token) return
    try {
      adapayMember.value = await getMyAdapayMember(auth.token)
    } catch {
      adapayMember.value = null
    }
  }

  /** 拉取脱敏明细并回填能提交出去的字段（开户行）；卡号只有后四位，仍需用户重填。 */
  async function loadSettleSnapshot() {
    settleSnapshot.value = null
    if (!auth.token || !settleBound.value) return
    try {
      const snapshot = await getMySettlementAccountSnapshot(auth.token)
      settleSnapshot.value = snapshot
      if (snapshot?.bound) {
        settleForm.bank_acct_type = snapshot.memberType === 'enterprise' ? '1' : '2'
        // 契约只回开户行名称，表单按编码取名称，所以这里把名称折回编码再回填
        settleForm.bank_code = findBankCodeByName(snapshot.bankName ?? '')
      }
    } catch {
      // 拿不到明细不影响换绑：表单已按实名主体给了默认账户类型，用户自己填即可
      settleSnapshot.value = null
    }
  }

  /** 卡号输入框的提示：自动开户填完整卡号；已绑账户时显示后端给的后四位。 */
  const settleCardPlaceholder = computed(() => {
    if (settleOpenMode.value) return '请输入收款银行卡号'
    if (!settleBound.value) return '请输入收款银行卡号后四位'
    const tail = (settleSnapshot.value?.accountNoTail ?? '').trim()
    return tail ? `当前尾号 ${tail}（更换请重填后四位）` : '请输入收款银行卡号后四位'
  })

  /** 打开弹窗即进入表单：已绑账户时回填脱敏明细，未绑时按实名主体给默认值。 */
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

  /** 收款户名：优先用已绑账户上的户名，其次取实名主体（企业用公司名，个人用姓名）。 */
  const settlementAccountName = computed(
    () =>
      settleSnapshot.value?.accountName ??
      realname.value?.company_name ??
      realname.value?.real_name ??
      '',
  )

  /** 提交绑定 / 更换：自动开户走完整资料，企业人工通道与已绑改绑走原契约字段。 */
  async function saveSettleAccount() {
    if (!auth.token || settleSaving.value) return
    // 提交前定一次语义：更换会先解绑旧账户，失败时界面要按真实状态回落
    const changing = settleBound.value
    const opening = settleOpenMode.value
    // 校验与请求分开：校验失败的提示是「请检查银行卡信息」，请求失败要带渠道原话
    let start: () => Promise<AdapayMemberStatus>
    try {
      if (changing) {
        const payload = prepareSettlementAccount(settleForm, settlementAccountName.value)
        start = () => changeMyAdapaySettlementAccount(auth.token, payload)
      } else if (opening) {
        const payload = prepareSettlementOpen(settleForm, settlementAccountName.value)
        start = () => openMyAdapaySettlementAccount(auth.token, payload)
      } else {
        const payload = prepareSettlementAccount(settleForm, settlementAccountName.value)
        start = () => createMyAdapaySettlementAccount(auth.token, payload)
      }
    } catch (err) {
      TMessage.warning(err instanceof Error ? err.message : '请检查银行卡信息')
      return
    }
    settleSaving.value = true
    try {
      const member = await start()
      adapayMember.value = member
      TMessage.success(
        changing
          ? '收款银行卡已更换'
          : opening
            ? member.acceptsSettlement
              ? '收款银行卡已绑定'
              : '开户资料已提交，等待渠道审核'
            : '结算账户已设置',
      )
      settleDialogVisible.value = false
      resetSettleForm()
      settleSnapshot.value = null
    } catch (err) {
      TMessage.error(
        err instanceof Error ? err.message : changing ? '更换收款银行卡失败' : '设置结算账户失败',
      )
      // 开户失败会落一条 failed 记录；刷新后按真实状态展示并带出渠道原话
      if (changing || opening) {
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
    ...labels,
    settleDialogVisible,
    settleSaving,
    settleLoading,
    settleForm,
    settleOpenMode,
    settleCities,
    settleCardPlaceholder,
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

<script setup lang="ts">
/**
 * 账号与安全页（文件名沿用历史的 `AccountCouponsView`，优惠券业务早已迁走）：一屏 hero、
 * 两张入口卡与十几个弹窗的**编排层**。
 *
 * 收到这里只剩接线：各业务域的 composable 实例化与互相注入、七步 `onMounted`、三条跨域 watch、
 * 模板挂点。入口行怎么拼在 `shared/accountEntryRows.ts`、点击分发在 `useAccountEntryGroups`、
 * 三个登录凭证弹窗在 `useAccountSecuritySettings`、两步验证在 `useAccountTwoFactorSettings`、
 * 第三方绑定在 `useAccountProviderBinding`，实名四件套与结算各有自己的域。
 *
 * 两条耦合点**必须留在这里**：
 * - `watch(realnameDialogVisible)`：关弹窗即丢弃变更草稿（草稿的生命周期归视图）；
 * - `watch(faceidAuthUrl)`：二维码出现 / 消失要连带开关实名弹窗（两个弹窗互斥）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { closeAccount } from '@/api/auth'
import { createSealMakeOnline, getMySeals, type MySealsData } from '@/api/asignAccount'
import { useAuthStore } from '@/stores/auth'
import RealnameHero from '@/components/RealnameHero.vue'
import WechatBindQrModal from '@/components/WechatBindQrModal.vue'
import AccountEntryGrid from '@/components/account/AccountEntryGrid.vue'
import AsignDialog from '@/components/account/AsignDialog.vue'
import CloseAccountDialog from '@/components/account/CloseAccountDialog.vue'
import CloseSettleDialog from '@/components/account/CloseSettleDialog.vue'
import EmailDialog from '@/components/account/EmailDialog.vue'
import FaceidDialog from '@/components/account/FaceidDialog.vue'
import PasswordDialog from '@/components/account/PasswordDialog.vue'
import RealnameDialog from '@/components/account/RealnameDialog.vue'
import SealDialog from '@/components/account/SealDialog.vue'
import SettlementDialog from '@/components/account/SettlementDialog.vue'
import TwoFactorDialog from '@/components/account/TwoFactorDialog.vue'
import UsernameDialog from '@/components/account/UsernameDialog.vue'
import { useAccountEntryGroups } from '@/composables/useAccountEntryGroups'
import { useAccountProviderBinding } from '@/composables/useAccountProviderBinding'
import { useAccountSecuritySettings } from '@/composables/useAccountSecuritySettings'
import { useAccountTwoFactorSettings } from '@/composables/useAccountTwoFactorSettings'
import { useAsignAccount } from '@/composables/useAsignAccount'
import { useFaceidChallenge } from '@/composables/useFaceidChallenge'
import { useLegalCertPeriod } from '@/composables/useLegalCertPeriod'
import { useRealnameFormDraft } from '@/composables/useRealnameFormDraft'
import { useRealnameIdentity } from '@/composables/useRealnameIdentity'
import { useRealnameMaterials } from '@/composables/useRealnameMaterials'
import { useRealnameSubmit } from '@/composables/useRealnameSubmit'
import { useSettlementAccount, type AdapayMemberStatus } from '@/composables/useSettlementAccount'
import { TCard, TMessage } from 'ui_73info'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const realnameDialogVisible = ref(false)
const adapayMember = ref<AdapayMemberStatus | null>(null)
/** 核身弹窗的可见性归视图：`faceidAuthUrl` 一变要连带关掉实名弹窗（见下方那条 watch）。 */
const faceidDialogVisible = ref(false)

const isMobile = ref(false)
let mobileMatch: MediaQueryList | null = null
function syncMobileViewport() {
  isMobile.value = Boolean(mobileMatch?.matches)
}

// ── 实名认证：身份域与表单草稿域 ─────────────────────────────────
/**
 * 两个域的分工见各自文件头，这里只做接线：
 * - `form` 是**一整块**草稿（22 个字段 + 法人证件有效期「动过没」的标记），不按字段拆；
 * - `current` 由 `useRealnameIdentity` 持有，下面注入给核身与结算两个域，全页只此一份——
 *   各请求一次的话 hero / 入口卡 / 结算会各看各的；
 * - 「变更主体」要同时动身份的状态、草稿的字段与两个弹窗的可见性，所以留在这里当接线函数。
 */
const {
  form,
  legalCertPeriodEdited,
  identityCardSelected,
  enterpriseSelected,
  soleProprietorSelected,
  businessSelected,
  isUnder14,
  isMinor14To18,
  isAdult,
  identityCardRequiredMissing,
  businessLicenseDerivedMissing,
  enterpriseRequiredMissing,
  minorGuardianRequiredMissing,
  businessLicenseDerivedNote,
  resetSubjectFields,
  prefill: prefillForm,
  applyOperatorPrefill,
  validate,
  buildPayload,
} = useRealnameFormDraft()

const {
  current,
  redirectTarget,
  statusText,
  statusTone,
  realnameApproved,
  realnameRejected,
  realnamePending,
  realnameChanging,
  realnameLocked,
  realnameChangeBacked,
  realnameCanWithdraw,
  assignEnterprise,
  realnameEntryCopy,
  applyRealnameRecord,
  clearCurrent,
  tryRestoreBusinessPage,
  loadCurrentRealname,
  startChangeMode,
  exitChangeMode,
} = useRealnameIdentity({ prefillForm })

// ── 实名材料域与法人证件有效期域 ────────────────────────────────
/**
 * 两个域共用一个 `form`（草稿正本在 `useRealnameFormDraft`）：
 * - 材料域管三张证照 + 同意书的上传与营业执照 OCR，四个上传行只把选好的 `File` 交过来；
 * - 有效期域管起止两项的「用户动过」标记、长期有效捷径与证件照 OCR 回填。
 *
 * 注入顺序就是**异步链的时序**：证件照上传成功 → 材料域写 `form.legalCertFrontFile` /
 * `legalCertBackFile` → 再调 `autoFillLegalCertPeriod()`（它按 side 取已落库的照片）。
 * 标记 `legalCertPeriodEdited` 由草稿域持有（换主体 / 记录落地都要连它一起清），这里只传同一份。
 */
const {
  legalCertOcrLoading,
  markLegalCertBeginEdited,
  markLegalCertExpiresEdited,
  applyLongTermLegalCert,
  autoFillLegalCertPeriod,
} = useLegalCertPeriod({ form, edited: legalCertPeriodEdited, locked: realnameLocked })

const {
  consentUploading,
  businessLicenseUploading,
  businessLicenseOcrLoading,
  legalCertFrontUploading,
  legalCertBackUploading,
  handleBusinessLicenseFile,
  handleLegalCertFrontFile,
  handleLegalCertBackFile,
  handleConsentFile,
} = useRealnameMaterials({ form, autoFillLegalCertPeriod })

/// 提交按钮为什么是灰的：只读态、各主体的必填、年龄禁区，少一条都会让用户点了没反应。
const submitDisabled = computed(
  () =>
    realnameLocked.value ||
    identityCardRequiredMissing.value ||
    enterpriseRequiredMissing.value ||
    isUnder14.value ||
    minorGuardianRequiredMissing.value,
)

const idCardPlaceholder = computed(() => {
  const masked = current.value?.id_card_no_masked
  return masked ? `${masked}` : '请输入证件号'
})

const submitButtonText = computed(() => {
  if (realnameChanging.value) return '提交变更，重新认证'
  if (realnameApproved.value) return '已通过认证'
  if (realnameLocked.value && identityCardSelected.value) return '认证处理中'
  if (identityCardSelected.value) return current.value ? '重新发起实名认证' : '实名认证'
  if (!current.value || realnameRejected.value) return current.value ? '重新提交认证' : '提交认证'
  return '已提交，不能修改'
})

/// 切到企业 / 个体户时带上本人经办人信息（只在字段为空时补）。
/// 这条 watch 读实名记录、写表单草稿，跨了两个域，所以留在视图而不是让任一边持有另一边的实例。
watch(
  () => form.authType,
  (next, previous) => {
    if (next !== previous) applyOperatorPrefill(current.value)
  },
)

/// 进入「变更认证类型」：解锁表单并用空表单让用户填新主体，提交后由后端快照原主体，
/// 认证通过前可撤回（撤回即取消变更、还原原来那份主体）。
function startRealnameChange() {
  startChangeMode()
  resetSubjectFields()
  applyOperatorPrefill(current.value)
  faceidDialogVisible.value = false
  realnameDialogVisible.value = true
}

/// 放弃「变更认证类型」草稿：什么都没提交，直接回到只读状态。
function cancelRealnameChange() {
  exitChangeMode()
  if (current.value) {
    prefillForm(current.value)
  }
  realnameDialogVisible.value = false
}

// ── 人脸核身（challenge）域 ──────────────────────────────────
/**
 * 启停、轮询、查询、恢复、撤回都在 `useFaceidChallenge` 里（定时器绑 `onScopeDispose`）。
 * 这里只注入视图才有的东西：实名记录、记录落地（含表单回填）与两个弹窗的可见性。
 * 「发起认证」在下面的 `useRealnameSubmit`：它要读表单、校验与载荷，是提交实名那条线。
 */
const {
  faceidAuthUrl,
  faceidQrDataUrl,
  faceidStarting,
  faceidChecking,
  faceidRestoring,
  withdrawing,
  beginChallenge,
  checkWechatFaceidResult,
  openWechatFaceidPage,
  restoreFaceidChallengeIfNeeded,
  handleWithdraw,
} = useFaceidChallenge({
  realname: current,
  applyRecord: (record) => applyRealnameRecord(record),
  clearRecord: () => {
    clearCurrent()
    // 重置表单回到「未提交」的可编辑状态
    form.authType = 'IDENTITY_CARD'
    resetSubjectFields()
  },
  formAuthType: () => form.authType,
  restoreBusinessPage: (record) => tryRestoreBusinessPage(record),
  afterWithdraw: () => {
    faceidDialogVisible.value = false
    realnameDialogVisible.value = true
  },
})

// ── 提交实名认证域 ──────────────────────────────────────────
/**
 * 三个提交口（个人核身 / 企业认证 / 个体工商户直接提交）与共用的加载位都在 `useRealnameSubmit`。
 * 之所以单独成域：视图里只要还剩一次 `@/api/realname` 调用，`api-deps` 那 4 个模块就降不到 3。
 * 分流顺序（个人 → 企业 → 直接提交）在那边逐字保留，视图只把草稿、身份与核身三块注入进去。
 */
const { submitting, submitRealname } = useRealnameSubmit({
  form,
  validate,
  buildPayload,
  identityCardSelected,
  enterpriseSelected,
  isMinor14To18,
  approved: realnameApproved,
  rejected: realnameRejected,
  locked: realnameLocked,
  changing: realnameChanging,
  applyRecord: (record) => applyRealnameRecord(record),
  beginChallenge,
  restoreBusinessPage: (record) => tryRestoreBusinessPage(record),
  faceidStarting,
})

/**
 * 核身二维码出现时自动弹出核身弹窗，并收起「提交认证信息」弹窗，避免双弹窗叠放。
 *
 * 只做可见性——**两个弹窗互相关闭这件事必须留在视图**：`realnameDialogVisible` 是表单草稿的
 * 生命周期开关（关掉就丢弃变更草稿），不能让 composable 或子组件去改它。
 * 轮询由 composable 自己盯着 `faceidAuthUrl` 起停，与这里无关。
 */
watch(faceidAuthUrl, (url) => {
  if (url) {
    faceidDialogVisible.value = true
    realnameDialogVisible.value = false
    return
  }
  faceidDialogVisible.value = false
})

// 关掉「提交认证信息」弹窗即放弃变更草稿：没提交过的变更，下次打开不该还是解锁态。
watch(realnameDialogVisible, (visible) => {
  if (!visible) {
    exitChangeMode()
    return
  }
  // 表单打开、本地已存有证件照时补一次识别（上传那次的识别可能失败过，重开弹窗即重试）。
  // 静默：不再重复弹「未能识别」——这条提示在上传后已经给过一次了。
  void autoFillLegalCertPeriod({ silent: true })
})

/// 审核中继续人脸核身：先找回刷新后丢失的爱签核身链接，再打开核身弹窗。
async function continueFaceid() {
  if (!faceidAuthUrl.value) {
    await restoreFaceidChallengeIfNeeded()
  }
  if (!faceidAuthUrl.value) {
    TMessage.warning('暂时拿不到人脸核身链接，可撤回本次认证后重新提交')
    return
  }
  faceidDialogVisible.value = true
}

// ── 爱签账户维护域（修改手机号 / 法人 / 企业信息 / 姓名） ──────────────
/**
 * 四份草稿、五个加载位与五条动作都在 `useAsignAccount`，这里只接线：入口行的
 * `mobile` / `legalPerson` / `company` / `personal` 与印章弹窗的「修改企业信息」共用一个开关。
 */
const {
  asign,
  asignLoading,
  asignDialogVisible,
  asignDialogKind,
  openAsignDialog,
  openMobileDialog,
  handleSendVerifyCode,
  handleModifyMobileByCode,
  handleModifyLegalPerson,
  handleModifyCompanyInfo,
  handleModifyUserName,
} = useAsignAccount()

// ── 企业印章管理 ────────────────────────────────────────────
/**
 * 印章列表**按需加载**：点开弹窗才查爱签，不在账号页加载时预取。
 * 账号页每次进来都会打一串接口，再多一次爱签查询只为渲染一句「已生成 / 待生成」不值当；
 * 状态胶囊因此也不做，入口行与「修改法人」等同组行一致，只有图标 + 主标题 + 副说明。
 */
const sealDialogVisible = ref(false)
const sealLoading = ref(false)
const sealError = ref('')
const sealData = ref<MySealsData | null>(null)
const sealMakeLoading = ref(false)

function openSealDialog() {
  sealDialogVisible.value = true
  sealData.value = null
  sealError.value = ''
  void loadMySeals()
}

async function loadMySeals() {
  if (!requireToken()) return
  sealLoading.value = true
  sealError.value = ''
  try {
    const res = await getMySeals(auth.token)
    if (res.success) {
      sealData.value = res.data ?? null
    } else {
      sealError.value = '暂时查不到企业印章，请稍后重试'
    }
  } catch (err) {
    sealError.value = err instanceof Error ? err.message : '查询企业印章失败'
  } finally {
    sealLoading.value = false
  }
}

/// 在线制作新印章：后端只生成爱签制章链接，真正制章由用户在爱签页面完成。
/// 不传 sealNo，新增印章不会覆盖企业现有印章；制章完成后回本页刷新即可看到。
async function handleSealMakeOnline() {
  if (!requireToken()) return
  sealMakeLoading.value = true
  try {
    const res = await createSealMakeOnline(auth.token, {})
    const url = res.data?.trim()
    if (res.success && url) {
      window.open(url, '_blank', 'noopener,noreferrer')
      TMessage.success('已打开爱签制章页面，完成后回本页刷新查看')
    } else {
      TMessage.warning('暂时拿不到制章链接，请稍后重试')
    }
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '生成制章链接失败')
  } finally {
    sealMakeLoading.value = false
  }
}

/// 从印章管理切到「修改企业信息」（改名会自动重新生成印章），两个入口语义相邻。
function openCompanyFromSeal() {
  sealDialogVisible.value = false
  openAsignDialog('company')
}

// ── Adapay 结算账户（状态与动作都在 composable 里，这里只接线） ──────────
/**
 * `current`（实名记录）与 `adapayMember`（渠道会员）是跨 hero / 入口卡 / 结算 / onMounted
 * 四块共用的状态，注入进 composable；`isEnterpriseSubject` 复用这里那份 `assignEnterprise`，
 * 同一个判断不在两处各算一遍。
 */
const {
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
} = useSettlementAccount({
  realname: current,
  adapayMember,
  isEnterpriseSubject: () => assignEnterprise.value,
})

/** 缺企业资料时不去重绑：关掉结算弹窗、打开实名表单让用户补企业进件资料。 */
function goFixSettleMaterial() {
  settleDialogVisible.value = false
  realnameDialogVisible.value = true
  startRealnameChange()
}

/** 登录态守卫：印章管理的两条动作要用（与 `useAsignAccount` 里那份同一段提示）。 */
function requireToken(): boolean {
  auth.hydrate()
  if (!auth.token.trim()) {
    TMessage.error('登录状态已失效，请重新登录')
    return false
  }
  return true
}

// ── 注销账号（可见性 / 确认词归视图：破坏性动作，与结算账户的注销不是一个域） ──
const accountCloseDialogVisible = ref(false)
const accountCloseConfirmation = ref('')
const accountClosing = ref(false)

/** 确认词必须原样键入「注销账号」，「确认注销」才点得动。 */
const accountCloseReady = computed(() => accountCloseConfirmation.value.trim() === '注销账号')

function openAccountCloseDialog() {
  accountCloseConfirmation.value = ''
  accountCloseDialogVisible.value = true
}

async function handleCloseAccount() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后注销账号')
    return
  }
  if (!accountCloseReady.value) {
    TMessage.warning('请输入“注销账号”确认操作')
    return
  }

  accountClosing.value = true
  try {
    await closeAccount(auth.token)
    accountCloseDialogVisible.value = false
    auth.logout()
    TMessage.success('账号已注销，第三方绑定已释放')
    await router.replace({ name: 'home' })
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '注销账号失败')
  } finally {
    accountClosing.value = false
  }
}

// ── 第三方绑定域（微信 / GitHub / Gitee / QQ） ─────────────────────
/**
 * 已绑渠道、微信二维码与四条动作都在 `useAccountProviderBinding` 里；它自己要读回跳 query，
 * 所以 `route` / `router` 也一起搬过去了。`wechatBound` 的初值走下面安全设置域的 `loadProfile`。
 */
const {
  wechatBound,
  boundProviders,
  wechatBindingLoading,
  providerBindingLoading,
  wechatBindQr,
  loadBoundProviders,
  handleProviderBinding,
  toggleWechatBinding,
  closeWechatBindQr,
  handleWechatBound,
  consumeWechatBindResult,
  consumeProviderBindResult,
} = useAccountProviderBinding()

// ── 安全设置域（三个登录凭证弹窗 + profile 初值） ─────────────────────
/**
 * `profileEmail` 的正本放视图：安全设置域**写**它（loadProfile / 改邮箱），两步验证域**读**它
 * （`email-bound` 与弹窗文案），两个域都不该各存一份。
 */
const profileEmail = ref('')
const {
  twoFactorEnabled,
  twoFactorTargetEnabled,
  twoFactorCode,
  twoFactorCodeSending,
  twoFactorLoading,
  twoFactorDialogVisible,
  accountEmailLabel,
  twoFactorChanged,
  applyTwoFactor,
  sendTwoFactorVerificationCode,
  handleTwoFactorTargetChange,
  submitTwoFactorChange,
} = useAccountTwoFactorSettings({ profileEmail })

const {
  newUsername,
  usernameLoading,
  newEmail,
  emailCode,
  emailCodeSending,
  emailLoading,
  newPassword,
  confirmPassword,
  passwordCode,
  passwordCodeSending,
  passwordLoading,
  emailDialogVisible,
  passwordDialogVisible,
  usernameDialogVisible,
  loadProfile,
  updateUsername,
  sendEmailVerificationCode,
  submitEmailChange,
  sendPasswordVerificationCode,
  submitPasswordChange,
} = useAccountSecuritySettings({
  profileEmail,
  // loadProfile 读到的两个「别人家的」状态，交给各自的域
  applyWechatBound: (bound) => {
    wechatBound.value = bound
  },
  applyTwoFactor,
})

// ── 账户入口域：两张卡的「行」与点击分发 ─────────────────────────────
/**
 * 入口行要读实名 / 核身 / 结算 / 安全设置四个域，所以这里一次注入完；动作表只传回调，
 * 弹窗可见性仍由视图（和各弹窗的域）持有。
 * `openAccountEntry` 仍从 `setupState()` 上取得到——三个 spec 的 `openEntry()` 靠它点入口。
 */
const { realnameEntryGroups, accountEntryGroups, openAccountEntry } = useAccountEntryGroups({
  identity: {
    copy: realnameEntryCopy,
    statusText,
    statusTone,
    pending: realnamePending,
    approved: realnameApproved,
    canWithdraw: realnameCanWithdraw,
    changeBacked: realnameChangeBacked,
    enterprise: assignEnterprise,
  },
  faceid: {
    restoring: faceidRestoring,
    withdrawing,
  },
  settle: {
    stage: settleStage,
    underReview: settleUnderReview,
    underReviewText: settleUnderReviewText,
    subjectMismatch: settleSubjectMismatch,
    materialMissing: settleMaterialMissing,
    materialMissingText: settleMaterialMissingText,
    accountWord: settleAccountWord,
    providerError: settleProviderError,
    corporateLocked: settleCorporateLocked,
    bound: settleBound,
  },
  security: {
    profileEmail,
    twoFactorEnabled,
    wechatBound,
    wechatBindingLoading,
    providerBindingLoading,
    boundProviders,
  },
  actions: {
    openRealnameDialog: () => {
      realnameDialogVisible.value = true
    },
    continueFaceid,
    withdrawRealname: handleWithdraw,
    startRealnameChange,
    openSettleDialog,
    openCloseSettleDialog,
    openMobileDialog,
    openAsignDialog,
    openSealDialog,
    openEmailDialog: () => {
      emailDialogVisible.value = true
    },
    openPasswordDialog: () => {
      passwordDialogVisible.value = true
    },
    openUsernameDialog: () => {
      usernameDialogVisible.value = true
    },
    openTwoFactorDialog: () => {
      twoFactorDialogVisible.value = true
    },
    openAccountCloseDialog,
    toggleWechatBinding,
    toggleProviderBinding: handleProviderBinding,
  },
})

onMounted(async () => {
  auth.hydrate()
  newUsername.value = auth.username
  consumeWechatBindResult()
  consumeProviderBindResult()
  await loadProfile()
  await loadBoundProviders()

  mobileMatch = window.matchMedia('(max-width: 720px)')
  syncMobileViewport()
  mobileMatch.addEventListener('change', syncMobileViewport)

  await loadCurrentRealname()
  if (redirectTarget.value && !realnameApproved.value) {
    realnameDialogVisible.value = true
  }
  // 会员状态走 composable 里那份刷新（失败置空，界面退化为「未绑定」）
  await refreshAdapayMember()
  // 钱包页的「去绑定收款银行卡」入口：带 settle=1 直接打开结算账户弹窗
  if (route.query.settle === '1') {
    void openSettleDialog()
    const nextQuery = { ...route.query }
    delete nextQuery.settle
    void router.replace({ query: nextQuery })
  }
  // 只有「处理中」才需要问结果：流水号由后端从库里取，前端不再持有任何渠道凭证。
  // 已通过 / 已驳回时不必再打这个接口——它是一次「回查」，每次打开账户页都往渠道跑一趟
  // 没有意义（该端点在历史版本里会连带重放「实名通过」的副作用，把企业开户一遍遍送审）。
  if (!current.value || current.value.status === 'pending') {
    await checkWechatFaceidResult({ silent: true })
  }
  // 刷新后尝试恢复丢失的爱签二维码（若仍未完成人脸核身）
  await restoreFaceidChallengeIfNeeded()
})

onBeforeUnmount(() => {
  mobileMatch?.removeEventListener('change', syncMobileViewport)
  mobileMatch = null
  // 人脸轮询的定时器由 `useFaceidChallenge` 绑在 onScopeDispose 上，这里不用管
})
</script>

<template>
  <main class="page-shell custom-page-shell profile-page account-coupons-page">
    <div class="account-realname-hero">
      <RealnameHero :verification="current" :adapay-member="adapayMember" />
    </div>

    <section class="wallet-section account-settings-section">
      <div class="realname-form__head">
        <h3>账号与安全</h3>
      </div>
      <AccountEntryGrid :groups="accountEntryGroups" @open="openAccountEntry" />
    </section>

    <section id="account-realname" class="account-realname-section">
      <div class="realname-page-shell">
        <!-- 实名表单弹窗：模板与样式都在组件里，这里只做接线（可见性、草稿、各加载位、七个动作） -->
        <RealnameDialog
          v-model:open="realnameDialogVisible"
          :form="form"
          :locked="realnameLocked"
          :changing="realnameChanging"
          :change-in-review="realnamePending && realnameChangeBacked"
          :can-withdraw="realnameCanWithdraw"
          :change-backed="realnameChangeBacked"
          :withdrawing="withdrawing"
          :submitting="submitting"
          :faceid-starting="faceidStarting"
          :submit-disabled="submitDisabled"
          :submit-text="submitButtonText"
          :id-card-placeholder="idCardPlaceholder"
          :mobile-masked="current?.mobile_masked ?? ''"
          :identity-card-selected="identityCardSelected"
          :business-selected="businessSelected"
          :sole-proprietor-selected="soleProprietorSelected"
          :is-under14="isUnder14"
          :is-minor14-to18="isMinor14To18"
          :is-adult="isAdult"
          :derived-note="businessLicenseDerivedNote"
          :derived-missing="businessLicenseDerivedMissing.length > 0"
          :business-license-uploading="businessLicenseUploading"
          :license-ocr-loading="businessLicenseOcrLoading"
          :legal-cert-front-uploading="legalCertFrontUploading"
          :legal-cert-back-uploading="legalCertBackUploading"
          :legal-cert-ocr-loading="legalCertOcrLoading"
          :consent-uploading="consentUploading"
          @submit="submitRealname"
          @cancel-change="cancelRealnameChange"
          @withdraw="handleWithdraw"
          @business-license-picked="handleBusinessLicenseFile"
          @legal-cert-front-picked="handleLegalCertFrontFile"
          @legal-cert-back-picked="handleLegalCertBackFile"
          @consent-picked="handleConsentFile"
          @mark-begin-edited="markLegalCertBeginEdited"
          @mark-expires-edited="markLegalCertExpiresEdited"
          @long-term="applyLongTermLegalCert"
        />

        <TCard class="realname-card asign-account-card">
          <div class="realname-form__head">
            <h3>认证管理</h3>
          </div>
          <AccountEntryGrid :groups="realnameEntryGroups" @open="openAccountEntry" />
        </TCard>

        <!-- 收款银行卡：渠道原话 / 主体变更与缺资料提示 + 银行卡表单，模板与样式都在组件里 -->
        <SettlementDialog
          v-model:visible="settleDialogVisible"
          :loading="settleLoading"
          :saving="settleSaving"
          :bound="settleBound"
          :corporate-locked="settleCorporateLocked"
          :subject-mismatch="settleSubjectMismatch"
          :subject-label="settleSubjectLabel"
          :material-missing="settleMaterialMissing"
          :material-missing-text="settleMaterialMissingText"
          :provider-error="settleProviderError"
          :rejected="settleRejected"
          :card-placeholder="settleCardPlaceholder"
          :card-id="settleForm.card_id"
          :bank-code="settleForm.bank_code"
          :prov-code="settleForm.prov_code"
          :area-code="settleForm.area_code"
          :bank-acct-type="settleForm.bank_acct_type"
          :cities="settleCities"
          @update:card-id="settleForm.card_id = $event"
          @update:bank-code="settleForm.bank_code = $event"
          @update:prov-code="setSettleProvince"
          @update:area-code="settleForm.area_code = $event"
          @update:bank-acct-type="settleForm.bank_acct_type = $event"
          @submit="saveSettleAccount"
          @cancel="closeSettleDialog"
          @fix-material="goFixSettleMaterial"
        />

        <CloseSettleDialog
          v-model:visible="closeSettleDialogVisible"
          :confirmation="closeSettleConfirmation"
          :ready="closeSettleReady"
          :saving="closeSettleLoading"
          @update:value="closeSettleConfirmation = $event"
          @submit="handleCloseSettleAccount"
        />

        <!-- 人脸核身：二维码 / 三步指引 / 三个动作，模板与样式都在组件里；
             可见性仍由本页持有（它还要连带关掉实名弹窗） -->
        <FaceidDialog
          v-model:visible="faceidDialogVisible"
          :enterprise="enterpriseSelected"
          :mobile="isMobile"
          :qr-data-url="faceidQrDataUrl"
          :checking="faceidChecking"
          :withdrawing="withdrawing"
          :change-backed="realnameChangeBacked"
          @withdraw="handleWithdraw"
          @open-page="openWechatFaceidPage"
          @check="checkWechatFaceidResult()"
        />

        <AsignDialog
          v-model:visible="asignDialogVisible"
          :kind="asignDialogKind"
          :mobile="asign.mobileByCode.mobile"
          :code="asign.mobileByCode.code"
          :legal-person-name="asign.legalPerson.name"
          :legal-person-id-card="asign.legalPerson.idCard"
          :company-name="asign.company.companyName"
          :company-legal-name="asign.company.legalName"
          :company-legal-id-card="asign.company.legalIdCard"
          :personal-name="asign.personal.personalName"
          :personal-mobile="asign.personal.mobile"
          :loading="asignLoading"
          :mobile-masked="current?.mobile_masked ?? ''"
          @update:mobile="asign.mobileByCode.mobile = $event"
          @update:code="asign.mobileByCode.code = $event"
          @update:legal-person-name="asign.legalPerson.name = $event"
          @update:legal-person-id-card="asign.legalPerson.idCard = $event"
          @update:company-name="asign.company.companyName = $event"
          @update:company-legal-name="asign.company.legalName = $event"
          @update:company-legal-id-card="asign.company.legalIdCard = $event"
          @update:personal-name="asign.personal.personalName = $event"
          @update:personal-mobile="asign.personal.mobile = $event"
          @send-code="handleSendVerifyCode"
          @modify-mobile="handleModifyMobileByCode"
          @modify-legal-person="handleModifyLegalPerson"
          @modify-company="handleModifyCompanyInfo"
          @modify-user-name="handleModifyUserName"
        />

        <!-- 印章管理：企业电子印章由爱签生成，用于合同盖章；只读展示 + 在线制章链接 -->
        <SealDialog
          v-model:visible="sealDialogVisible"
          :loading="sealLoading"
          :error="sealError"
          :data="sealData"
          :making="sealMakeLoading"
          @reload="loadMySeals"
          @make-online="handleSealMakeOnline"
          @open-company="openCompanyFromSeal"
        />
      </div>
    </section>

    <EmailDialog
      v-model:visible="emailDialogVisible"
      :initial-email="newEmail"
      :initial-code="emailCode"
      :saving="emailLoading"
      :code-sending="emailCodeSending"
      @update:email="newEmail = $event"
      @update:code="emailCode = $event"
      @send-code="sendEmailVerificationCode"
      @submit="submitEmailChange"
    />

    <PasswordDialog
      v-model:visible="passwordDialogVisible"
      :initial-password="newPassword"
      :initial-confirm="confirmPassword"
      :initial-code="passwordCode"
      :saving="passwordLoading"
      :code-sending="passwordCodeSending"
      :email-bound="Boolean(profileEmail)"
      @update:password="newPassword = $event"
      @update:confirm="confirmPassword = $event"
      @update:code="passwordCode = $event"
      @send-code="sendPasswordVerificationCode"
      @submit="submitPasswordChange"
    />

    <UsernameDialog
      v-model:visible="usernameDialogVisible"
      :initial="newUsername"
      :saving="usernameLoading"
      @update:value="newUsername = $event"
      @submit="updateUsername"
    />

    <TwoFactorDialog
      v-model:visible="twoFactorDialogVisible"
      :target-enabled="twoFactorTargetEnabled"
      :code="twoFactorCode"
      :saving="twoFactorLoading"
      :code-sending="twoFactorCodeSending"
      :changed="twoFactorChanged"
      :email-bound="Boolean(profileEmail)"
      :email-label="accountEmailLabel"
      @update:code="twoFactorCode = $event"
      @toggle="handleTwoFactorTargetChange"
      @send-code="sendTwoFactorVerificationCode"
      @submit="submitTwoFactorChange"
    />

    <CloseAccountDialog
      v-model:visible="accountCloseDialogVisible"
      :confirmation="accountCloseConfirmation"
      :ready="accountCloseReady"
      :saving="accountClosing"
      @update:value="accountCloseConfirmation = $event"
      @submit="handleCloseAccount"
    />

    <WechatBindQrModal
      :visible="wechatBindQr.visible"
      :url="wechatBindQr.url"
      :state="wechatBindQr.state"
      @close="closeWechatBindQr"
      @bound="handleWechatBound"
    />
  </main>
</template>

<style scoped>
.account-coupons-page {
  min-height: calc(100vh - 185px);
  gap: 16px;
}

.account-realname-hero {
  margin-bottom: 4px;
}

.account-realname-section {
  margin-top: 4px;
}

/* 弹窗样式：九个弹窗已全部搬进 `components/account/`，各自带一份 scoped 样式
   （父级 scoped 对子组件节点不命中，搬出去就必须跟着走）。这里只剩页面本身的样式。
   `.realname-form__head` 例外：它同时被页面上的「账号与安全」「认证管理」两张卡片用。 */

/* 账户实名外壳按内容高度排：末张「认证说明」卡片已移除，右列无需再撑满、
   也不再与左侧工作台菜单对齐底边，避免卡片下方留出成片空白 */
.realname-page-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.realname-form__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.realname-form__head h3 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
}
</style>

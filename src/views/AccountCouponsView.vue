<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  closeAccount,
  getBoundProviders,
  getProviderBindUrl,
  getWechatBindAuthorizeUrl,
  getWechatBindQrUrl,
  unbindProvider,
} from '@/api/auth'
import {
  getProfile,
  sendProfileEmailChangeCode,
  sendProfilePasswordCode,
  sendProfileTwoFactorCode,
  updateProfile,
  updateProfileEmail,
  updateProfilePassword,
  updateProfileTwoFactor,
} from '@/api/settings'
import {
  createSealMakeOnline,
  getMySeals,
  modifyCompanyInfo,
  modifyMobileByCode,
  modifyUserName,
  sendVerifyCode,
  type MySealsData,
} from '@/api/asignAccount'
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
import { useFaceidChallenge } from '@/composables/useFaceidChallenge'
import { useLegalCertPeriod } from '@/composables/useLegalCertPeriod'
import { useRealnameFormDraft } from '@/composables/useRealnameFormDraft'
import { useRealnameIdentity } from '@/composables/useRealnameIdentity'
import { useRealnameMaterials } from '@/composables/useRealnameMaterials'
import { useRealnameSubmit } from '@/composables/useRealnameSubmit'
import { useSettlementAccount, type AdapayMemberStatus } from '@/composables/useSettlementAccount'
import type { AccountEntry, AccountEntryGroup } from '@/shared/accountEntries'
import {
  TCard,
  TMessage,
  Bell,
  CollectionTag,
  Connection,
  CreditCard,
  Iphone,
  Lock,
  Message,
  OfficeBuilding,
  Postcard,
  Promotion,
  RefreshLeft,
  SwitchButton,
  User,
  Warning,
} from 'ui_73info'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const profileLoading = ref(false)
const newUsername = ref('')
const usernameLoading = ref(false)
const profileEmail = ref('')
const newEmail = ref('')
const emailCode = ref('')
const emailCodeSending = ref(false)
const emailLoading = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')
const passwordCode = ref('')
const passwordCodeSending = ref(false)
const passwordLoading = ref(false)
const twoFactorEnabled = ref(false)
const twoFactorTargetEnabled = ref(false)
const twoFactorCode = ref('')
const twoFactorCodeSending = ref(false)
const twoFactorLoading = ref(false)
const wechatBindingLoading = ref(false)
const wechatBound = ref(false)
const boundProviders = ref<string[]>([])
const providerBindingLoading = ref(false)
const accountCloseDialogVisible = ref(false)
const accountCloseConfirmation = ref('')
const accountClosing = ref(false)

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

// ── 账户入口：两张卡片共用同一套「分组 + 行」结构 ────────────────

/// 「认证管理」卡片：实名认证（按认证类型给不同入口） / 收款与结算 两组。
/// 认证类型对应的入口集合见下方 `identity` 的注释。
const realnameEntryGroups = computed<AccountEntryGroup[]>(() => {
  const identity: AccountEntry[] = [
    {
      key: 'realname',
      title: realnameEntryCopy.value.title,
      desc: realnameEntryCopy.value.desc,
      icon: Postcard,
      status: { text: `实名认证：${statusText.value}`, tone: statusTone.value },
    },
  ]
  if (realnamePending.value) {
    identity.push({
      key: 'faceid',
      title: '继续人脸核身',
      desc: '扫码完成人脸核验，也可在这里查询核验结果',
      icon: Promotion,
      loading: faceidRestoring.value,
    })
  }
  if (realnameCanWithdraw.value) {
    identity.push({
      key: 'withdraw',
      title: realnameChangeBacked.value ? '取消变更，还原原主体' : '撤回认证',
      desc: '撤回后可重新填写主体信息',
      icon: RefreshLeft,
      danger: true,
      loading: withdrawing.value,
    })
  }
  // 已通过认证后的可维护入口：按认证类型给不同集合（2026-10-04 起把原「电子签约账户」
  // 那组并进来，避免同一件事分散在两个分组里）
  //   个人：修改手机号、修改个人信息、变更认证类型
  //   企业 / 个体工商户：修改法人、修改手机号、修改企业信息、变更认证类型
  if (realnameApproved.value) {
    if (assignEnterprise.value) {
      identity.push({
        key: 'legalPerson',
        title: '修改法人',
        desc: '变更企业法人姓名与身份证号，需重新核验',
        icon: User,
      })
    }
    identity.push({
      key: 'mobile',
      title: '修改手机号（验证码方式）',
      desc: '接收签署短信的手机号，用短信验证码改绑',
      icon: Iphone,
    })
    identity.push(
      assignEnterprise.value
        ? {
            key: 'company',
            title: '修改企业信息',
            desc: '变更企业名称会自动重新生成印章',
            icon: OfficeBuilding,
          }
        : {
            key: 'personal',
            title: '修改姓名',
            desc: '修正爱签签署侧登记的姓名，需过一次三要素核验',
            icon: User,
          },
    )
    // 印章是企业主体在爱签侧的用章对象（个人主体没有企业印章），
    // 所以只在企业 / 个体工商户主体下出现，放在语义最近的「修改企业信息」之后。
    if (assignEnterprise.value) {
      identity.push({
        key: 'seal',
        title: '印章管理',
        desc: '查看企业电子印章，可在线制作新印章',
        icon: CollectionTag,
      })
    }
    identity.push({
      key: 'changeSubject',
      title: '变更认证类型',
      desc: '个人 / 企业 / 个体工商户之间切换，需重新认证',
      icon: SwitchButton,
    })
  }

  const settle: AccountEntry[] = [
    {
      key: 'settle',
      title: '结算账户',
      desc:
        settleStage.value === 'reviewing'
          ? settleUnderReviewText.value
          : settleStage.value === 'failed'
            ? `渠道已拒绝开通收款账户，点进去看原因并按提示整改`
            : settleSubjectMismatch.value
              ? settleMaterialMissing.value
                ? `实名资料缺${settleMaterialMissingText.value}，补齐后才能重新绑定收款账户`
                : '实名主体已变更，原银行卡需按新主体重新绑定'
              : settleStage.value === 'bound'
                ? '收款银行卡已绑定，可查看或更换'
                : settleStage.value === 'ready'
                  ? `认证已完成，绑定${settleAccountWord.value}后即可收取合同款`
                  : realnameApproved.value
                    ? settleProviderError.value
                      ? '收款账户开通失败，点进去看渠道给的原因并补齐资料'
                      : '正在自动开通收款账户，稍后刷新查看'
                    : '完成实名认证后会自动开通收款账户',
      icon: CreditCard,
      // 渠道会员还在审核时**不放开入口**：这时候点进去也绑不上，
      // 只会撞渠道的 member_not_exists，徒增一次失败与一次限流。
      locked: settleUnderReview.value,
      // 标签按 settleStage 的四态如实写：已绑卡才是「已设置」，会员还在渠道那边写审核中，
      // 会员好了但没绑卡写「待绑卡」（差的是用户那一步），连会员都还没建写「待认证」。
      // 不这么分的话，「未设置」会把「系统还没办完」和「用户还没绑卡」混成一句，
      // 用户不知道自己该等还是该动手。
      // （历史口径：更早是「收款认证：已认证」，读的是渠道会员状态，未绑卡也显示绿色，
      //   会把人误导成「已能收款」，2026-10-04 改回绑卡口径。）
      status:
        settleStage.value === 'reviewing'
          ? { text: '收款账户：渠道审核中', tone: 'warning' }
          : settleStage.value === 'failed'
            ? {
                text: settleCorporateLocked.value
                  ? '收款账户：渠道审核未通过'
                  : '收款账户：开通被拒',
                tone: 'danger',
              }
            : settleSubjectMismatch.value
              ? { text: '收款账户：待重绑', tone: 'warning' }
              : settleStage.value === 'bound'
                ? { text: '结算账户：已设置', tone: 'success' }
                : settleStage.value === 'ready'
                  ? { text: '收款账户：待绑卡', tone: 'warning' }
                  : { text: '收款账户：待认证', tone: 'info' },
    },
  ]
  // 注销只在已绑卡时有意义；属破坏性动作，用 danger 标记。
  if (settleBound.value) {
    settle.push({
      key: 'closeSettle',
      title: '注销结算账户',
      desc: '解绑收款银行卡，注销后合同款无法入账',
      icon: Warning,
      danger: true,
    })
  }

  return [
    { title: '实名认证', entries: identity },
    { title: '收款与结算', entries: settle },
  ]
})

/// 「账号与安全」卡片：登录凭证 / 第三方账号 / 危险操作三组入口。
const accountEntryGroups = computed<AccountEntryGroup[]>(() => {
  const providerEntry = (provider: 'github' | 'gitee' | 'qq'): AccountEntry => {
    const bound = isProviderBound(provider)
    return {
      key: `bind:${provider}`,
      title: providerLabel(provider),
      desc: bound ? '已绑定，点击可解除绑定' : '绑定后可扫码快捷登录',
      icon: Connection,
      status: { text: bound ? '已绑定' : '未绑定', tone: bound ? 'success' : 'info' },
      loading: providerBindingLoading.value,
    }
  }

  return [
    {
      title: '登录凭证',
      entries: [
        {
          key: 'email',
          title: '修改邮箱',
          desc: profileEmail.value ? `当前邮箱：${profileEmail.value}` : '用于接收验证码与通知',
          icon: Message,
        },
        { key: 'password', title: '修改密码', desc: '修改后其它设备需重新登录', icon: Lock },
        {
          key: 'username',
          title: '修改用户名',
          desc: '用户名同时是登录名，修改后请用新用户名登录',
          icon: User,
        },
        {
          key: 'twoFactor',
          title: '两步验证',
          desc: '登录时额外校验一次邮箱验证码',
          icon: Bell,
          status: {
            text: twoFactorEnabled.value ? '已开启' : '未开启',
            tone: twoFactorEnabled.value ? 'success' : 'info',
          },
        },
      ],
    },
    {
      title: '第三方账号',
      entries: [
        {
          key: 'bind:wechat',
          title: '微信',
          desc: wechatBound.value ? '已绑定，点击可解除绑定' : '绑定后可扫码快捷登录',
          icon: Connection,
          status: {
            text: wechatBound.value ? '已绑定' : '未绑定',
            tone: wechatBound.value ? 'success' : 'info',
          },
          loading: wechatBindingLoading.value,
        },
        providerEntry('github'),
        providerEntry('gitee'),
        providerEntry('qq'),
      ],
    },
    {
      title: '危险操作',
      entries: [
        {
          key: 'close',
          title: '注销账号',
          desc: '注销后账号与数据不可恢复',
          icon: Warning,
          danger: true,
        },
      ],
    },
  ]
})

/// 统一入口分发：模板只渲染，动作都在这里对号入座。
function openAccountEntry(key: string) {
  switch (key) {
    case 'realname':
      realnameDialogVisible.value = true
      return
    case 'faceid':
      void continueFaceid()
      return
    case 'withdraw':
      void handleWithdraw()
      return
    case 'changeSubject':
      startRealnameChange()
      return
    case 'settle':
      if (settleUnderReview.value) {
        TMessage.warning(settleUnderReviewText.value)
        return
      }
      void openSettleDialog()
      return
    case 'closeSettle':
      openCloseSettleDialog()
      return
    case 'mobile':
      openMobileDialog()
      return
    case 'legalPerson':
    case 'company':
    case 'personal':
      asignDialogKind.value = key
      asignDialogVisible.value = true
      return
    case 'seal':
      openSealDialog()
      return
    case 'email':
      emailDialogVisible.value = true
      return
    case 'password':
      passwordDialogVisible.value = true
      return
    case 'username':
      usernameDialogVisible.value = true
      return
    case 'twoFactor':
      twoFactorDialogVisible.value = true
      return
    case 'close':
      openAccountCloseDialog()
      return
  }

  if (key.startsWith('bind:')) {
    const provider = key.slice('bind:'.length)
    if (provider === 'wechat') {
      void handleWechatBinding()
    } else if (provider === 'github' || provider === 'gitee' || provider === 'qq') {
      void handleProviderBinding(provider)
    }
  }
}

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

// ── 爱签账户管理（为电子签署准备） ──────────────────────────────
const asignDialogVisible = ref(false)
const asignDialogKind = ref('')

/// 修改手机号：只保留短信验证码方式（运营商三要素那条路 2026-10-04 已删）。
function openMobileDialog() {
  asignDialogKind.value = 'mobile'
  asignDialogVisible.value = true
}

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
  asignDialogKind.value = 'company'
  asignDialogVisible.value = true
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

const asign = reactive({
  mobileByCode: { mobile: '', code: '', ctoken: '' },
  legalPerson: { name: '', idCard: '' },
  company: { companyName: '', legalName: '', legalIdCard: '' },
  personal: { personalName: '', mobile: '' },
})
const asignLoading = reactive({
  sendCode: false,
  mobileByCode: false,
  legalPerson: false,
  company: false,
  personal: false,
})

function requireToken(): boolean {
  auth.hydrate()
  if (!auth.token.trim()) {
    TMessage.error('登录状态已失效，请重新登录')
    return false
  }
  return true
}

async function handleSendVerifyCode() {
  if (!requireToken()) return
  if (!asign.mobileByCode.mobile.trim()) {
    TMessage.warning('请先填写新手机号')
    return
  }
  asignLoading.sendCode = true
  try {
    const res = await sendVerifyCode(auth.token, { mobile: asign.mobileByCode.mobile.trim() })
    if (res.success) {
      asign.mobileByCode.ctoken = res.data?.codeToken ?? ''
      TMessage.success('验证码已发送，请查收短信')
    }
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '发送验证码失败')
  } finally {
    asignLoading.sendCode = false
  }
}

async function handleModifyMobileByCode() {
  if (!requireToken()) return
  if (
    !asign.mobileByCode.mobile.trim() ||
    !asign.mobileByCode.code.trim() ||
    !asign.mobileByCode.ctoken.trim()
  ) {
    TMessage.warning('请填写手机号与验证码（需先发送验证码）')
    return
  }
  asignLoading.mobileByCode = true
  try {
    const res = await modifyMobileByCode(auth.token, {
      mobile: asign.mobileByCode.mobile.trim(),
      code: asign.mobileByCode.code.trim(),
      ctoken: asign.mobileByCode.ctoken.trim(),
    })
    if (res.success) {
      TMessage.success('手机号已修改')
      asign.mobileByCode.mobile = ''
      asign.mobileByCode.code = ''
      asign.mobileByCode.ctoken = ''
    }
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '修改手机号失败')
  } finally {
    asignLoading.mobileByCode = false
  }
}

/// 修改法人：爱签侧与「修改企业信息」同接口（`/user/modifyCompanyInfo`），
/// 只是这时法人三要素必须齐全（姓名 + 身份证号 + 证件类型 1=身份证）。
async function handleModifyLegalPerson() {
  if (!requireToken()) return
  if (!asign.legalPerson.name.trim() || !asign.legalPerson.idCard.trim()) {
    TMessage.warning('请填写法人姓名与身份证号')
    return
  }
  asignLoading.legalPerson = true
  try {
    const res = await modifyCompanyInfo(auth.token, {
      name: asign.legalPerson.name.trim(),
      idCard: asign.legalPerson.idCard.trim(),
      idCardType: 1,
    })
    if (res.success) {
      TMessage.success('法人信息已修改')
    }
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '修改法人失败')
  } finally {
    asignLoading.legalPerson = false
  }
}

async function handleModifyCompanyInfo() {
  if (!requireToken()) return
  if (!asign.company.companyName.trim() && !asign.company.legalName.trim()) {
    TMessage.warning('请填写企业名称或法人信息')
    return
  }
  asignLoading.company = true
  try {
    const res = await modifyCompanyInfo(auth.token, {
      companyName: asign.company.companyName.trim() || undefined,
      name: asign.company.legalName.trim() || undefined,
      idCard: asign.company.legalIdCard.trim() || undefined,
      idCardType: 1,
    })
    if (res.success) {
      TMessage.success(res.data ? '企业信息已修改，新印章已生成' : '企业信息已修改')
    }
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '修改企业信息失败')
  } finally {
    asignLoading.company = false
  }
}

async function handleModifyUserName() {
  if (!requireToken()) return
  if (!asign.personal.personalName.trim()) {
    TMessage.warning('请填写姓名')
    return
  }
  if (!asign.personal.mobile.trim()) {
    TMessage.warning('请填写本人手机号（用于运营商三要素核验）')
    return
  }
  asignLoading.personal = true
  try {
    // 核验方式固定三要素；手机号用用户本次输入的（不再让他选四要素）
    const res = await modifyUserName(auth.token, {
      name: asign.personal.personalName.trim(),
      identifyType: 2,
      mobile: asign.personal.mobile.trim(),
    })
    if (res.success) {
      TMessage.success('姓名已修改')
      asign.personal.personalName = ''
      asign.personal.mobile = ''
    }
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '修改姓名失败')
  } finally {
    asignLoading.personal = false
  }
}

function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    github: 'GitHub',
    gitee: 'Gitee',
    qq: 'QQ',
    wechat: '微信',
    alipay: '支付宝',
  }
  return labels[provider] ?? provider
}

function isProviderBound(provider: string): boolean {
  return boundProviders.value.includes(provider)
}

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

async function loadBoundProviders() {
  if (!auth.isAuthed) {
    return
  }
  try {
    const result = await getBoundProviders(auth.token)
    boundProviders.value = result.providers ?? []
  } catch {
    boundProviders.value = []
  }
}

async function handleProviderBinding(provider: 'github' | 'gitee' | 'qq') {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后再绑定')
    return
  }
  if (providerBindingLoading.value) {
    return
  }
  if (isProviderBound(provider)) {
    providerBindingLoading.value = true
    try {
      await unbindProvider(auth.token, provider)
      boundProviders.value = boundProviders.value.filter((item) => item !== provider)
      TMessage.success(`${providerLabel(provider)} 已解除绑定`)
    } catch (err) {
      TMessage.error(
        err instanceof Error ? err.message : `解除 ${providerLabel(provider)} 绑定失败`,
      )
    } finally {
      providerBindingLoading.value = false
    }
    return
  }

  providerBindingLoading.value = true
  try {
    const { url } = await getProviderBindUrl(auth.token, provider, window.location.href)
    if (!url.trim()) {
      throw new Error('绑定地址为空')
    }
    window.location.assign(url)
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : `发起 ${providerLabel(provider)} 绑定失败`)
    providerBindingLoading.value = false
  }
}

// 设置弹窗可见性
const emailDialogVisible = ref(false)
const passwordDialogVisible = ref(false)
const usernameDialogVisible = ref(false)
const twoFactorDialogVisible = ref(false)

const accountEmailLabel = computed(() => profileEmail.value || '未绑定邮箱')
const twoFactorChanged = computed(() => twoFactorTargetEnabled.value !== twoFactorEnabled.value)

async function loadProfile() {
  auth.hydrate()
  if (!auth.isAuthed) {
    return
  }

  profileLoading.value = true
  try {
    const profile = await getProfile(auth.token)
    newUsername.value = profile.username
    profileEmail.value = profile.email ?? ''
    twoFactorEnabled.value = profile.two_factor_enabled
    twoFactorTargetEnabled.value = profile.two_factor_enabled
    wechatBound.value = profile.wechat_bound ?? false
    if (!newEmail.value) {
      newEmail.value = profile.email ?? ''
    }
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '加载个人资料失败')
  } finally {
    profileLoading.value = false
  }
}

async function updateUsername() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后修改用户名')
    return
  }

  const trimmed = newUsername.value.trim()
  if (trimmed.length === 0) {
    TMessage.error('请输入一个新的用户名')
    return
  }
  if (trimmed === auth.username) {
    TMessage.info('用户名未发生变化')
    return
  }

  usernameLoading.value = true
  try {
    const payload = await updateProfile(auth.token, trimmed)
    auth.setToken(payload.token)
    newUsername.value = auth.username
    TMessage.success('用户名已更新')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '修改用户名失败')
  } finally {
    usernameLoading.value = false
  }
}

async function sendEmailVerificationCode() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后修改邮箱')
    return
  }

  const trimmed = newEmail.value.trim()
  if (!trimmed) {
    TMessage.error('请输入新的邮箱地址')
    return
  }
  if (trimmed === profileEmail.value) {
    TMessage.warning('新邮箱不能与当前邮箱相同')
    return
  }

  emailCodeSending.value = true
  try {
    await sendProfileEmailChangeCode(auth.token, trimmed)
    TMessage.success('验证码已发送到新邮箱，请查收')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '发送邮箱验证码失败')
  } finally {
    emailCodeSending.value = false
  }
}

async function submitEmailChange() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后修改邮箱')
    return
  }

  const trimmedEmail = newEmail.value.trim()
  const trimmedCode = emailCode.value.trim()
  if (!trimmedEmail) {
    TMessage.error('请输入新的邮箱地址')
    return
  }
  if (trimmedCode.length !== 6) {
    TMessage.error('请输入 6 位邮箱验证码')
    return
  }

  emailLoading.value = true
  try {
    const profile = await updateProfileEmail(auth.token, trimmedEmail, trimmedCode)
    profileEmail.value = profile.email ?? ''
    newEmail.value = profile.email ?? ''
    emailCode.value = ''
    TMessage.success('邮箱已更新')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '修改邮箱失败')
  } finally {
    emailLoading.value = false
  }
}

async function sendPasswordVerificationCode() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后修改密码')
    return
  }
  if (!profileEmail.value) {
    TMessage.error('请先绑定邮箱后再修改密码')
    return
  }

  passwordCodeSending.value = true
  try {
    await sendProfilePasswordCode(auth.token)
    TMessage.success('验证码已发送到当前绑定邮箱，请查收')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '发送密码验证码失败')
  } finally {
    passwordCodeSending.value = false
  }
}

async function submitPasswordChange() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后修改密码')
    return
  }

  const trimmedPassword = newPassword.value.trim()
  const trimmedConfirm = confirmPassword.value.trim()
  const trimmedCode = passwordCode.value.trim()

  if (trimmedPassword.length < 6) {
    TMessage.error('新密码至少 6 位')
    return
  }
  if (trimmedPassword !== trimmedConfirm) {
    TMessage.error('两次输入的新密码不一致')
    return
  }
  if (trimmedCode.length !== 6) {
    TMessage.error('请输入 6 位邮箱验证码')
    return
  }

  passwordLoading.value = true
  try {
    await updateProfilePassword(auth.token, trimmedPassword, trimmedCode)
    newPassword.value = ''
    confirmPassword.value = ''
    passwordCode.value = ''
    TMessage.success('密码已更新，请使用新密码登录')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '修改密码失败')
  } finally {
    passwordLoading.value = false
  }
}

async function sendTwoFactorVerificationCode() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后修改两步验证')
    return
  }
  if (!profileEmail.value) {
    TMessage.error('请先绑定邮箱后再修改两步验证')
    return
  }
  if (!twoFactorChanged.value) {
    TMessage.info('两步验证设置未发生变化')
    return
  }

  twoFactorCodeSending.value = true
  try {
    await sendProfileTwoFactorCode(auth.token)
    TMessage.success('验证码已发送到当前绑定邮箱，请查收')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '发送两步验证验证码失败')
  } finally {
    twoFactorCodeSending.value = false
  }
}

/// 拨动「邮箱验证码保护」开关：`enabled` 是新勾选状态（由弹窗从 change 事件里取出来回传）。
/// 第一次打开时顺手发一次验证码，并把上一次填的验证码清掉。
async function handleTwoFactorTargetChange(enabled: boolean) {
  twoFactorTargetEnabled.value = enabled
  twoFactorCode.value = ''

  if (enabled && !twoFactorEnabled.value && !twoFactorCodeSending.value) {
    await sendTwoFactorVerificationCode()
  }
}

async function submitTwoFactorChange() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后修改两步验证')
    return
  }
  if (!profileEmail.value) {
    TMessage.error('请先绑定邮箱后再修改两步验证')
    return
  }
  if (!twoFactorChanged.value) {
    TMessage.info('两步验证设置未发生变化')
    return
  }

  const trimmedCode = twoFactorCode.value.trim()
  if (trimmedCode.length !== 6) {
    TMessage.error('请输入 6 位邮箱验证码')
    return
  }

  twoFactorLoading.value = true
  try {
    const profile = await updateProfileTwoFactor(
      auth.token,
      twoFactorTargetEnabled.value,
      trimmedCode,
    )
    twoFactorEnabled.value = profile.two_factor_enabled
    twoFactorTargetEnabled.value = profile.two_factor_enabled
    twoFactorCode.value = ''
    await auth.fetchProfile(true).catch(() => undefined)
    TMessage.success(twoFactorEnabled.value ? '两步验证已开启' : '两步验证已关闭')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '更新两步验证失败')
  } finally {
    twoFactorLoading.value = false
  }
}

// PC 端扫码绑定：展示二维码并轮询绑定结果。
const wechatBindQr = reactive({ visible: false, url: '', state: '' })

function isWechatBrowser() {
  return /MicroMessenger/i.test(navigator.userAgent)
}

async function openWechatBinding() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后再绑定微信')
    return
  }
  if (wechatBindingLoading.value) {
    return
  }
  wechatBindingLoading.value = true
  try {
    // 微信内（移动端）：跳转服务号网页授权；PC 端：展示二维码扫码绑定。
    if (isWechatBrowser()) {
      const { url } = await getWechatBindAuthorizeUrl(auth.token, window.location.href)
      if (!url.trim()) {
        throw new Error('微信授权地址为空')
      }
      window.location.assign(url)
      return
    }

    const qr = await getWechatBindQrUrl(auth.token, window.location.href)
    if (!qr.url.trim() || !qr.state.trim()) {
      throw new Error('微信绑定二维码地址为空')
    }
    wechatBindQr.url = qr.url
    wechatBindQr.state = qr.state
    wechatBindQr.visible = true
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '发起微信绑定失败')
  } finally {
    wechatBindingLoading.value = false
  }
}

async function unbindWechat() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后再解除微信绑定')
    return
  }
  if (wechatBindingLoading.value) {
    return
  }

  wechatBindingLoading.value = true
  try {
    await unbindProvider(auth.token, 'wechat')
    wechatBound.value = false
    TMessage.success('微信已解除绑定')
    await auth.fetchProfile(true).catch(() => undefined)
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '解除微信绑定失败')
  } finally {
    wechatBindingLoading.value = false
  }
}

async function handleWechatBinding() {
  if (wechatBound.value) {
    await unbindWechat()
    return
  }
  await openWechatBinding()
}

function closeWechatBindQr() {
  wechatBindQr.visible = false
  wechatBindQr.url = ''
  wechatBindQr.state = ''
}

async function handleWechatBound(result: { success: boolean; error?: string }) {
  closeWechatBindQr()
  if (result.success) {
    wechatBound.value = true
    TMessage.success('微信绑定成功')
    await auth.fetchProfile(true).catch(() => undefined)
  } else {
    TMessage.error(`微信绑定失败：${result.error ?? '未完成'}`)
  }
}

function consumeWechatBindResult() {
  const result = typeof route.query.wechat_bind === 'string' ? route.query.wechat_bind.trim() : ''
  const error =
    typeof route.query.wechat_bind_error === 'string' ? route.query.wechat_bind_error.trim() : ''
  if (result === 'success') {
    TMessage.success('微信绑定成功')
  } else if (error) {
    TMessage.error(`微信绑定失败：${error}`)
  }
  if (result || error) {
    const nextQuery = { ...route.query }
    delete nextQuery.wechat_bind
    delete nextQuery.wechat_bind_error
    void router.replace({ query: nextQuery })
  }
}

function consumeProviderBindResult() {
  const result = typeof route.query.bind === 'string' ? route.query.bind.trim() : ''
  const error = typeof route.query.bind_error === 'string' ? route.query.bind_error.trim() : ''
  if (result === 'success') {
    TMessage.success('第三方账号绑定成功')
    void loadBoundProviders()
  } else if (error) {
    TMessage.error(`第三方账号绑定失败：${error}`)
  }
  if (result || error) {
    const nextQuery = { ...route.query }
    delete nextQuery.bind
    delete nextQuery.bind_error
    void router.replace({ query: nextQuery })
  }
}

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

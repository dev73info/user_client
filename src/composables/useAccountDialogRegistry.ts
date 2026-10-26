import { computed, onScopeDispose, ref, type Ref } from 'vue'

import { TMessage } from 'ui_73info'

import { useAccountCloseAccount } from './useAccountCloseAccount'
import { useAccountProviderBinding } from './useAccountProviderBinding'
import { useAccountSeal } from './useAccountSeal'
import { useAccountSecuritySettings } from './useAccountSecuritySettings'
import { useAccountTwoFactorSettings } from './useAccountTwoFactorSettings'
import { useAccountUsername } from './useAccountUsername'
import type { AccountEntryActions, AccountEntryGroupsOptions } from './useAccountEntryGroups'
import { useAsignAccount } from './useAsignAccount'
import { useFaceidChallenge } from './useFaceidChallenge'
import { useLegalCertPeriod } from './useLegalCertPeriod'
import { useRealnameFormDraft } from './useRealnameFormDraft'
import { useRealnameIdentity } from './useRealnameIdentity'
import { useRealnameMaterials } from './useRealnameMaterials'
import { useRealnameSubmit } from './useRealnameSubmit'
import { useSettlementAccount, type AdapayMemberStatus } from './useSettlementAccount'

/**
 * 账号与安全页的**弹窗域注册表**：十二个弹窗各自的状态归属地，加上交给 `AccountDialogHost`
 * 的那一包域实例（`domains`）与 `key → ref` 的可见性表（`visible`）。
 *
 * 三条硬约定：
 * - **可见性的正本是各域自己的 ref**，这里只建索引，宿主读写同一份；`realname` / `faceid`
 *   两个由视图创建后注入——那两条互斥 watch 归视图。
 * - **`v-model` 的键名不在这里**：它在 `AccountDialogHost` 的表里，每个弹窗一行，
 *   `update:xxx` 由同一个字段派生，避免「点得动、什么都没发生」的静默失效。
 * - **域实例整包交给宿主**（不是把 `.value` 摊平）：宿主渲染时读 `.value`，响应性才连得上。
 */
export interface AccountDialogDeps {
  /** 实名草稿域（整块表单 + 各主体必填判定）与身份域（实名记录 + 状态口径）。 */
  draft: ReturnType<typeof useRealnameFormDraft>
  identity: ReturnType<typeof useRealnameIdentity>
  /** 人脸核身域：启停、查询、撤回与二维码链接。 */
  faceid: ReturnType<typeof useFaceidChallenge>
  /** 渠道会员状态：结算域与 hero 共用（hero 渲染在视图里）。 */
  adapayMember: Ref<AdapayMemberStatus | null>
  /** 两个实名弹窗的可见性：三条跨域 watch 要写它们，所以正本在视图。 */
  realnameDialogVisible: Ref<boolean>
  faceidDialogVisible: Ref<boolean>
}

/** 弹窗 key：与 `AccountDialogHost` 表里的每一条一一对应，顺序即渲染顺序。 */
export type AccountDialogKey =
  | 'realname'
  | 'settle'
  | 'closeSettle'
  | 'faceid'
  | 'asign'
  | 'seal'
  | 'email'
  | 'password'
  | 'username'
  | 'twoFactor'
  | 'closeAccount'
  | 'wechatQr'

/** 宿主渲染用的域背包：每个弹窗读自己那一段（`page` 是本文件自持的零头）。 */
export type AccountDialogDomains = ReturnType<typeof useAccountDialogRegistry>['domains']

export function useAccountDialogRegistry(deps: AccountDialogDeps) {
  const { draft, identity, faceid, realnameDialogVisible, faceidDialogVisible } = deps
  /** 安全设置域**写**、两步验证域**读**：两个域都不该各存一份。 */
  const profileEmail = ref('')

  // ── 视图宽度：核身弹窗的触屏档 ───────────────────────────────
  /// 720px 沿用拆分前的判定（JS 匹配串，不是 CSS `@media`，不受 640/900/1180 三档约束；
  /// 改档位等于改移动端视觉，本轮不动）。启停由视图按 `onMounted` 的老位置调用。
  const isMobile = ref(false)
  let mobileMatch: MediaQueryList | null = null
  function syncMobileViewport() {
    isMobile.value = Boolean(mobileMatch?.matches)
  }
  function startMobileWatch() {
    mobileMatch = window.matchMedia('(max-width: 720px)')
    syncMobileViewport()
    mobileMatch.addEventListener('change', syncMobileViewport)
  }
  onScopeDispose(() => {
    mobileMatch?.removeEventListener('change', syncMobileViewport)
  })

  // ── 各弹窗的域（顺序即依赖顺序：后面几个要读前面几个的值） ────────────
  const provider = useAccountProviderBinding()
  const username = useAccountUsername()
  const twoFactor = useAccountTwoFactorSettings({ profileEmail })
  const security = useAccountSecuritySettings({
    profileEmail,
    applyUsername: username.applyUsername,
    applyTwoFactor: twoFactor.applyTwoFactor,
  })
  const asign = useAsignAccount()
  const seal = useAccountSeal({ openCompanyInfo: () => asign.openAsignDialog('company') })
  const closeAccount = useAccountCloseAccount()
  const legalCert = useLegalCertPeriod({
    form: draft.form,
    edited: draft.legalCertPeriodEdited,
    locked: identity.realnameLocked,
  })
  const materials = useRealnameMaterials({
    form: draft.form,
    autoFillLegalCertPeriod: legalCert.autoFillLegalCertPeriod,
  })
  const submit = useRealnameSubmit({
    form: draft.form,
    validate: draft.validate,
    buildPayload: draft.buildPayload,
    identityCardSelected: draft.identityCardSelected,
    enterpriseSelected: draft.enterpriseSelected,
    isMinor14To18: draft.isMinor14To18,
    approved: identity.realnameApproved,
    rejected: identity.realnameRejected,
    locked: identity.realnameLocked,
    changing: identity.realnameChanging,
    applyRecord: (record) => identity.applyRealnameRecord(record),
    beginChallenge: faceid.beginChallenge,
    restoreBusinessPage: (record) => identity.tryRestoreBusinessPage(record),
    faceidStarting: faceid.faceidStarting,
  })
  const settle = useSettlementAccount({
    realname: identity.current,
    adapayMember: deps.adapayMember,
    isEnterpriseSubject: () => identity.assignEnterprise.value,
  })

  // ── 实名弹窗的跨弹窗动作（提交文案与置灰在宿主里按域状态算） ───────────────
  /// 进入「变更认证类型」：解锁表单并用空表单让用户填新主体，提交后由后端快照原主体，
  /// 认证通过前可撤回（撤回即取消变更、还原原来那份主体）。
  function startRealnameChange() {
    identity.startChangeMode()
    draft.resetSubjectFields()
    draft.applyOperatorPrefill(identity.current.value)
    faceidDialogVisible.value = false
    realnameDialogVisible.value = true
  }

  /// 放弃「变更认证类型」草稿：什么都没提交，直接回到只读状态。
  function cancelRealnameChange() {
    identity.exitChangeMode()
    if (identity.current.value) {
      draft.prefill(identity.current.value)
    }
    realnameDialogVisible.value = false
  }

  /// 审核中继续人脸核身：先找回刷新后丢失的爱签核身链接，再打开核身弹窗。
  async function continueFaceid() {
    if (!faceid.faceidAuthUrl.value) {
      await faceid.restoreFaceidChallengeIfNeeded()
    }
    if (!faceid.faceidAuthUrl.value) {
      TMessage.warning('暂时拿不到人脸核身链接，可撤回本次认证后重新提交')
      return
    }
    faceidDialogVisible.value = true
  }

  /** 缺企业资料时不去重绑：关掉结算弹窗、打开实名表单让用户补企业进件资料。 */
  function goFixSettleMaterial() {
    settle.settleDialogVisible.value = false
    realnameDialogVisible.value = true
    startRealnameChange()
  }

  // ── 可见性索引：key → 各域自己的那份 ref ──────────────────────────
  const visible: Record<AccountDialogKey, Ref<boolean>> = {
    realname: realnameDialogVisible,
    faceid: faceidDialogVisible,
    settle: settle.settleDialogVisible,
    closeSettle: settle.closeSettleDialogVisible,
    asign: asign.asignDialogVisible,
    seal: seal.sealDialogVisible,
    email: security.emailDialogVisible,
    password: security.passwordDialogVisible,
    username: username.usernameDialogVisible,
    twoFactor: twoFactor.twoFactorDialogVisible,
    closeAccount: closeAccount.accountCloseDialogVisible,
    wechatQr: computed({
      get: () => provider.wechatBindQr.visible,
      set: (next: boolean) => {
        provider.wechatBindQr.visible = next
      },
    }),
  }

  /** 宿主唯一的回写口：`:open` / `:visible` 的变化都落到这里，再写回正本 ref。 */
  function setVisible(key: AccountDialogKey, next: boolean) {
    visible[key].value = next
  }

  // ── 两张入口卡要的分组（与弹窗共用同一份状态，不另算一遍） ───────────────
  const settleEntry: AccountEntryGroupsOptions['settle'] = {
    stage: settle.settleStage,
    underReview: settle.settleUnderReview,
    underReviewText: settle.settleUnderReviewText,
    subjectMismatch: settle.settleSubjectMismatch,
    materialMissing: settle.settleMaterialMissing,
    materialMissingText: settle.settleMaterialMissingText,
    accountWord: settle.settleAccountWord,
    providerError: settle.settleProviderError,
    corporateLocked: settle.settleCorporateLocked,
    bound: settle.settleBound,
  }
  const securityEntry: AccountEntryGroupsOptions['security'] = {
    profileEmail,
    twoFactorEnabled: twoFactor.twoFactorEnabled,
    wechatBound: provider.wechatBound,
    wechatBindingLoading: provider.wechatBindingLoading,
    providerBindingLoading: provider.providerBindingLoading,
    providerError: provider.loadError,
    boundProviders: provider.boundProviders,
  }

  /** 入口行的动作表：点哪一行都只是把某个弹窗打开（或打开前先补一次查询）。 */
  const entryActions: AccountEntryActions = {
    openRealnameDialog: () => {
      realnameDialogVisible.value = true
    },
    continueFaceid,
    withdrawRealname: faceid.handleWithdraw,
    startRealnameChange,
    openSettleDialog: settle.openSettleDialog,
    openCloseSettleDialog: settle.openCloseSettleDialog,
    openMobileDialog: asign.openMobileDialog,
    openAsignDialog: asign.openAsignDialog,
    openSealDialog: seal.openSealDialog,
    openEmailDialog: () => {
      security.emailDialogVisible.value = true
    },
    openPasswordDialog: () => {
      security.passwordDialogVisible.value = true
    },
    openUsernameDialog: username.openUsernameDialog,
    openTwoFactorDialog: () => {
      twoFactor.twoFactorDialogVisible.value = true
    },
    openAccountCloseDialog: closeAccount.openAccountCloseDialog,
    toggleWechatBinding: provider.toggleWechatBinding,
    toggleProviderBinding: provider.handleProviderBinding,
  }

  const domains = {
    draft,
    identity,
    materials,
    legalCert,
    faceid,
    submit,
    settle,
    security: { ...security, ...username },
    twoFactor,
    asign,
    provider,
    seal,
    closeAccount,
    page: {
      isMobile,
      profileEmail,
      startRealnameChange,
      cancelRealnameChange,
      continueFaceid,
      goFixSettleMaterial,
    },
  }

  return {
    /** 宿主渲染用的域背包与可见性表。 */
    domains,
    visible,
    setVisible,
    /** 两张入口卡的分组与动作（实名 / 核身两组仍由视图拼）。 */
    settleEntry,
    securityEntry,
    entryActions,
    /** `onMounted` 七步里属于本域的动作：调用顺序由视图决定，与拆分前一致。 */
    startMobileWatch,
    loadProfile: security.loadProfile,
    loadBoundProviders: provider.loadBoundProviders,
    providerLoadError: provider.loadError,
    consumeWechatBindResult: provider.consumeWechatBindResult,
    consumeProviderBindResult: provider.consumeProviderBindResult,
    refreshAdapayMember: settle.refreshAdapayMember,
    openSettleDialog: settle.openSettleDialog,
    /** `watch(realnameDialogVisible)` 打开时补一次证件照识别。 */
    autoFillLegalCertPeriod: legalCert.autoFillLegalCertPeriod,
  }
}

import { computed, type Ref } from 'vue'

import type { AccountEntryGroup, AccountEntryStatus } from '@/shared/accountEntries'
import {
  buildIdentityEntries,
  buildSecurityGroups,
  buildSettleEntries,
} from '@/shared/accountEntryRows'
import type { SettleAccountStage } from '@/shared/settleAccountStage'
import { TMessage } from 'ui_73info'

/**
 * 账户入口域：两张入口卡的「行」（`realnameEntryGroups` / `accountEntryGroups`）与点下去的分发
 * （`openAccountEntry`）。
 *
 * **它自己不持有任何状态**：入口行要读实名、核身、结算、安全设置四个域，这些实例一律注入
 * （见 `AccountEntryGroupsOptions` 的四个分组），再由 `shared/accountEntryRows.ts` 的纯函数拼行。
 * 视图只把两个 `groups` 交给 `AccountEntryGrid`、把 `openAccountEntry` 挂在 `@open` 上。
 *
 * **可见性与草稿不在这里**：分发只调动作表里的回调，弹窗开合、草稿、路由都还在视图（或各自
 * 的弹窗 composable）——那边才是「关掉弹窗就丢草稿」这类耦合的归属地。
 */
export type AccountEntryActions = {
  /** 打开「提交认证信息」弹窗。 */
  openRealnameDialog: () => void
  /** 审核中继续人脸核身：先找回核身链接，拿不到就提示。 */
  continueFaceid: () => void | Promise<void>
  withdrawRealname: () => void | Promise<void>
  /** 进入「变更认证类型」：解锁表单、换上空主体并打开弹窗。 */
  startRealnameChange: () => void
  openSettleDialog: () => void | Promise<void>
  openCloseSettleDialog: () => void
  openMobileDialog: () => void
  /** 爱签「修改法人 / 企业信息 / 姓名」共用一套弹窗，`kind` 决定表单。 */
  openAsignDialog: (kind: 'legalPerson' | 'company' | 'personal') => void
  openSealDialog: () => void
  openEmailDialog: () => void
  openPasswordDialog: () => void
  openUsernameDialog: () => void
  openTwoFactorDialog: () => void
  openAccountCloseDialog: () => void
  /** 微信绑定 / 解绑：已绑定时走解绑，未绑定时出二维码或跳授权页。 */
  toggleWechatBinding: () => void | Promise<void>
  toggleProviderBinding: (provider: 'github' | 'gitee' | 'qq') => void | Promise<void>
}

export type AccountEntryGroupsOptions = {
  /** 实名身份域：入口文案、状态口径与主体类型。 */
  identity: {
    /** 入口主标题与副说明（文案正本在身份域，按实名状态给不同话术）。 */
    copy: Ref<{ title: string; desc: string }>
    statusText: Ref<string>
    statusTone: Ref<AccountEntryStatus['tone']>
    /** 审核中（含变更审核中）：多一个「继续人脸核身」入口。 */
    pending: Ref<boolean>
    approved: Ref<boolean>
    canWithdraw: Ref<boolean>
    changeBacked: Ref<boolean>
    /** 企业 / 个体工商户主体（身份域的 `assignEnterprise`）：决定给哪一套维护入口。 */
    enterprise: Ref<boolean>
  }
  /** 人脸核身域：入口行的转圈与「撤回」的加载位。 */
  faceid: {
    restoring: Ref<boolean>
    withdrawing: Ref<boolean>
  }
  /** 结算域：四态进度、缺资料清单、渠道原话与注销入口的开关。 */
  settle: {
    stage: Ref<SettleAccountStage>
    underReview: Ref<boolean>
    underReviewText: Ref<string>
    subjectMismatch: Ref<boolean>
    materialMissing: Ref<boolean>
    materialMissingText: Ref<string>
    accountWord: Ref<string>
    providerError: Ref<string>
    corporateLocked: Ref<boolean>
    bound: Ref<boolean>
  }
  /** 安全设置域（邮箱 / 两步验证）与第三方绑定域（已绑渠道与两个加载位）。 */
  security: {
    profileEmail: Ref<string>
    twoFactorEnabled: Ref<boolean>
    wechatBound: Ref<boolean>
    wechatBindingLoading: Ref<boolean>
    providerBindingLoading: Ref<boolean>
    providerError?: Ref<string>
    boundProviders: Ref<string[]>
  }
  /** 点击后做什么：全是视图侧的回调，本域不碰弹窗与草稿。 */
  actions: AccountEntryActions
}

export function useAccountEntryGroups(options: AccountEntryGroupsOptions) {
  const { identity, faceid, settle, security, actions } = options

  /// 「认证管理」卡片：实名认证（按认证类型给不同入口） / 收款与结算 两组。
  const realnameEntryGroups = computed<AccountEntryGroup[]>(() => [
    {
      title: '实名认证',
      entries: buildIdentityEntries({
        copy: identity.copy.value,
        statusText: identity.statusText.value,
        statusTone: identity.statusTone.value,
        pending: identity.pending.value,
        restoring: faceid.restoring.value,
        canWithdraw: identity.canWithdraw.value,
        changeBacked: identity.changeBacked.value,
        withdrawing: faceid.withdrawing.value,
        approved: identity.approved.value,
        enterprise: identity.enterprise.value,
      }),
    },
    {
      title: '收款与结算',
      entries: buildSettleEntries({
        stage: settle.stage.value,
        underReview: settle.underReview.value,
        underReviewText: settle.underReviewText.value,
        subjectMismatch: settle.subjectMismatch.value,
        materialMissing: settle.materialMissing.value,
        materialMissingText: settle.materialMissingText.value,
        accountWord: settle.accountWord.value,
        providerError: settle.providerError.value,
        corporateLocked: settle.corporateLocked.value,
        approved: identity.approved.value,
        bound: settle.bound.value,
      }),
    },
  ])

  /// 「账号与安全」卡片：登录凭证 / 第三方账号 / 危险操作三组入口。
  const accountEntryGroups = computed<AccountEntryGroup[]>(() =>
    buildSecurityGroups({
      profileEmail: security.profileEmail.value,
      twoFactorEnabled: security.twoFactorEnabled.value,
      wechatBound: security.wechatBound.value,
      wechatBindingLoading: security.wechatBindingLoading.value,
      providerBindingLoading: security.providerBindingLoading.value,
      providerError: security.providerError?.value,
      boundProviders: security.boundProviders.value,
    }),
  )

  /**
   * 统一入口分发：模板只渲染，动作都在这里对号入座。
   *
   * 分支顺序与拆分前逐字一致；`bind:*` 用前缀分流而不是列进 switch，是为了让「新增一个第三方
   * 渠道」只改数据（`boundProviders` 与 `providerLabel`），不必回来加 case。
   */
  function openAccountEntry(key: string) {
    switch (key) {
      case 'realname':
        actions.openRealnameDialog()
        return
      case 'faceid':
        void actions.continueFaceid()
        return
      case 'withdraw':
        void actions.withdrawRealname()
        return
      case 'changeSubject':
        actions.startRealnameChange()
        return
      case 'settle':
        // 渠道会员还在审核：点进去也绑不上，只给原因，不开弹窗（入口行本身也是禁用态）
        if (settle.underReview.value) {
          TMessage.warning(settle.underReviewText.value)
          return
        }
        void actions.openSettleDialog()
        return
      case 'closeSettle':
        actions.openCloseSettleDialog()
        return
      case 'mobile':
        actions.openMobileDialog()
        return
      case 'legalPerson':
      case 'company':
      case 'personal':
        actions.openAsignDialog(key)
        return
      case 'seal':
        actions.openSealDialog()
        return
      case 'email':
        actions.openEmailDialog()
        return
      case 'password':
        actions.openPasswordDialog()
        return
      case 'username':
        actions.openUsernameDialog()
        return
      case 'twoFactor':
        actions.openTwoFactorDialog()
        return
      case 'close':
        actions.openAccountCloseDialog()
        return
    }

    if (key.startsWith('bind:')) {
      const provider = key.slice('bind:'.length)
      if (provider === 'wechat') {
        void actions.toggleWechatBinding()
      } else if (provider === 'github' || provider === 'gitee' || provider === 'qq') {
        void actions.toggleProviderBinding(provider)
      }
    }
  }

  return { realnameEntryGroups, accountEntryGroups, openAccountEntry }
}

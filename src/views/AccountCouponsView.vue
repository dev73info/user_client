<script setup lang="ts">
/**
 * 账号与安全页（文件名沿用历史的 `AccountCouponsView`，优惠券业务早已迁走）：
 * 一屏 hero、两张入口卡与十二个弹窗的**编排层**。
 *
 * 十二个弹窗不在这里：状态归 `useAccountDialogRegistry`（一包域实例 + 一张可见性表），
 * 绑定表归 `AccountDialogHost`（`key → 组件 + props + 事件`），视图只有下面一行挂点。
 *
 * 三条跨域 watch **必须留在这里**：
 * - `watch(realnameDialogVisible)`：关弹窗即丢弃变更草稿（草稿的生命周期归视图）；
 * - `watch(faceidAuthUrl)`：二维码出现 / 消失要连带开关实名弹窗（两个弹窗互斥）；
 * - `watch(form.authType)`：切主体时把经办人信息补进草稿（读身份域、写草稿域）。
 *
 * `onMounted` 的**串行顺序不许变**：hydrate → 消费两条回跳 query → loadProfile →
 * loadBoundProviders → matchMedia → loadCurrentRealname → 会员状态 → `settle=1` 开结算弹窗 →
 * 回查核身结果 → 恢复核身链接。前一步的返回值是后一步的输入，调换会让 hero / 入口卡读到旧状态。
 */
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import RealnameHero from '@/components/RealnameHero.vue'
import AccountDialogHost from '@/components/account/AccountDialogHost.vue'
import AccountEntryGrid from '@/components/account/AccountEntryGrid.vue'
import { useAccountDialogRegistry } from '@/composables/useAccountDialogRegistry'
import { useAccountEntryGroups } from '@/composables/useAccountEntryGroups'
import { useFaceidChallenge } from '@/composables/useFaceidChallenge'
import { useRealnameFormDraft } from '@/composables/useRealnameFormDraft'
import { useRealnameIdentity } from '@/composables/useRealnameIdentity'
import type { AdapayMemberStatus } from '@/composables/useSettlementAccount'
import { shouldRecheckRealnameResult } from '@/shared/realnameRecheck'
import { TCard } from 'ui_73info'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

/** 渠道会员状态：hero 与结算域共用（各请求一次的话 hero / 入口卡 / 结算会各看各的）。 */
const adapayMember = ref<AdapayMemberStatus | null>(null)
/** 两个实名弹窗的可见性归视图：三条 watch 要写它们，域与宿主只读同一份 ref。 */
const realnameDialogVisible = ref(false)
const faceidDialogVisible = ref(false)

const draft = useRealnameFormDraft()
const identity = useRealnameIdentity({ prefillForm: draft.prefill })
/** 模板里 `identity.current` 是普通对象上的 ref、不会自动解包，提到顶层给 hero 用。 */
const current = identity.current

/**
 * 人脸核身域：启停、轮询、查询、恢复、撤回都在 `useFaceidChallenge` 里（定时器绑 `onScopeDispose`）。
 * 这里注入视图才有的东西：实名记录、记录落地（含表单回填）与两个弹窗的可见性。
 */
const faceid = useFaceidChallenge({
  realname: identity.current,
  applyRecord: (record) => identity.applyRealnameRecord(record),
  clearRecord: () => {
    identity.clearCurrent()
    // 重置表单回到「未提交」的可编辑状态
    draft.form.authType = 'IDENTITY_CARD'
    draft.resetSubjectFields()
  },
  formAuthType: () => draft.form.authType,
  restoreBusinessPage: (record) => identity.tryRestoreBusinessPage(record),
  afterWithdraw: () => {
    faceidDialogVisible.value = false
    realnameDialogVisible.value = true
  },
})

/** 十二个弹窗的状态、入口卡的分组与动作都在注册表里；上面四份跨域状态注入进去。 */
const dialogs = useAccountDialogRegistry({
  draft,
  identity,
  faceid,
  adapayMember,
  realnameDialogVisible,
  faceidDialogVisible,
})

/**
 * 两张入口卡的行与点击分发：实名 / 核身两组读上面的域，结算与安全两组由注册表直接给
 * （与弹窗共用同一份状态），动作表也由它出。`openAccountEntry` 必须留在 `setupState` 上
 * ——三个 spec 的 `openEntry()` 靠它点入口。
 */
const { realnameEntryGroups, accountEntryGroups, openAccountEntry } = useAccountEntryGroups({
  identity: {
    copy: identity.realnameEntryCopy,
    statusText: identity.statusText,
    statusTone: identity.statusTone,
    pending: identity.realnamePending,
    approved: identity.realnameApproved,
    canWithdraw: identity.realnameCanWithdraw,
    changeBacked: identity.realnameChangeBacked,
    enterprise: identity.assignEnterprise,
  },
  faceid: { restoring: faceid.faceidRestoring, withdrawing: faceid.withdrawing },
  settle: dialogs.settleEntry,
  security: dialogs.securityEntry,
  actions: dialogs.entryActions,
})

/// 切到企业 / 个体户时带上本人经办人信息（只在字段为空时补）。
watch(
  () => draft.form.authType,
  (next, previous) => {
    if (next !== previous) draft.applyOperatorPrefill(identity.current.value)
  },
)

/**
 * 核身二维码出现时自动弹出核身弹窗，并收起「提交认证信息」弹窗，避免双弹窗叠放。
 *
 * 只做可见性——**两个弹窗互相关闭这件事必须留在视图**：`realnameDialogVisible` 是表单草稿的
 * 生命周期开关（关掉就丢弃变更草稿），不能让 composable 或子组件去改它。
 */
watch(faceid.faceidAuthUrl, (url) => {
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
    identity.exitChangeMode()
    return
  }
  // 表单打开、本地已存有证件照时补一次识别（上传那次的识别可能失败过，重开弹窗即重试）。
  // 静默：不再重复弹「未能识别」——这条提示在上传后已经给过一次了。
  void dialogs.autoFillLegalCertPeriod({ silent: true })
})

onMounted(async () => {
  auth.hydrate()
  dialogs.primeUsername(auth.username)
  dialogs.consumeWechatBindResult()
  dialogs.consumeProviderBindResult()
  await dialogs.loadProfile()
  await dialogs.loadBoundProviders()

  dialogs.startMobileWatch()

  await identity.loadCurrentRealname()
  if (identity.redirectTarget.value && !identity.realnameApproved.value) {
    realnameDialogVisible.value = true
  }
  // 会员状态走 composable 里那份刷新（失败置空，界面退化为「未绑定」）
  await dialogs.refreshAdapayMember()
  // 钱包页的「去绑定收款银行卡」入口：带 settle=1 直接打开结算账户弹窗
  if (route.query.settle === '1') {
    void dialogs.openSettleDialog()
    const nextQuery = { ...route.query }
    delete nextQuery.settle
    void router.replace({ query: nextQuery })
  }
  // 只有「处理中」才需要问结果：流水号由后端从库里取，前端不再持有任何渠道凭证。
  // 已通过 / 已驳回时不必再打这个接口——它是一次「回查」，每次打开账户页都往渠道跑一趟
  // 没有意义（该端点在历史版本里会连带重放「实名通过」的副作用，把企业开户一遍遍送审）。
  // 口径见 `@/shared/realnameRecheck`（BUG-014）。
  if (shouldRecheckRealnameResult(identity.current.value?.status)) {
    await faceid.checkWechatFaceidResult({ silent: true })
  }
  // 刷新后尝试恢复丢失的爱签二维码（若仍未完成人脸核身）
  await faceid.restoreFaceidChallengeIfNeeded()
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
        <TCard class="realname-card asign-account-card">
          <div class="realname-form__head">
            <h3>认证管理</h3>
          </div>
          <AccountEntryGrid :groups="realnameEntryGroups" @open="openAccountEntry" />
        </TCard>

        <!-- 十二个弹窗的唯一挂点：状态在 useAccountDialogRegistry，绑定表在宿主里 -->
        <AccountDialogHost
          :domains="dialogs.domains"
          :visible="dialogs.visible"
          :set-visible="dialogs.setVisible"
        />
      </div>
    </section>
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

/* 弹窗样式跟着各自的组件走（父级 scoped 对子组件节点不命中，搬出去就必须跟着走）；
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

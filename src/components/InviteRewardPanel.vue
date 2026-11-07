<script setup lang="ts">
/**
 * 邀请现金奖励面板。数据、微信 JSAPI 与领取流程在 `useInviteRewardClaim`，这里只渲染。
 * 详情见该 composable 顶部注释与根仓 `docs/任务/2026-11-07-邀请奖励现金发放.md`。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TButton, TDialog } from 'ui_73info'

import type { InviteRewardItem, InviteRewardPayoutStatus } from '@/api/inviteReward'
import { useInviteRewardClaim } from '@/composables/useInviteRewardClaim'
import { INVITE_ACTIVITY_CODE } from '@/shared/activity'
import { formatBackendDateTime } from '@/shared/datetime'
import { formatFenAsCny } from '@/shared/money'

const route = useRoute()
const router = useRouter()
const {
  overview,
  loading,
  claiming,
  loadError,
  needWechatLogin,
  payoutNeedsConfirm,
  payoutNeedsSync,
  qrOpen,
  qrImage,
  qrError,
  load,
  claim,
} = useInviteRewardClaim()

const phase = computed(() => overview.value?.phase ?? 'active')
/** 活动时间：有结束时间就明确展示，用户能知道什么时候关闭。 */
const activityWindow = computed(() => {
  const start = overview.value?.starts_at
  const end = overview.value?.ends_at
  if (start && end) {
    return `活动时间：${formatBackendDateTime(start)} ~ ${formatBackendDateTime(end)}`
  }
  if (end) return `活动截止：${formatBackendDateTime(end)}`
  if (start) return `活动时间：${formatBackendDateTime(start)} ~ 长期有效`
  return '活动时间：长期有效'
})
const phaseNotice = computed(() => {
  const end = overview.value?.ends_at
  if (phase.value === 'ended') {
    return end
      ? `活动已于 ${formatBackendDateTime(end)} 结束，已获得的奖励仍可领取`
      : '活动已结束，已获得的奖励仍可领取'
  }
  if (phase.value === 'not_started') {
    const start = overview.value?.starts_at
    return start ? `活动将于 ${formatBackendDateTime(start)} 开始` : '活动尚未开始'
  }
  if (phase.value === 'disabled') return '活动未开启'
  return ''
})
/** 有待确认单或处理中的单时，即使可领取为 0 也允许点一次（拉起确认页 / 查单）。 */
const canClaim = computed(() => {
  const data = overview.value
  if (!data || !data.enabled || data.phase === 'not_started') return false
  return data.available_fen > 0 || payoutNeedsConfirm.value || payoutNeedsSync.value
})
const claimDisabled = computed(() => !canClaim.value || claiming.value)
const claimLabel = computed(() => {
  if (payoutNeedsSync.value) return '刷新转账状态'
  if (payoutNeedsConfirm.value) return '继续确认收款'
  return '领取奖励'
})
const activePayouts = computed(() =>
  (overview.value?.payouts ?? []).filter(
    (payout) =>
      payout.status === 'creating' ||
      payout.status === 'wait_user_confirm' ||
      payout.status === 'processing',
  ),
)
const activePayoutFen = computed(() =>
  activePayouts.value.reduce((total, payout) => total + payout.amount_fen, 0),
)

/** 金额一律整数分，展示统一走 shared/money，不在页面里自己除 100。 */
function money(fen: number | null | undefined): string {
  return formatFenAsCny(fen)
}

function statusLabel(reward: InviteRewardItem): string {
  switch (reward.status) {
    case 'pending':
      return overview.value?.require_invitee_realname ? '待实名' : '待入账'
    case 'available':
      return '可领取'
    case 'claimed':
      return '领取中'
    case 'paid':
      return '已到账'
    case 'failed':
      return '发放失败'
    default:
      return reward.status
  }
}

function payoutLabel(status: InviteRewardPayoutStatus | undefined): string {
  if (status === 'creating') return '建单中'
  if (status === 'wait_user_confirm' || status === 'processing') return '等待确认收款'
  return '处理中'
}

function goWechatLogin() {
  void router.push({
    name: 'home',
    query: { modal: 'auth', mode: 'login', redirect_to: route.fullPath },
  })
}

/** 「邀请有礼」活动详情：名额、奖励与转账单统一在活动页查看。 */
function goActivity() {
  void router.push({
    name: 'workbench-activity-detail',
    params: { code: INVITE_ACTIVITY_CODE },
  })
}

defineExpose({ reload: load })
</script>

<template>
  <section class="invite-reward" aria-label="邀请现金奖励" :aria-busy="loading">
    <div class="wb-card-head">
      <div class="wb-card-head__title-block">
        <h3 class="wb-card-head__title">邀请现金奖励</h3>
        <p class="invite-reward__window">{{ phaseNotice || activityWindow }}</p>
        <p class="invite-reward__source">
          由活动「邀请有礼」驱动 ·
          <button type="button" class="invite-reward__activity-link" @click="goActivity">
            查看活动
          </button>
        </p>
      </div>
      <div class="wb-card-head__actions">
        <span v-if="overview && !overview.enabled" class="invite-reward__disabled">活动未开启</span>
        <TButton
          v-else-if="overview"
          variant="solid"
          tone="accent"
          :disabled="claimDisabled"
          :loading="claiming"
          @click="claim"
          >{{ claimLabel }}</TButton
        >
      </div>
    </div>

    <div v-if="loadError" class="wb-empty" role="alert">
      <span>{{ loadError }}</span>
      <TButton variant="outline" :loading="loading" @click="load">重试</TButton>
    </div>

    <div v-if="needWechatLogin" class="wb-empty invite-reward__notice" role="alert">
      <span class="wb-empty__title">请先用微信登录后再领取</span>
      <div class="wb-empty__actions">
        <TButton variant="solid" tone="accent" @click="goWechatLogin">去微信登录</TButton>
      </div>
    </div>

    <template v-if="overview">
      <div class="invite-reward__summary">
        <div class="wb-panel invite-reward__stat">
          <span class="invite-reward__stat-label">累计奖励</span>
          <strong>¥{{ money(overview.total_rewarded_fen) }}</strong>
        </div>
        <div class="wb-panel invite-reward__stat">
          <span class="invite-reward__stat-label">可领取</span>
          <strong>¥{{ money(overview.available_fen) }}</strong>
        </div>
        <div class="wb-panel invite-reward__stat">
          <span class="invite-reward__stat-label">待入账</span>
          <strong>¥{{ money(overview.pending_fen) }}</strong>
        </div>
        <div class="wb-panel invite-reward__stat">
          <span class="invite-reward__stat-label">已到账</span>
          <strong>¥{{ money(overview.paid_fen) }}</strong>
        </div>
        <div class="wb-panel invite-reward__stat">
          <span class="invite-reward__stat-label">已邀请人数</span>
          <strong>{{ overview.total_invited }}</strong>
        </div>
      </div>

      <div v-if="activePayouts.length" class="wb-panel invite-reward__payout" role="status">
        <span>{{ activePayouts.length }} 笔转账处理中，共 ¥{{ money(activePayoutFen) }}</span>
        <span class="invite-reward__status">{{ payoutLabel(activePayouts[0]?.status) }}</span>
      </div>

      <ul v-if="overview.rewards.length" class="wb-list" aria-label="邀请奖励明细">
        <li v-for="reward in overview.rewards" :key="reward.id" class="wb-item">
          <div class="wb-item__main">
            <span class="wb-item__title">{{ reward.invitee }}</span>
            <span class="wb-item__meta">
              {{ reward.reason || '邀请注册奖励' }} ·
              {{ formatBackendDateTime(reward.created_at) }}
            </span>
          </div>
          <div class="wb-item__side">
            <span class="invite-reward__amount">¥{{ money(reward.amount_fen) }}</span>
            <span class="invite-reward__status" :class="`is-${reward.status}`">
              {{ statusLabel(reward) }}
            </span>
          </div>
        </li>
      </ul>
      <div v-else class="wb-empty">
        <span class="wb-empty__title">暂无邀请奖励</span>
      </div>
    </template>
    <p v-else-if="loading" class="wb-empty" role="status">正在加载邀请奖励…</p>

    <TDialog :open="qrOpen" title="微信扫码领取" width="360px" @update:open="qrOpen = $event">
      <p class="invite-reward__qr-tip">请在微信中扫码打开本页领取</p>
      <div class="invite-reward__qr">
        <img v-if="qrImage" :src="qrImage" alt="微信扫码领取邀请奖励" />
        <span v-else>{{ qrError || '二维码生成中…' }}</span>
      </div>
    </TDialog>
  </section>
</template>

<style scoped>
.invite-reward {
  display: grid;
  gap: 14px;
}
.invite-reward__summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}
.invite-reward__stat {
  display: grid;
  gap: 6px;
}
.invite-reward__stat-label {
  color: var(--73-ink-muted);
  font-size: 12px;
}
.invite-reward__stat strong {
  color: var(--73-ink);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}
.invite-reward__payout {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--73-ink-muted);
  font-size: 13px;
}
.invite-reward__amount {
  color: var(--73-ink);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.invite-reward__status {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--wb-tag-bg);
  color: var(--73-ink-muted);
  font-size: 12px;
  white-space: nowrap;
}
.invite-reward__status.is-available {
  background: var(--wb-accent-soft);
  color: var(--wb-accent);
}
.invite-reward__status.is-paid {
  background: var(--profile-success-soft, var(--wb-accent-soft));
  color: var(--73-success);
}
.invite-reward__status.is-failed {
  background: var(--profile-danger-soft, var(--wb-tag-bg));
  color: var(--73-danger);
}
.invite-reward__window {
  margin: 4px 0 0;
  color: var(--73-ink-muted);
  font-size: 12px;
}
.invite-reward__source {
  margin: 2px 0 0;
  color: var(--73-ink-muted);
  font-size: 12px;
}
.invite-reward__activity-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--73-accent);
  font-size: 12px;
  cursor: pointer;
}
.invite-reward__activity-link:hover {
  text-decoration: underline;
}
.invite-reward__disabled {
  color: var(--73-ink-muted);
  font-size: 13px;
}
.invite-reward__qr-tip {
  margin: 0 0 12px;
  color: var(--73-ink-muted);
  font-size: 13px;
  text-align: center;
}
.invite-reward__qr {
  display: grid;
  place-items: center;
  min-height: 220px;
  color: var(--73-ink-muted);
  font-size: 13px;
}
.invite-reward__qr img {
  width: 220px;
  height: 220px;
}
@media (max-width: 900px) {
  .invite-reward__summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .invite-reward__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

<script setup lang="ts">
/**
 * 活动详情：报名、key 兑换名额、我的参与 / 奖励 / 转账单与微信确认收款。
 * 转账确认的微信 / 二维码分支在 `useActivityRewardConfirm`。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Refresh, TButton, TIcon, TInput, TMessage } from 'ui_73info'

import {
  getActivityDetail,
  redeemActivityKey,
  signupActivity,
  syncMyActivityRewards,
  type ActivityDetail,
  type ActivitySignupResponse,
} from '@/api/activities'
import ActivityDetailHeader from '@/components/activity/ActivityDetailHeader.vue'
import ActivityPayoutList from '@/components/activity/ActivityPayoutList.vue'
import ActivityRewardList from '@/components/activity/ActivityRewardList.vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useActivityRewardConfirm } from '@/composables/useActivityRewardConfirm'
import {
  activityActionError,
  activityKeyBlockedReason,
  activitySignupBlockedReason,
  hasWaitingWechatReward,
} from '@/shared/activity'
import { formatBackendDateTime } from '@/shared/datetime'
import { formatFenAsCny } from '@/shared/money'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const activity = ref<ActivityDetail | null>(null)
const loading = ref(false)
const loadError = ref('')
const signupBusy = ref(false)
const keyInput = ref('')
const keyBusy = ref(false)
/** 报名 / 兑换失败时的就地提示（实名、账号状态这类错误码），旁边同时弹 TMessage。 */
const actionHint = ref<{ scope: 'signup' | 'key'; message: string } | null>(null)

const code = computed(() => String(route.params.code ?? ''))
const rewards = computed(() => activity.value?.my_rewards ?? [])
const payouts = computed(() => activity.value?.my_payouts ?? [])
const signupBlocked = computed(() =>
  activity.value ? activitySignupBlockedReason(activity.value) : '',
)
const keyBlocked = computed(() => (activity.value ? activityKeyBlockedReason(activity.value) : ''))
const myQuota = computed(() => activity.value?.my_quota ?? 0)
const rewardTotal = computed(
  () => (activity.value?.my_reward_pending_fen ?? 0) + (activity.value?.my_reward_paid_fen ?? 0),
)
const waitingWechat = computed(() => hasWaitingWechatReward(rewards.value))
const quotaRemaining = computed(() =>
  activity.value?.quota_remaining == null ? '不限' : activity.value.quota_remaining,
)
const signupHint = computed(() =>
  actionHint.value?.scope === 'signup' ? actionHint.value.message : '',
)
const keyHint = computed(() => (actionHint.value?.scope === 'key' ? actionHint.value.message : ''))

const {
  confirming,
  canConfirm,
  confirmLabel,
  needWechatLogin,
  qrOpen,
  qrImage,
  qrError,
  confirm,
  maybeAutoConfirm,
  syncIfNeeded,
} = useActivityRewardConfirm({
  payouts: () => payouts.value,
  sync: async () => {
    const result = await syncMyActivityRewards(auth.token)
    const id = activity.value?.id
    return result.payouts.filter((payout) => id == null || payout.activity_id === id)
  },
  reload: load,
  hasPending: () => rewards.value.some((reward) => reward.status === 'pending'),
})

async function load() {
  auth.hydrate()
  if (!auth.isAuthed) return
  if (!code.value) {
    loadError.value = '活动不存在'
    return
  }

  loading.value = true
  loadError.value = ''
  try {
    activity.value = await getActivityDetail(auth.token, code.value)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载活动详情失败'
  } finally {
    loading.value = false
  }
}

function applyResult(result: ActivitySignupResponse, message: string) {
  activity.value = result.activity
  keyInput.value = ''
  actionHint.value = null
  TMessage.success(message)
}

async function signup() {
  if (!activity.value || signupBlocked.value || signupBusy.value) return
  signupBusy.value = true
  actionHint.value = null
  try {
    const result = await signupActivity(auth.token, activity.value.code)
    applyResult(result, '报名成功')
  } catch (error) {
    const message = activityActionError(error, '报名失败')
    actionHint.value = { scope: 'signup', message }
    TMessage.error(message)
  } finally {
    signupBusy.value = false
  }
}

async function redeem() {
  const key = keyInput.value.trim()
  if (!key) {
    TMessage.error('请输入兑换码')
    return
  }
  if (keyBusy.value || keyBlocked.value) return

  keyBusy.value = true
  actionHint.value = null
  try {
    const result = await redeemActivityKey(auth.token, key)
    if (result.activity.code !== activity.value?.code) {
      keyInput.value = ''
      TMessage.success('兑换成功')
      await router.push({
        name: 'workbench-activity-detail',
        params: { code: result.activity.code },
      })
      return
    }
    applyResult(result, '兑换成功')
  } catch (error) {
    const message = activityActionError(error, '兑换失败')
    actionHint.value = { scope: 'key', message }
    TMessage.error(message)
  } finally {
    keyBusy.value = false
  }
}

function goWechatLogin() {
  void router.push({
    name: 'home',
    query: { modal: 'auth', mode: 'login', redirect_to: route.fullPath },
  })
}

onMounted(() => {
  void load().then(async () => {
    await maybeAutoConfirm()
    await syncIfNeeded()
  })
})
</script>

<template>
  <main
    class="page-shell custom-page-shell profile-page activity-detail-page wb-sheet"
    :aria-busy="loading"
  >
    <WorkbenchBarSlot>
      <div class="wb-strip" aria-label="活动概览">
        <div class="wb-strip__item">
          <span class="wb-strip__label">我的名额</span>
          <span class="wb-strip__value">{{ myQuota }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">我的奖励</span>
          <span class="wb-strip__value">¥{{ formatFenAsCny(rewardTotal) }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">名额剩余</span>
          <span class="wb-strip__value">{{ activity ? quotaRemaining : '—' }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton icon-only :loading="loading" aria-label="刷新活动" @click="load">
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <div v-if="loadError" class="wb-empty" role="alert">
      <span>{{ loadError }}</span>
      <div class="wb-empty__actions">
        <TButton variant="outline" :loading="loading" @click="load">重试</TButton>
      </div>
    </div>
    <p v-else-if="loading && !activity" class="wb-empty" role="status">正在加载活动…</p>

    <template v-else-if="activity">
      <ActivityDetailHeader
        :activity="activity"
        :signup-blocked="signupBlocked"
        :signup-busy="signupBusy"
        :signup-hint="signupHint"
        @signup="signup"
        @invite-rewards="router.push({ name: 'workbench-badges' })"
      />

      <section v-if="activity.key_enabled" class="wallet-section">
        <div class="wb-card-head">
          <div class="wb-card-head__title-block">
            <h3 class="wb-card-head__title">兑换名额</h3>
          </div>
        </div>
        <div class="activity-detail__key">
          <TInput
            v-model="keyInput"
            class="activity-detail__key-input"
            placeholder="输入兑换码"
            aria-label="兑换码"
            :disabled="Boolean(keyBlocked)"
          />
          <TButton
            variant="solid"
            tone="accent"
            :disabled="Boolean(keyBlocked) || keyBusy"
            :loading="keyBusy"
            @click="redeem"
            >兑换</TButton
          >
          <span v-if="keyHint || keyBlocked" class="activity-detail__blocked">
            {{ keyHint || keyBlocked }}
          </span>
        </div>
      </section>

      <section v-if="activity.my_participation" class="wallet-section">
        <div class="wb-card-head">
          <div class="wb-card-head__title-block">
            <h3 class="wb-card-head__title">我的参与</h3>
            <p class="activity-detail__subtitle">
              报名时间：{{ formatBackendDateTime(activity.my_participation.created_at) }}
            </p>
          </div>
        </div>
        <ActivityRewardList :rewards="rewards" />
        <ActivityPayoutList
          :payouts="payouts"
          :confirming="confirming"
          :can-confirm="canConfirm"
          :confirm-label="confirmLabel"
          :need-wechat-login="needWechatLogin"
          :waiting-wechat="waitingWechat"
          :qr-open="qrOpen"
          :qr-image="qrImage"
          :qr-error="qrError"
          @confirm="confirm"
          @login="goWechatLogin"
          @update:qr-open="qrOpen = $event"
        />
      </section>
    </template>
  </main>
</template>

<style scoped>
.activity-detail__subtitle {
  margin: 4px 0 0;
  color: var(--73-ink-muted);
  font-size: 12px;
}
.activity-detail__key {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.activity-detail__key-input {
  max-width: 320px;
}
.activity-detail__blocked {
  color: var(--73-ink-muted);
  font-size: 13px;
}
</style>

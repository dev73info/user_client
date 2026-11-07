<script setup lang="ts">
/** 我的活动奖励：跨活动汇总待发放 / 发放中 / 已到账，以及全部奖励与转账单。 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh, TButton, TIcon } from 'ui_73info'

import {
  getMyActivityRewards,
  syncMyActivityRewards,
  type ActivityPayoutItem,
  type ActivityRewardItem,
  type MyActivityRewardsSummary,
} from '@/api/activities'
import ActivityPayoutList from '@/components/activity/ActivityPayoutList.vue'
import ActivityRewardList from '@/components/activity/ActivityRewardList.vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useActivityRewardConfirm } from '@/composables/useActivityRewardConfirm'
import { hasWaitingWechatReward } from '@/shared/activity'
import { formatFenAsCny } from '@/shared/money'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const rewards = ref<ActivityRewardItem[]>([])
const payouts = ref<ActivityPayoutItem[]>([])
const summary = ref<MyActivityRewardsSummary>({
  pending_fen: 0,
  transferring_fen: 0,
  paid_fen: 0,
})
const loading = ref(false)
const loadError = ref('')
const waitingWechat = computed(() => hasWaitingWechatReward(rewards.value))

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
  sync: syncRewards,
  reload: load,
  hasPending: () => rewards.value.some((reward) => reward.status === 'pending'),
})

async function syncRewards(): Promise<ActivityPayoutItem[]> {
  const result = await syncMyActivityRewards(auth.token)
  rewards.value = result.items
  payouts.value = result.payouts
  summary.value = result.summary
  return result.payouts
}

async function load() {
  auth.hydrate()
  if (!auth.isAuthed) return

  loading.value = true
  loadError.value = ''
  try {
    const result = await getMyActivityRewards(auth.token)
    rewards.value = result.items
    payouts.value = result.payouts
    summary.value = result.summary
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载活动奖励失败'
  } finally {
    loading.value = false
  }
}

function goWechatLogin() {
  void router.push({
    name: 'home',
    query: { modal: 'auth', mode: 'login', redirect_to: '/workbench/activities/rewards' },
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
    class="page-shell custom-page-shell profile-page activity-rewards-page wb-sheet"
    :aria-busy="loading"
  >
    <WorkbenchBarSlot>
      <div class="wb-strip" aria-label="活动奖励概览">
        <div class="wb-strip__item">
          <span class="wb-strip__label">待发放</span>
          <span class="wb-strip__value">¥{{ formatFenAsCny(summary.pending_fen) }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">转账中</span>
          <span class="wb-strip__value">¥{{ formatFenAsCny(summary.transferring_fen) }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">已到账</span>
          <span class="wb-strip__value">¥{{ formatFenAsCny(summary.paid_fen) }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton icon-only :loading="loading" aria-label="刷新活动奖励" @click="load">
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">我的活动奖励</h3>
        </div>
        <div class="wb-card-head__actions">
          <TButton variant="outline" @click="router.push({ name: 'workbench-activities' })">
            活动中心
          </TButton>
        </div>
      </div>

      <div v-if="loadError" class="wb-empty" role="alert">
        <span>{{ loadError }}</span>
        <div class="wb-empty__actions">
          <TButton variant="outline" :loading="loading" @click="load">重试</TButton>
        </div>
      </div>
      <p v-else-if="loading && !rewards.length" class="wb-empty" role="status">正在加载活动奖励…</p>
      <template v-else>
        <ActivityRewardList :rewards="rewards" show-activity />
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
      </template>
    </section>
  </main>
</template>

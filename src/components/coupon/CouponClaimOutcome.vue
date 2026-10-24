<script setup lang="ts">
import type { ActivityCampaignClaimResp } from '@/api/settings'
import { formatBackendDateTime } from '@/shared/datetime'

/**
 * 活动福利领取页的「结果 / 空态 / 加载中」三态展示。
 *
 * 只负责把三个状态画出来并把用户的动作抛回去（父组件决定怎么领取、要不要登录），
 * 自身不碰路由、不碰请求，便于单独走查三种状态。
 */
defineProps<{
  claiming: boolean
  result: ActivityCampaignClaimResp | null
  error: string
  authed: boolean
}>()

const emit = defineEmits<{
  workbench: []
  claim: []
  login: []
  register: []
}>()

function openAuth(mode: 'login' | 'register') {
  if (mode === 'login') {
    emit('login')
  } else {
    emit('register')
  }
}
</script>

<template>
  <div v-if="claiming" class="claim-outcome claim-outcome--loading">
    正在校验活动并发放福利，请稍候...
  </div>

  <div v-else-if="result" class="claim-outcome claim-outcome--result">
    <strong>{{ result.already_claimed ? '这份福利你已经领过了' : '领取成功' }}</strong>
    <p>活动：{{ result.title }}</p>
    <p>券类型：{{ result.coupon_type === 'amount' ? '优惠券' : '折扣券' }}</p>
    <p>券名称：{{ result.coupon_name }}</p>
    <p>券码：{{ result.assigned_coupon_code }}</p>
    <p>领取时间：{{ formatBackendDateTime(result.claimed_at) }}</p>
    <div class="claim-outcome__actions">
      <button class="claim-outcome__primary" type="button" @click="emit('workbench')">
        前往工作台查看
      </button>
    </div>
  </div>

  <div v-else class="claim-outcome claim-outcome--empty">
    <strong>尚未领取</strong>
    <p>{{ error || '点击下方按钮登录后继续领取。' }}</p>
    <div class="claim-outcome__actions">
      <button
        v-if="!authed"
        class="claim-outcome__primary"
        type="button"
        @click="openAuth('login')"
      >
        登录后领取
      </button>
      <button v-else class="claim-outcome__primary" type="button" @click="emit('claim')">
        重新尝试领取
      </button>
      <button
        v-if="!authed"
        class="claim-outcome__ghost"
        type="button"
        @click="openAuth('register')"
      >
        注册新账号
      </button>
    </div>
  </div>
</template>

<style scoped>
.claim-outcome {
  padding: 20px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--73-surface-strong) 5%, transparent);
}

.claim-outcome--loading {
  color: var(--73-accent);
}

.claim-outcome strong {
  display: block;
  margin-bottom: 12px;
  font-size: 22px;
}

.claim-outcome p {
  margin: 8px 0;
  color: color-mix(in srgb, var(--73-accent-soft) 82%, transparent);
}

.claim-outcome__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
}

.claim-outcome__primary,
.claim-outcome__ghost {
  border: none;
  border-radius: 999px;
  padding: 12px 22px;
  font: inherit;
  cursor: pointer;
}

.claim-outcome__primary {
  background: var(--73-app-grad-accent-03);
  color: var(--73-ink);
  font-weight: 700;
}

.claim-outcome__ghost {
  background: transparent;
  color: var(--73-accent-soft);
  border: 1px solid color-mix(in srgb, var(--73-accent-soft) 24%, transparent);
}

@media (max-width: 640px) {
  .claim-outcome__actions {
    flex-direction: column;
  }
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Tone } from 'ui_73info'
import { TTag } from 'ui_73info'

import { getMyAdapayMember } from '@/api/adapay'
import { getMyRealnameVerification, type UserRealnameVerification } from '@/api/realname'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const props = defineProps<{
  verification?: UserRealnameVerification | null
  adapayMember?: {
    onboardingStatus: string
    settleAccountId?: string | null
    providerError?: string | null
  } | null
}>()

const localVerification = ref<UserRealnameVerification | null>(null)
const localAdapayMember = ref<{
  onboardingStatus: string
  settleAccountId?: string | null
  providerError?: string | null
} | null>(null)
const current = computed(() =>
  props.verification === undefined ? localVerification.value : props.verification,
)
const adapayMember = computed(() =>
  props.adapayMember === undefined ? localAdapayMember.value : props.adapayMember,
)

const statusText = computed(() => {
  const status = current.value?.status
  if (!status) return '未提交'
  if (status === 'approved') return '已通过'
  if (status === 'pending') return '审核中'
  return '已驳回'
})

/* 状态色的语义直接沿用 Tone：success / warning / danger / info 四个值与 el-tag 的
   `type` 同名同义，所以换 TTag 时只需要把 `:type` 改成 `:tone`，取值不动。
   这个值同时用作根元素的修饰类（realname-hero--{tone}），改名会连带改类名，所以保持原值。 */
const statusType = computed<Tone>(() => {
  const status = current.value?.status
  if (!status) return 'info'
  if (status === 'approved') return 'success'
  if (status === 'pending') return 'warning'
  return 'danger'
})

const authTypeLabel = computed(() => {
  const t = current.value?.auth_type
  if (t === 'IDENTITY_CARD') return '个人'
  if (t === 'ENTERPRISE') return '企业'
  if (t === 'SOLE_PROPRIETOR') return '个体工商户'
  if (t === 'RESIDENCE_HK_MC') return '港澳居民'
  if (t === 'RESIDENCE_TAIWAN') return '台湾居民'
  return '未认证'
})

const asignAuthText = computed(() => {
  const status = current.value?.status
  if (status === 'approved') return '已认证'
  if (status === 'pending') return '审核中'
  if (status === 'rejected') return '未通过'
  return '未认证'
})

/**
 * 「结算账户」指标：直接回答**收款银行卡绑没绑**。
 *
 * 不用渠道会员的 `onboardingStatus`（那是「会员认证」状态，未绑卡时同样可能是
 * `active`→已认证，会误导成「已能收款」）；口径与账号页那个标签保持一致。
 */
const settleAccountText = computed(() => {
  if (settleUnderReview.value) return '审核中'
  const id = adapayMember.value?.settleAccountId
  return id && id.trim() ? '已设置' : '未设置'
})

/**
 * 渠道会员是否还在审核中。
 *
 * 企业会员开通对公收款要走渠道审核，这期间**实名认证早已通过**、但结算账户绑不上，
 * 所以这一格如实写「审核中」——写成「未设置」会让用户以为要自己再点一次绑定，
 * 而实际是渠道还没放行。
 */
const settleUnderReview = computed(() => {
  const status = adapayMember.value?.onboardingStatus
  return status === 'under_review' || status === 'pending'
})

const heroDesc = computed(() => {
  if (current.value?.status === 'approved') {
    return settleUnderReview.value
      ? '已完成实名认证，信息核验通过，可正常使用合同签署等权益。企业收款账户正在渠道审核中，审核通过后即可绑定对公账户。'
      : '已完成实名认证，信息核验通过，可正常使用合同签署等权益。'
  }
  if (current.value?.status === 'pending') return '实名认证审核中，请耐心等待平台核验结果。'
  if (current.value?.status === 'rejected') return '实名认证未通过，请核对证件信息后重新提交。'
  return '提交真实身份信息，经平台核验后即可开通合同签署等权益。'
})

onMounted(async () => {
  auth.hydrate()
  if (!auth.token || (props.verification !== undefined && props.adapayMember !== undefined)) {
    return
  }

  if (props.verification === undefined) {
    try {
      localVerification.value = await getMyRealnameVerification(auth.token)
    } catch {
      localVerification.value = null
    }
  }

  if (props.adapayMember === undefined) {
    try {
      localAdapayMember.value = await getMyAdapayMember(auth.token)
    } catch {
      localAdapayMember.value = null
    }
  }
})
</script>

<template>
  <section class="realname-hero" :class="`realname-hero--${statusType}`">
    <div class="realname-hero__copy">
      <h1 class="realname-hero__title">实名认证</h1>
      <p class="realname-hero__desc">{{ heroDesc }}</p>
      <div class="realname-hero__tag">
        <TTag :tone="statusType">实名认证：{{ statusText }}</TTag>
        <TTag v-if="settleUnderReview" tone="warning">企业收款账户：渠道审核中</TTag>
      </div>
    </div>
    <div class="realname-hero__metrics">
      <div class="realname-metrics__item">
        <span>认证类型</span>
        <strong>{{ authTypeLabel }}</strong>
      </div>
      <div class="realname-metrics__item">
        <span>实名认证</span>
        <strong>{{ asignAuthText }}</strong>
      </div>
      <div class="realname-metrics__item">
        <span>结算账户</span>
        <strong>{{ settleAccountText }}</strong>
      </div>
    </div>
  </section>
</template>

<style scoped>
.realname-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr);
  gap: 24px;
  padding: 20px 24px;
  border-radius: 26px;
  border: 1px solid var(--73-border);
  /* 两团装饰性光晕没有对应的语义令牌（不是表面色也不是状态色），按原样保留；
     最底层那张半透明白卡走 --73-surface。 */
  background:
    radial-gradient(circle at top left, rgba(84, 124, 255, 0.16), transparent 30%),
    radial-gradient(circle at bottom right, rgba(100, 213, 255, 0.12), transparent 26%),
    var(--73-surface);
  backdrop-filter: blur(var(--73-glass-blur));
  box-shadow: var(--73-shadow-card);
  align-items: center;
}

.realname-hero__copy {
  display: grid;
  gap: 12px;
  align-content: center;
}

.realname-hero__title {
  margin: 0;
  font-size: 28px;
  color: var(--73-ink);
}

.realname-hero__desc {
  margin: 0;
  color: var(--73-ink-muted);
  font-size: 14px;
  line-height: 1.7;
}

.realname-hero__tag {
  margin-top: 2px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.realname-hero__metrics {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.realname-metrics__item {
  display: grid;
  gap: 4px;
  padding: 11px 12px;
  border-radius: var(--73-radius-inner);
  border: 1px solid var(--73-border);
  background: var(--73-bg-soft);
}

.realname-metrics__item span {
  color: var(--73-ink-muted);
  font-size: 12px;
}

.realname-metrics__item strong {
  color: var(--73-ink);
  font-size: 14px;
}

@media (max-width: 860px) {
  .realname-hero {
    grid-template-columns: 1fr;
    padding: 22px;
  }
}

@media (max-width: 720px) {
  .realname-hero__metrics {
    grid-template-columns: 1fr;
  }
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Tone } from 'ui_73info'
import { TTag } from 'ui_73info'

import { getMyAdapayMember } from '@/api/adapay'
import { getMyRealnameVerification, type UserRealnameVerification } from '@/api/realname'
import {
  realnameOverallStatus,
  realnameOverallStatusText,
  realnameOverallStatusTone,
} from '@/shared/realnameDisplay'
import { isSettleRejected, isSettleUnderReview } from '@/shared/settleAccountStage'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const props = defineProps<{
  verification?: UserRealnameVerification | null
  adapayMember?: {
    onboardingStatus: string
    memberReady?: boolean
    /** 能不能收分账款：契约 `SettlementAccountResponse.accepts_settlement`。 */
    acceptsSettlement?: boolean
    /** 结算银行卡后四位：契约 `SettlementAccountResponse.account_no_tail`。 */
    accountNoTail?: string | null
    providerError?: string | null
  } | null
}>()

const localVerification = ref<UserRealnameVerification | null>(null)
const localAdapayMember = ref<{
  onboardingStatus: string
  memberReady?: boolean
  acceptsSettlement?: boolean
  accountNoTail?: string | null
  providerError?: string | null
} | null>(null)
const current = computed(() =>
  props.verification === undefined ? localVerification.value : props.verification,
)
const adapayMember = computed(() =>
  props.adapayMember === undefined ? localAdapayMember.value : props.adapayMember,
)

/**
 * 综合状态：爱签实名 + 渠道会员。
 *
 * 只按实名状态判定会把「爱签已通过、渠道会员还在审」写成「已认证」，
 * 用户会以为已经能收款；口径与入口卡、hero 指标格同源（`@/shared/realnameDisplay`）。
 */
const overallStatus = computed(() =>
  realnameOverallStatus(current.value, adapayMember.value?.memberReady),
)
const statusText = computed(() => realnameOverallStatusText(overallStatus.value))

/* 状态色的语义直接沿用 Tone：success / warning / danger / info 四个值与 el-tag 的
   `type` 同名同义，所以换 TTag 时只需要把 `:type` 改成 `:tone`，取值不动。
   这个值同时用作根元素的修饰类（realname-hero--{tone}），改名会连带改类名，所以保持原值。 */
const statusType = computed<Tone>(() => realnameOverallStatusTone(overallStatus.value))

const authTypeLabel = computed(() => {
  const t = current.value?.auth_type
  if (t === 'IDENTITY_CARD') return '个人'
  if (t === 'ENTERPRISE') return '企业'
  if (t === 'SOLE_PROPRIETOR') return '个体工商户'
  if (t === 'RESIDENCE_HK_MC') return '港澳居民'
  if (t === 'RESIDENCE_TAIWAN') return '台湾居民'
  return '未认证'
})

/** 当前主体是不是企业 / 个体工商户：决定抄「对公账户」还是「银行卡」的口径。 */
const isEnterpriseSubject = computed(() =>
  ['ENTERPRISE', 'SOLE_PROPRIETOR'].includes(current.value?.auth_type ?? ''),
)

/**
 * 渠道会员是否还在审核中。
 *
 * 企业会员开通对公收款要走渠道审核，这期间**实名认证早已通过**、但结算账户绑不上，
 * 所以这一格如实写「审核中」——写成「未设置」会让用户以为要自己再点一次绑定，
 * 而实际是渠道还没放行。会员可能在实名通过后或收款开户时创建，
 * `member_ready` 为真时不再显示审核中，下一步是绑定结算账户。
 *
 * 口径见 `@/shared/settleAccountStage`，与账户页那一份同源。
 */
const settleUnderReview = computed(() =>
  isSettleUnderReview(adapayMember.value?.onboardingStatus, adapayMember.value?.memberReady),
)

/**
 * 渠道已明确拒绝开通收款账户（企业开户审核未通过 / 审核通过但开户失败）。
 *
 * 后端把渠道 `audit_state` 翻成了 `onboarding_status = failed` 与一句中文原因
 * （`providerError`）。这一格的价值在于：实名认证是「已通过」的，但收款账户并没有开通，
 * 只说实名那一句会让用户以为钱能收了。
 * 口径见 `@/shared/settleAccountStage`。
 */
const settleRejected = computed(() => isSettleRejected(adapayMember.value?.onboardingStatus))

/**
 * 「结算账户」指标：渠道审核中写「审核中」，已绑卡写脱敏尾号。
 *
 * 判定用契约的 `accepts_settlement`（后端给「状态可用且号码齐备」的结论），
 * 卡号只回后四位，所以最多只能写到「尾号 1234」。
 */
const settleAccountText = computed(() => {
  if (adapayMember.value?.acceptsSettlement === true) {
    const tail = (adapayMember.value?.accountNoTail ?? '').trim()
    return tail ? `尾号 ${tail}` : '已设置'
  }
  if (settleRejected.value) return '未通过'
  if (settleUnderReview.value) return '审核中'
  return '未绑卡'
})

const heroDesc = computed(() => {
  if (overallStatus.value === 'verified') {
    return '已完成实名认证，信息核验通过，可正常使用合同签署等权益。'
  }
  if (overallStatus.value === 'reviewing') {
    if (current.value?.status === 'pending') {
      return '实名认证审核中，请耐心等待平台核验结果。'
    }
    if (settleRejected.value) {
      return isEnterpriseSubject.value
        ? '实名认证已通过，企业收款账户未通过渠道开户审核，暂时无法收取合同款——请到「认证管理」→「结算账户」查看原因并重新提交企业认证。'
        : '实名认证已通过，收款账户开通被渠道拒绝，暂时无法收取合同款——请到「认证管理」→「结算账户」查看原因后重新提交。'
    }
    return isEnterpriseSubject.value
      ? '实名认证已通过，企业收款账户正在渠道审核中，审核通过后即可绑定对公账户。'
      : '实名认证已通过，收款账户正在渠道审核中，审核通过后即可绑定银行卡。'
  }
  if (overallStatus.value === 'rejected') {
    return '实名认证未通过，请核对证件信息后重新提交。'
  }
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
        <TTag v-if="settleRejected" tone="danger">
          {{ isEnterpriseSubject ? '企业收款账户' : '收款账户' }}：渠道审核未通过
        </TTag>
        <TTag v-else-if="settleUnderReview" tone="warning">
          {{ isEnterpriseSubject ? '企业收款账户' : '收款账户' }}：渠道审核中
        </TTag>
      </div>
    </div>
    <div class="realname-hero__metrics">
      <div class="realname-metrics__item">
        <span>认证类型</span>
        <strong>{{ authTypeLabel }}</strong>
      </div>
      <div class="realname-metrics__item">
        <span>实名认证</span>
        <strong>{{ statusText }}</strong>
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
  /* R047：右列原为硬最小 300px，断点收到 640 后 641px 视口下左列只剩 252px。
     改成 220px 下限 —— 桌面视觉不变（0.85fr 仍占主导），窄屏时两侧都能呼吸。 */
  grid-template-columns: minmax(0, 1.15fr) minmax(220px, 0.85fr);
  gap: 24px;
  padding: 20px 24px;
  border-radius: 26px;
  border: 1px solid var(--73-border);
  /* 两团装饰性光晕没有对应的语义令牌（不是表面色也不是状态色），按原样保留；
     最底层那张半透明白卡走 --73-surface。 */
  background: var(--73-app-grad-soft-15), var(--73-app-grad-soft-14), var(--73-surface);
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

/* R047 断点收敛：原 860px → 640px（用户决定统一到 640）。
   原先这里两块分别写着「860px 塌主栅格」和「720px 塌指标栅格」，本轮一起收到 640，
   两块条件相同且相邻，按级联顺序合并成一块。 */
@media (max-width: 640px) {
  .realname-hero {
    grid-template-columns: 1fr;
    padding: 22px;
  }

  .realname-hero__metrics {
    grid-template-columns: 1fr;
  }
}
</style>

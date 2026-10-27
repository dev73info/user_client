<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Tone } from 'ui_73info'
import { TTag } from 'ui_73info'

import { getMyAdapayMember } from '@/api/adapay'
import { getMyRealnameVerification, type UserRealnameVerification } from '@/api/realname'
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
    providerError?: string | null
  } | null
}>()

const localVerification = ref<UserRealnameVerification | null>(null)
const localAdapayMember = ref<{
  onboardingStatus: string
  memberReady?: boolean
  acceptsSettlement?: boolean
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

/** 当前主体是不是企业 / 个体工商户：决定抄「对公账户」还是「银行卡」的口径。 */
const isEnterpriseSubject = computed(() =>
  ['ENTERPRISE', 'SOLE_PROPRIETOR'].includes(current.value?.auth_type ?? ''),
)

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
  // 这一格只回答**事实**：能不能收分账款。渠道审核中不等于已绑账户，也不等于「未设置」里有别的含义，
  // 所以不能收款就写「未绑卡」；审核状态由旁边的标签与描述承担。
  // 判定用契约的 `accepts_settlement`（后端给「状态可用且号码齐备」的结论），
  // 不再拿卡号尾数当结算账户号来判断。
  return adapayMember.value?.acceptsSettlement === true ? '已设置' : '未绑卡'
})

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

const heroDesc = computed(() => {
  if (current.value?.status === 'approved') {
    if (settleRejected.value) {
      return isEnterpriseSubject.value
        ? '已完成实名认证，信息核验通过，可正常使用合同签署等权益。企业收款账户未通过渠道开户审核，暂时无法收取合同款——请到「认证管理」→「结算账户」查看原因并重新提交企业认证。'
        : '已完成实名认证，信息核验通过，可正常使用合同签署等权益。收款账户开通被渠道拒绝，暂时无法收取合同款——请到「认证管理」→「结算账户」查看原因后重新提交。'
    }
    return settleUnderReview.value
      ? isEnterpriseSubject.value
        ? '已完成实名认证，信息核验通过，可正常使用合同签署等权益。企业收款账户正在渠道审核中，审核通过后即可绑定对公账户。'
        : '已完成实名认证，信息核验通过，可正常使用合同签署等权益。收款账户正在渠道审核中，审核通过后即可绑定银行卡。'
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

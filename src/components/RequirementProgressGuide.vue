<script setup lang="ts">
import { computed } from 'vue'
import type { RequirementStatus } from '@/api/requirements'
import type { ContractSigningStatus } from '@/shared/contracts'

type ViewMode = 'creator' | 'dev'
const props = defineProps<{
  requirement: {
    requirement_id: string
    title: string
    status: RequirementStatus
    budget?: number | null
    bound_resource_id?: number | null
    bound_resource_version_count?: number | null
    /** 排队中分账里最晚的计划分账时间（东八区 `YYYY-MM-DD HH24:MI:SS`），由后端给出。 */
    settlement_available_at?: string | null
  }
  paymentMode: 'self_managed' | 'platform_guarantee'
  contractStatus?: ContractSigningStatus | null
  view?: ViewMode
}>()

const view = computed(() => props.view ?? 'creator')
const isSelfManaged = computed(() => props.paymentMode === 'self_managed')
const hasBudget = computed(() => (props.requirement.budget ?? 0) > 0)
const isContractSigned = computed(
  () =>
    isSelfManaged.value ||
    Boolean(
      props.contractStatus?.has_contract &&
      props.contractStatus.party_a_signed &&
      props.contractStatus.party_b_signed,
    ),
)

type Step = { key: string; title: string; desc: string; rank: number }
type StepDefinition = Omit<Step, 'rank'>

// 需求者视角：
// 无担保模式：审核 → 开发与验收 → 已完成（无合同、无预算缴纳）
// 担保模式：审核 → 签署合同 → 预算缴纳 → 开发与验收 → 已完成
const creatorSteps = computed<Step[]>(() => {
  const titles: StepDefinition[] = [
    { key: 'review', title: '审核', desc: '提交需求等待平台审核' },
  ] as Array<{ key: string; title: string; desc: string }>

  // 仅担保模式需要签署合同；无担保模式直接进入开发与验收
  if (!isSelfManaged.value) {
    titles.push({ key: 'contract', title: '签署合同', desc: '客户和开发者签署双方合同' })
  }

  // 仅平台担保且有预算时展示预算缴纳；零预算自动跳过
  if (!isSelfManaged.value && hasBudget.value) {
    titles.push({ key: 'deposit', title: '预算缴纳', desc: '支付定金锁定需求' })
  }

  titles.push(
    { key: 'develop', title: '开发与验收', desc: '开发交付并完成验收' },
    { key: 'done', title: '已完成', desc: '需求完成可评价' },
  )

  return titles.map((item, index) => ({ ...item, rank: index }))
})

/**
 * 结算倒计时（天）：只在「尾款已缴、等渠道分账」这一段有意义。
 *
 * 计划分账时间由后端给出（`settlement_available_at`，取自 `adapay_escrow_settlement.available_at`），
 * 天数在这里换算——等待期是后台可改的配置，前端不猜天数，配置一改也不会算错。
 * 时间串与全站其它 `_at` 字段同口径（东八区），按本地时间解析，与 `formatCnDateTime` 一致。
 */
const settlementDaysLeft = computed(() => {
  if (props.requirement.status !== 'pending_settlement') {
    return null
  }
  const availableAt = props.requirement.settlement_available_at
  if (!availableAt) {
    return null
  }
  const target = new Date(availableAt).getTime()
  if (Number.isNaN(target)) {
    return null
  }
  return Math.ceil((target - Date.now()) / 86_400_000)
})

/** 「结算」这一步的副标题：排队中给倒计时，其余情况仍是这一步要做什么。 */
const settlementStepDesc = computed(() => {
  const days = settlementDaysLeft.value
  if (days == null) {
    return '完成结算与评价'
  }
  return days > 0 ? `还有 ${days} 天完成结算` : '等待渠道分账完成'
})

// 开发者视角
const devSteps = computed<Step[]>(() => {
  const stepDefinitions: StepDefinition[] = [
    { key: 'bind', title: '接单', desc: '关联资源项目接取需求' },
  ]

  // 仅担保模式需要签合同并等待需求方支付定金；无担保模式接单后直接开发
  if (!isSelfManaged.value) {
    stepDefinitions.push({ key: 'contract', title: '签合同', desc: '客户和开发者签署双方合同' })
    if (hasBudget.value) {
      stepDefinitions.push({ key: 'deposit', title: '等定金', desc: '需求方缴纳定金后开始开发' })
    }
  }

  stepDefinitions.push(
    { key: 'develop', title: '开发', desc: '开发并发布资源版本' },
    { key: 'final', title: '交付', desc: '交付成果等待验收' },
    { key: 'done', title: '结算', desc: settlementStepDesc.value },
  )

  return stepDefinitions.map((item, index) => ({ ...item, rank: index }))
})

const steps = computed(() => (view.value === 'dev' ? devSteps.value : creatorSteps.value))

// 需求状态 → 生命周期阶段（需求者视角）
// 担保模式：0=审核 1=签署合同 2=预算缴纳 3=开发与验收 4=已完成
// 无担保模式：0=审核 1=开发与验收 2=已完成（无预算缴纳、无合同）
const currentStepKey = computed(() => {
  const status = props.requirement.status

  if (isSelfManaged.value) {
    if (status === 'pending_review' || status === 'rejected') {
      return 'review'
    }
    if (status === 'pending_final' && view.value === 'dev') {
      return 'final'
    }
    if (status === 'completed') {
      return 'done'
    }
    return 'develop'
  }

  switch (status) {
    case 'pending_review':
    case 'rejected':
      return 'review'
    case 'pending_deposit':
      return isContractSigned.value ? (hasBudget.value ? 'deposit' : 'develop') : 'contract'
    case 'deposit_paid':
      if (!isContractSigned.value) {
        return hasBudget.value ? 'deposit' : 'contract'
      }
      return 'develop'
    case 'in_development':
      return 'develop'
    case 'pending_final':
      return view.value === 'dev' ? 'final' : 'develop'
    // 待分账已过「开发与验收」，只剩渠道分账没落地：停在最后一个阶段（结单/结算）的进行中态。
    // ponytail: 不新增独立阶段，避免改动两套步骤列表与 rank 计算；这一步的副标题会写「还有 N 天完成结算 /
    // 等待渠道分账完成」，需求方那侧另有状态徽标写明「待分账」。
    case 'pending_settlement':
      return 'done'
    case 'completed':
      return 'done'
    default:
      return 'review'
  }
})

const currentRank = computed(() => {
  return steps.value.find((step) => step.key === currentStepKey.value)?.rank ?? 0
})

function isStepDone(step: Step): boolean {
  return step.rank < currentRank.value
}

function isStepCurrent(step: Step): boolean {
  return step.rank === currentRank.value
}
</script>

<template>
  <!-- 进度条只画步骤：需求和需求编号由外层需求卡片自己展示，这里再重复一遍纯属占地方。 -->
  <div class="req-progress">
    <ol class="req-progress__steps">
      <li
        v-for="(step, index) in steps"
        :key="step.key"
        class="req-progress__step"
        :class="{
          'is-done': isStepDone(step),
          'is-current': isStepCurrent(step),
        }"
      >
        <span class="req-progress__dot" aria-hidden="true">{{
          isStepDone(step) ? '✓' : index + 1
        }}</span>
        <div class="req-progress__copy">
          <span class="req-progress__step-title">{{ step.title }}</span>
          <span class="req-progress__step-desc">{{ step.desc }}</span>
        </div>
        <span
          v-if="index < steps.length - 1"
          class="req-progress__connector"
          aria-hidden="true"
        ></span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.req-progress {
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--73-ink-placeholder) 24%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--73-surface-strong) 72%, transparent);
}

.req-progress__steps {
  display: flex;
  align-items: flex-start;
  margin: 0;
  padding: 0;
  list-style: none;
}

.req-progress__step {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  min-width: 0;
}

.req-progress__dot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  background: var(--dev-line);
  color: var(--dev-muted);
  border: 2px solid transparent;
  transition: all 0.2s ease;
  z-index: 1;
}

.req-progress__step.is-done .req-progress__dot {
  background: var(--dev-cyan);
  color: var(--73-surface-strong);
}

.req-progress__step.is-current .req-progress__dot {
  background: var(--73-surface-strong);
  color: var(--dev-cyan);
  border-color: var(--dev-cyan);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--73-success) 14%, transparent);
}

.req-progress__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.req-progress__step-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--dev-ink-soft);
}

.req-progress__step.is-done .req-progress__step-title,
.req-progress__step.is-current .req-progress__step-title {
  color: var(--dev-ink);
}

.req-progress__step-desc {
  font-size: 11px;
  color: var(--dev-muted);
  line-height: 1.4;
}

.req-progress__connector {
  position: absolute;
  top: 13px;
  left: calc(50% + 16px);
  right: calc(-50% + 16px);
  height: 2px;
  background: var(--dev-line);
}

.req-progress__step.is-done .req-progress__connector,
.req-progress__step.is-current .req-progress__connector {
  background: var(--dev-cyan);
}

/* R047 断点收敛：原档位 720px → 640px */
@media (max-width: 640px) {
  .req-progress__steps {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }

  .req-progress__step {
    flex-direction: row;
    text-align: left;
    gap: 10px;
  }

  .req-progress__connector {
    display: none;
  }
}
</style>

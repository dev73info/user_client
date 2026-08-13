<script setup lang="ts">
import { computed } from 'vue'
import type { RequirementStatus } from '@/api/requirements'

type ViewMode = 'creator' | 'dev'

const props = defineProps<{
  requirement: {
    requirement_id: string
    title: string
    status: RequirementStatus
    budget?: number | null
    bound_resource_id?: number | null
    bound_resource_version_count?: number | null
    pending_unbind_request?: { status: string; initiator: string } | null
  }
  paymentMode: 'self_managed' | 'platform_guarantee'
  view?: ViewMode
}>()

const view = computed(() => props.view ?? 'creator')
const isSelfManaged = computed(() => props.paymentMode === 'self_managed')
const hasBudget = computed(() => (props.requirement.budget ?? 0) > 0)

type Step = { key: string; title: string; desc: string; rank: number }

// 需求者视角：审核 → 预算缴纳（零预算自动跳过）→ 签署合同 → 开发与验收 → 已完成
const creatorSteps = computed<Step[]>(() => {
  const titles = [
    { key: 'review', title: '审核', desc: '提交需求等待平台审核' },
  ] as Array<{ key: string; title: string; desc: string }>

  // 仅平台担保且有预算时展示预算缴纳；零预算自动跳过
  if (!isSelfManaged.value && hasBudget.value) {
    titles.push({ key: 'deposit', title: '预算缴纳', desc: '支付定金锁定需求' })
  }

  titles.push(
    { key: 'contract', title: '签署合同', desc: '双方签署需求开发合同' },
    { key: 'develop', title: '开发与验收', desc: '开发交付并完成验收' },
    { key: 'done', title: '已完成', desc: '需求完成可评价' },
  )

  return titles.map((item, index) => ({ ...item, rank: index }))
})

// 开发者视角
const devSteps = computed<Step[]>(() => {
  return [
    { key: 'bind', title: '接单', desc: '关联资源项目接取需求', rank: 0 },
    { key: 'contract', title: '签合同', desc: '双方签署需求开发合同', rank: 1 },
    { key: 'develop', title: '开发', desc: '开发并发布资源版本', rank: 2 },
    { key: 'final', title: '交付', desc: '交付成果等待验收', rank: 3 },
    { key: 'done', title: '结算', desc: '完成结算与评价', rank: 4 },
  ]
})

const steps = computed(() => (view.value === 'dev' ? devSteps.value : creatorSteps.value))

// 需求状态 → 生命周期阶段（需求者视角）
// 0=审核 1=预算缴纳 2=签署合同 3=开发与验收 4=已完成
// 无预算缴纳步骤时，后续阶段整体前移 1 位
const hasDepositPhase = computed(() => !isSelfManaged.value && hasBudget.value)

const currentRank = computed(() => {
  const status = props.requirement.status
  let phase: number
  switch (status) {
    case 'pending_review':
    case 'rejected':
      phase = 0
      break
    case 'pending_deposit':
      phase = 1
      break
    case 'deposit_paid':
      phase = 2
      break
    case 'in_development':
    case 'pending_final':
      phase = 3
      break
    case 'final_paid':
    case 'completed':
      phase = 4
      break
    default:
      phase = 0
  }

  // 无预算缴纳阶段时，deposit 之后的所有阶段前移一位
  if (!hasDepositPhase.value && phase >= 1) {
    phase -= 1
  }
  return phase
})

function isStepDone(step: Step): boolean {
  return step.rank < currentRank.value
}

function isStepCurrent(step: Step): boolean {
  return step.rank === currentRank.value
}

const hasPendingUnbind = computed(() => props.requirement.pending_unbind_request?.status === 'pending')
</script>

<template>
  <div class="req-progress" :class="{ 'req-progress--unbind': hasPendingUnbind }">
    <div class="req-progress__head">
      <div>
        <strong class="req-progress__title">{{ requirement.title }}</strong>
        <span class="req-progress__id">{{ requirement.requirement_id }}</span>
      </div>
      <span v-if="hasPendingUnbind" class="req-progress__badge">解除申请处理中</span>
    </div>
    <ol class="req-progress__steps">
      <li v-for="(step, index) in steps" :key="step.key" class="req-progress__step"
        :class="{
          'is-done': isStepDone(step),
          'is-current': isStepCurrent(step),
        }">
        <span class="req-progress__dot" aria-hidden="true">{{ isStepDone(step) ? '✓' : index + 1 }}</span>
        <div class="req-progress__copy">
          <span class="req-progress__step-title">{{ step.title }}</span>
          <span class="req-progress__step-desc">{{ step.desc }}</span>
        </div>
        <span v-if="index < steps.length - 1" class="req-progress__connector" aria-hidden="true"></span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.req-progress {
  padding: 14px 16px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
}

.req-progress--unbind {
  border-color: rgba(185, 129, 43, 0.4);
  background: rgba(255, 251, 244, 0.88);
}

.req-progress__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.req-progress__title {
  font-size: 13px;
  font-weight: 700;
  color: #1f2937;
  margin-right: 8px;
}

.req-progress__id {
  font-size: 11px;
  color: #94a3b8;
}

.req-progress__badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: #b45309;
  background: rgba(185, 129, 43, 0.12);
  border-radius: 999px;
  padding: 3px 10px;
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
  background: #e2e8f0;
  color: #64748b;
  border: 2px solid transparent;
  transition: all 0.2s ease;
  z-index: 1;
}

.req-progress__step.is-done .req-progress__dot {
  background: #2aa6a4;
  color: #fff;
}

.req-progress__step.is-current .req-progress__dot {
  background: #fff;
  color: #247f7d;
  border-color: #2aa6a4;
  box-shadow: 0 0 0 4px rgba(42, 166, 164, 0.14);
}

.req-progress__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.req-progress__step-title {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
}

.req-progress__step.is-done .req-progress__step-title,
.req-progress__step.is-current .req-progress__step-title {
  color: #1f2937;
}

.req-progress__step-desc {
  font-size: 10px;
  color: #94a3b8;
  line-height: 1.4;
}

.req-progress__connector {
  position: absolute;
  top: 13px;
  left: calc(50% + 16px);
  right: calc(-50% + 16px);
  height: 2px;
  background: #e2e8f0;
}

.req-progress__step.is-done .req-progress__connector,
.req-progress__step.is-current .req-progress__connector {
  background: #2aa6a4;
}

@media (max-width: 720px) {
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

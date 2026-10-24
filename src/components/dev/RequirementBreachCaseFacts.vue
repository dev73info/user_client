<script setup lang="ts">
import type { AdapayBreachCase } from '@/api/adapay'
import { breachStatusLabel } from '@/shared/breachStatus'
import {
  breachDecisionText,
  breachLiablePartyLabel,
  breachVerdictSourceText,
  showBreachDecisions,
} from '@/shared/requirementBreach'
import { formatCnDateTime } from '@/shared/requirementDisplay'
import { TDescriptions, TDescriptionsItem } from 'ui_73info'

/**
 * 解除合作案件的**只读事实表**：编号、状态、责任认定、资金处理、双方表态……
 *
 * 从 `RequirementBreachDialog` 里单独拆出来只为守住 400 行预算：这张表只渲染不入账、
 * 不发请求、不 emit，与弹窗里的协商 / 表态 / 撤回三段动作没有耦合。
 * 逐条口径一个没改（空值那几行照旧不出行），搬动时别顺手合并措辞。
 *
 * 「我方」按调用侧的身份算：本页是开发者视角，`developerDecision` 是我方表态。
 */
defineProps<{
  breachCase: AdapayBreachCase
  /** 上一轮撤回人是不是本人（「申请人」那一行写「我方」还是「对方」）。 */
  withdrawnByMe: boolean
}>()
</script>

<template>
  <TDescriptions :column="1" border size="sm">
    <TDescriptionsItem label="案件编号">{{ breachCase.caseNo }}</TDescriptionsItem>
    <TDescriptionsItem label="当前状态">
      {{ breachStatusLabel(breachCase.status) }}
    </TDescriptionsItem>
    <TDescriptionsItem v-if="breachCase.status === 'withdrawn'" label="申请人">
      {{ withdrawnByMe ? '我方' : '对方' }}
    </TDescriptionsItem>
    <TDescriptionsItem
      v-if="breachCase.status === 'withdrawn' && breachCase.resolvedAt"
      label="撤回时间"
    >
      {{ formatCnDateTime(breachCase.resolvedAt) }}
    </TDescriptionsItem>
    <TDescriptionsItem v-if="breachCase.liableParty" label="责任认定">
      {{ breachLiablePartyLabel(breachCase.liableParty) }}
    </TDescriptionsItem>
    <TDescriptionsItem label="申请理由">{{ breachCase.reason }}</TDescriptionsItem>
    <TDescriptionsItem v-if="breachCase.aiJudgedAt || breachCase.aiReasoning" label="AI 判定">
      {{
        breachCase.aiLiableParty
          ? breachLiablePartyLabel(breachCase.aiLiableParty)
          : '无法判定，已转客服人工判定'
      }}
    </TDescriptionsItem>
    <TDescriptionsItem v-if="breachCase.aiJudgedAt" label="判定时间">
      {{ formatCnDateTime(breachCase.aiJudgedAt) }}
    </TDescriptionsItem>
    <TDescriptionsItem v-if="breachCase.aiReasoning" label="判定理由">
      {{ breachCase.aiReasoning }}
    </TDescriptionsItem>
    <TDescriptionsItem v-if="breachCase.decisionDeadlineAt" label="表态截止">
      {{ formatCnDateTime(breachCase.decisionDeadlineAt) }}
    </TDescriptionsItem>
    <TDescriptionsItem v-if="showBreachDecisions(breachCase)" label="我方表态">
      {{ breachDecisionText(breachCase.developerDecision) }}
    </TDescriptionsItem>
    <TDescriptionsItem v-if="showBreachDecisions(breachCase)" label="对方表态">
      {{ breachDecisionText(breachCase.customerDecision) }}
    </TDescriptionsItem>
    <TDescriptionsItem label="资金处理">
      定金 ¥{{ breachCase.depositAmountCny }} · 已退尾款 ¥{{ breachCase.refundAmountCny }} · 赔付
      ¥{{ breachCase.compensationAmountCny
      }}<template v-if="breachCase.extraCompensationFen > 0">
        · 额外赔偿 ¥{{ breachCase.extraCompensationCny }}</template
      >
    </TDescriptionsItem>
    <TDescriptionsItem v-if="breachCase.verdictSource" label="判定来源">
      {{ breachVerdictSourceText(breachCase.verdictSource) }}
    </TDescriptionsItem>
    <TDescriptionsItem v-if="breachCase.resolutionNote" label="处理说明">
      {{ breachCase.resolutionNote }}
    </TDescriptionsItem>
  </TDescriptions>
</template>
